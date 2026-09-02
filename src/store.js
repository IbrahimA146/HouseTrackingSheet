// ---------------------------------------------------------------------------
// store.js: the only file that talks to Firebase.
//
// AUTH MODEL
//   Each house is one Firebase Authentication account:
//     risale@maneviyat.app, grand@maneviyat.app, ...
//   The house password IS that account's password, so Firebase verifies it
//   server-side. Get it wrong and you never receive a token, which means the
//   security rules never let you read that house's entries. That is the real
//   lock on the door.
//
//   Which housemate you then say you are is a UI choice, not a security
//   boundary, since you are already inside a house you hold the password to.
//
//   The Ev Abi password is a second gate on top, checked against a PBKDF2 hash
//   (see crypto.js). It guards the two Ev Abi powers: changing the house
//   password, and deleting a housemate's entry.
//
// PRIVACY MODEL
//   entries/*    readable only by the house that wrote them.
//   standings/*  totals only, no member detail, readable by every house.
//                  This is what lets you see your rank without seeing anyone
//                  else's numbers.
// ---------------------------------------------------------------------------

import {
  firebaseConfig, HOUSES, AUTH_DOMAIN, PASSWORD_SUFFIX, MIN_PASSWORD_LENGTH,
  DEFAULT_EV_ABI_PASSWORD, DEMO_HOUSE_PASSWORD
} from "./config.js";
import { hashPassword, verifyPassword } from "./crypto.js";
import { houseStanding, scoreOf } from "./scoring.js";

export const isDemo = String(firebaseConfig.apiKey || "").startsWith("PASTE_");

const emailFor = houseId => `${houseId}@${AUTH_DOMAIN}`;

// Firebase rejects anything under 6 characters, and the house passwords are
// shorter than that on purpose so they stay easy to say out loud. Every typed
// password gets the suffix added here, in one place, so sign-in, setup and
// password changes can never disagree about it.
const toFirebasePassword = typed => `${typed}${PASSWORD_SUFFIX}`;

// Loaded lazily so demo mode never fetches the Firebase SDK at all.
let fb = null;

async function loadFirebase() {
  if (fb) return fb;
  const V = "10.12.2";
  const [appMod, authMod, dbMod] = await Promise.all([
    import(`https://www.gstatic.com/firebasejs/${V}/firebase-app.js`),
    import(`https://www.gstatic.com/firebasejs/${V}/firebase-auth.js`),
    import(`https://www.gstatic.com/firebasejs/${V}/firebase-firestore.js`)
  ]);
  const app = appMod.initializeApp(firebaseConfig);
  fb = {
    auth: authMod.getAuth(app),
    db: dbMod.getFirestore(app),
    ...authMod, ...dbMod
  };
  return fb;
}

// ---------------------------------------------------------------------------
// Errors the UI knows how to phrase
// ---------------------------------------------------------------------------
export class StoreError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

const AUTH_MESSAGES = {
  "auth/invalid-credential": "Wrong house password.",
  "auth/wrong-password": "Wrong house password.",
  "auth/user-not-found": "This house hasn’t been set up in Firebase yet.",
  "auth/invalid-email": "This house hasn’t been set up in Firebase yet.",
  "auth/too-many-requests": "Too many tries. Wait a minute, then try again.",
  "auth/network-request-failed": "No connection. Check your internet.",
  "auth/weak-password": "Password must be at least 6 characters.",
  "auth/requires-recent-login": "Please sign out and back in, then change it."
};

// ===========================================================================
// DEMO BACKEND: pure in-memory, so the whole app is usable with no setup.
// ===========================================================================
// Every house starts at zero. No sample numbers, so what you see before going
// live is exactly what everyone sees on the 1st of the month.
const demo = {
  entries: [],
  evAbiHash: null,
  housePasswords: Object.fromEntries(HOUSES.map(h => [h.id, DEMO_HOUSE_PASSWORD])),
  listeners: new Set(),
  session: null
};

const demoNotify = () => demo.listeners.forEach(fn => fn());

// Demo mode has no server, so anything the setup wizard sets would vanish on
// reload. Keeping it in localStorage makes demo mode behave like the real
// thing while you are still trying the app out.
const DEMO_KEY = "maneviyat-demo";

function demoSave() {
  try {
    localStorage.setItem(DEMO_KEY, JSON.stringify({
      housePasswords: demo.housePasswords,
      evAbiHash: demo.evAbiHash,
      entries: demo.entries
    }));
  } catch { /* storage blocked; demo state just won't survive a reload */ }
}

(function demoLoad() {
  try {
    const raw = localStorage.getItem(DEMO_KEY);
    if (!raw) return;
    const saved = JSON.parse(raw);
    if (saved.housePasswords) Object.assign(demo.housePasswords, saved.housePasswords);
    if (saved.evAbiHash) demo.evAbiHash = saved.evAbiHash;
    if (Array.isArray(saved.entries)) demo.entries = saved.entries;
  } catch { /* unreadable, start fresh */ }
})();

// ===========================================================================
// Session
// ===========================================================================
const SESSION_KEY = "maneviyat-session";
let session = null;   // { houseId, member, evAbi }

export function getSession() {
  if (session) return session;
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (raw) session = JSON.parse(raw);
  } catch { /* private mode, or storage disabled */ }
  return session;
}

function saveSession(s) {
  session = s;
  try {
    if (s) localStorage.setItem(SESSION_KEY, JSON.stringify(s));
    else localStorage.removeItem(SESSION_KEY);
  } catch { /* nothing we can do; the session just won't survive a reload */ }
}

/**
 * Restore a previous visit. Firebase keeps its own auth token alive, so a
 * returning member usually walks straight back in.
 */
export async function resumeSession() {
  const s = getSession();
  if (!s) return null;
  if (isDemo) { demo.session = s; return s; }

  const f = await loadFirebase();
  await f.setPersistence(f.auth, f.browserLocalPersistence).catch(() => {});
  const user = f.auth.currentUser || await new Promise(resolve => {
    const stop = f.onAuthStateChanged(f.auth, u => { stop(); resolve(u); });
  });
  if (!user || user.email !== emailFor(s.houseId)) { saveSession(null); return null; }
  return s;
}

// ===========================================================================
// Signing in
// ===========================================================================
export async function signInHouse(houseId, password) {
  if (isDemo) {
    if (password !== demo.housePasswords[houseId]) {
      throw new StoreError("bad-password", "Wrong house password.");
    }
    return;
  }
  const f = await loadFirebase();
  try {
    await f.setPersistence(f.auth, f.browserLocalPersistence);
    await f.signInWithEmailAndPassword(f.auth, emailFor(houseId), toFirebasePassword(password));
  } catch (err) {
    throw new StoreError(err.code, AUTH_MESSAGES[err.code] || "Could not sign in.");
  }
}

/** Ev Abi second gate. Assumes the house password already passed. */
export async function verifyEvAbi(password) {
  const stored = await loadEvAbiHash();
  if (stored) return verifyPassword(password, stored);
  // Nothing stored yet, so fall back to the default from config.js.
  return password === DEFAULT_EV_ABI_PASSWORD;
}

async function loadEvAbiHash() {
  if (isDemo) return demo.evAbiHash;
  const f = await loadFirebase();
  try {
    const snap = await f.getDoc(f.doc(f.db, "config", "gate"));
    return snap.exists() ? (snap.data().evAbiHash || null) : null;
  } catch {
    return null;
  }
}

export function completeSignIn(houseId, member, evAbi) {
  const s = { houseId, member, evAbi: !!evAbi };
  saveSession(s);
  if (isDemo) demo.session = s;
  return s;
}

export async function signOutSession() {
  saveSession(null);
  if (isDemo) { demo.session = null; return; }
  const f = await loadFirebase();
  await f.signOut(f.auth).catch(() => {});
}

// ===========================================================================
// Entries, private to one house
// ===========================================================================
export function watchHouseEntries(houseId, month, cb) {
  if (isDemo) {
    const emit = () => cb(demo.entries.filter(e => e.houseId === houseId && e.month === month));
    demo.listeners.add(emit);
    emit();
    return () => demo.listeners.delete(emit);
  }

  let stop = () => {};
  let cancelled = false;
  loadFirebase().then(f => {
    if (cancelled) return;
    // Two equality filters need no composite index in Firestore.
    const q = f.query(
      f.collection(f.db, "entries"),
      f.where("houseId", "==", houseId),
      f.where("month", "==", month)
    );
    stop = f.onSnapshot(q, snap => {
      cb(snap.docs.map(d => ({
        id: d.id, ...d.data(),
        createdAt: d.data().createdAt?.toMillis?.() ?? Date.now()
      })));
    }, err => console.error("entries listener:", err));
  });
  return () => { cancelled = true; stop(); };
}

export async function addEntry({ houseId, member, month, category, amount, note }) {
  const row = { houseId, member, month, category, amount, note: note || "" };
  if (isDemo) {
    demo.entries.push({ ...row, id: `d${Date.now()}`, createdAt: Date.now() });
    demoSave();
    demoNotify();
    return;
  }
  const f = await loadFirebase();
  await f.addDoc(f.collection(f.db, "entries"), { ...row, createdAt: f.serverTimestamp() });
}

export async function deleteEntry(id) {
  if (isDemo) {
    demo.entries = demo.entries.filter(e => e.id !== id);
    demoSave();
    demoNotify();
    return;
  }
  const f = await loadFirebase();
  await f.deleteDoc(f.doc(f.db, "entries", id));
}

// ===========================================================================
// Standings: totals only, shared between houses
// ===========================================================================
const standingId = (month, houseId) => `${month}_${houseId}`;

/**
 * Publish this house's totals so the other houses can be ranked against it.
 * Deliberately contains no member names or per-member numbers.
 */
export async function publishStanding(month, standing) {
  const row = {
    month,
    houseId: standing.houseId,
    totals: standing.totals,
    qualified: standing.qualified,
    memberCount: standing.memberCount,
    score: Number(standing.score.toFixed(2)),
    updatedAt: Date.now()
  };
  if (isDemo) { demo.standings ||= {}; demo.standings[standingId(month, row.houseId)] = row; demoNotify(); return; }
  const f = await loadFirebase();
  await f.setDoc(f.doc(f.db, "standings", standingId(month, row.houseId)), row, { merge: true });
}

export function watchStandings(month, cb) {
  if (isDemo) {
    const emit = () => {
      // Derive every house's public record straight from the demo entries.
      const recs = HOUSES.map(h => {
        const st = houseStanding(h, demo.entries.filter(e => e.houseId === h.id && e.month === month), month);
        return {
          month, houseId: h.id, totals: st.totals,
          qualified: st.qualified, memberCount: st.memberCount, score: st.score
        };
      });
      cb(recs);
    };
    demo.listeners.add(emit);
    emit();
    return () => demo.listeners.delete(emit);
  }

  let stop = () => {};
  let cancelled = false;
  loadFirebase().then(f => {
    if (cancelled) return;
    const q = f.query(f.collection(f.db, "standings"), f.where("month", "==", month));
    stop = f.onSnapshot(q, snap => cb(snap.docs.map(d => d.data())),
      err => console.error("standings listener:", err));
  });
  return () => { cancelled = true; stop(); };
}

/** Past months, newest first. Powers the automatic history view. */
export async function loadHistory(months) {
  if (isDemo) {
    return months.map(m => ({ month: m, records: [] }));
  }
  const f = await loadFirebase();
  const out = [];
  for (const m of months) {
    const q = f.query(f.collection(f.db, "standings"), f.where("month", "==", m));
    const snap = await f.getDocs(q);
    out.push({ month: m, records: snap.docs.map(d => d.data()) });
  }
  return out;
}

// ===========================================================================
// First-time setup
//
// Creates the five house logins straight from the browser, so nobody has to
// touch the Firebase console. Each house becomes a Firebase Authentication
// account whose password is the house password.
// ===========================================================================

/**
 * Create the five house accounts.
 * `passwords` is { houseId: password }. Returns a per-house result so the
 * screen can show exactly what happened, including houses that already
 * existed, which is not an error.
 */
export async function initializeHouses(passwords, newEvAbiPassword) {
  const results = [];

  if (isDemo) {
    for (const h of HOUSES) {
      const pw = passwords[h.id];
      if (!pw || pw.length < MIN_PASSWORD_LENGTH) {
        results.push({ houseId: h.id, name: h.name, ok: false,
                       message: `Needs ${MIN_PASSWORD_LENGTH}+ characters` });
        continue;
      }
      demo.housePasswords[h.id] = pw;
      results.push({ houseId: h.id, name: h.name, ok: true, message: "Created" });
    }
    if (newEvAbiPassword) demo.evAbiHash = await hashPassword(newEvAbiPassword);
    demo.initialized = true;
    demoSave();
    return results;
  }

  const f = await loadFirebase();
  await f.setPersistence(f.auth, f.browserLocalPersistence).catch(() => {});

  for (const h of HOUSES) {
    const pw = passwords[h.id];
    if (!pw || pw.length < MIN_PASSWORD_LENGTH) {
      results.push({ houseId: h.id, name: h.name, ok: false,
                     message: `Needs ${MIN_PASSWORD_LENGTH}+ characters` });
      continue;
    }
    try {
      await f.createUserWithEmailAndPassword(f.auth, emailFor(h.id), toFirebasePassword(pw));
      results.push({ houseId: h.id, name: h.name, ok: true, message: "Created" });
    } catch (err) {
      if (err.code === "auth/email-already-in-use") {
        results.push({
          houseId: h.id, name: h.name, ok: true, existed: true,
          message: "Already set up. Its Ev Abi can change the password in the app"
        });
      } else {
        results.push({
          houseId: h.id, name: h.name, ok: false,
          message: AUTH_MESSAGES[err.code] || err.code || "Failed"
        });
      }
    }
  }

  // createUser leaves us signed in as the last house created, which is exactly
  // the permission we need to write the shared config documents.
  if (f.auth.currentUser) {
    try {
      if (newEvAbiPassword) {
        await f.setDoc(f.doc(f.db, "config", "gate"),
          { evAbiHash: await hashPassword(newEvAbiPassword) }, { merge: true });
      }
      await f.setDoc(f.doc(f.db, "config", "setup"),
        { initialized: true, at: Date.now() }, { merge: true });
    } catch (err) {
      console.error("could not write setup docs:", err);
    }
    // Don't leave the organiser signed in as whichever house happened to be last.
    await f.signOut(f.auth).catch(() => {});
  }

  saveSession(null);
  return results;
}

/** Has setup already been run? Used only to nudge, never to block. */
export async function isInitialized() {
  if (isDemo) return !!demo.initialized;
  try {
    const f = await loadFirebase();
    // Signing in is what proves an account exists; a plain read needs auth.
    // Instead we look for the marker doc, which is readable only when signed
    // in, so an unauthenticated check simply returns "unknown".
    const snap = await f.getDoc(f.doc(f.db, "config", "setup"));
    return snap.exists() && snap.data().initialized === true;
  } catch {
    return null;   // unknown, we're not signed in, which is the normal case
  }
}

// ===========================================================================
// Ev Abi powers
// ===========================================================================
export async function setHousePassword(newPassword) {
  if (newPassword.length < MIN_PASSWORD_LENGTH) {
    throw new StoreError("weak",
      `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
  }
  if (isDemo) {
    demo.housePasswords[getSession().houseId] = newPassword;
    demoSave();
    return;
  }
  const f = await loadFirebase();
  if (!f.auth.currentUser) throw new StoreError("no-user", "Sign in again first.");
  try {
    await f.updatePassword(f.auth.currentUser, toFirebasePassword(newPassword));
  } catch (err) {
    throw new StoreError(err.code, AUTH_MESSAGES[err.code] || "Could not change the password.");
  }
}

export async function setEvAbiPassword(newPassword) {
  if (newPassword.length < 4) {
    throw new StoreError("weak", "Password must be at least 4 characters.");
  }
  const hash = await hashPassword(newPassword);
  if (isDemo) { demo.evAbiHash = hash; demoSave(); return; }
  const f = await loadFirebase();
  await f.setDoc(f.doc(f.db, "config", "gate"), { evAbiHash: hash }, { merge: true });
}

export { scoreOf };
