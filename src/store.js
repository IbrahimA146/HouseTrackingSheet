// ---------------------------------------------------------------------------
// store.js: the only file that talks to Firebase.
//
// ACCESS MODEL
//   There is no sign-in of any kind. Open the page, pick a house, pick your
//   name, you are in. The app signs in to Firebase anonymously purely so
//   Firestore has an identity to attach rules to; nobody is ever prompted.
//
//   So anyone with the link can read everything and log anything. The rules
//   keep the data well-formed, not private. Treat the URL as semi-private.
//
// COLLECTIONS
//   houses/{id}      name, address, code, members[]. Editable from the app.
//   entries/{id}     one row per logged amount, tagged with house and member.
//   standings/{m_h}  per house per month totals, so months can be ranked later.
// ---------------------------------------------------------------------------

import { firebaseConfig, SEED_HOUSE } from "./config.js";
import { houseStanding } from "./scoring.js";

export const isDemo = String(firebaseConfig.apiKey || "").startsWith("PASTE_");

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
  fb = { auth: authMod.getAuth(app), db: dbMod.getFirestore(app), ...authMod, ...dbMod };
  return fb;
}

export class StoreError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

const AUTH_MESSAGES = {
  "auth/network-request-failed": "No connection. Check your internet.",
  "auth/too-many-requests": "Too many tries. Wait a minute, then try again.",
  "auth/operation-not-allowed":
    "Anonymous sign-in is switched off in Firebase. Turn it on under " +
    "Authentication, Sign-in method, Anonymous."
};

// ===========================================================================
// DEMO BACKEND: in-memory, used only when the Firebase keys are placeholders.
// ===========================================================================
const demo = { houses: [ { ...SEED_HOUSE } ], entries: [], listeners: new Set() };
const demoNotify = () => demo.listeners.forEach(fn => fn());

const DEMO_KEY = "maneviyat-demo";
function demoSave() {
  try {
    localStorage.setItem(DEMO_KEY,
      JSON.stringify({ houses: demo.houses, entries: demo.entries }));
  } catch { /* storage blocked; demo state just won't survive a reload */ }
}
(function demoLoad() {
  try {
    const saved = JSON.parse(localStorage.getItem(DEMO_KEY) || "null");
    if (saved?.houses?.length) demo.houses = saved.houses;
    if (Array.isArray(saved?.entries)) demo.entries = saved.entries;
  } catch { /* unreadable, start fresh */ }
})();

// ===========================================================================
// Who you said you are. Not a credential, just a convenience.
// ===========================================================================
const SESSION_KEY = "maneviyat-session";
let session = null;

export function getSession() {
  if (session) return session;
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (raw) session = JSON.parse(raw);
  } catch { /* private mode, or storage disabled */ }
  return session;
}

export function completeSignIn(houseId, member) {
  session = { houseId, member };
  try { localStorage.setItem(SESSION_KEY, JSON.stringify(session)); } catch {}
  return session;
}

export function clearSession() {
  session = null;
  try { localStorage.removeItem(SESSION_KEY); } catch {}
}

/**
 * Anonymous sign-in. No prompt, no account, no password. The token persists,
 * so the same browser keeps the same anonymous id.
 */
export async function ensureSignedIn() {
  if (isDemo) return;
  const f = await loadFirebase();
  if (f.auth.currentUser) return;
  try {
    await f.setPersistence(f.auth, f.browserLocalPersistence);
    await f.signInAnonymously(f.auth);
  } catch (err) {
    throw new StoreError(err.code, AUTH_MESSAGES[err.code] ||
      "Could not reach the database. Check your connection.");
  }
}

// ===========================================================================
// Houses
// ===========================================================================
export function watchHouses(cb) {
  if (isDemo) {
    const emit = () => cb([...demo.houses]);
    demo.listeners.add(emit);
    emit();
    return () => demo.listeners.delete(emit);
  }

  let stop = () => {};
  let cancelled = false;
  loadFirebase().then(f => {
    if (cancelled) return;
    stop = f.onSnapshot(f.collection(f.db, "houses"), async snap => {
      if (snap.empty) {
        // First run against a database that predates the houses collection.
        // Seeding is additive: it never touches entries that already exist.
        await seedFirstHouse().catch(err => console.error("seed failed:", err));
        return;
      }
      cb(snap.docs.map(d => ({ id: d.id, ...d.data() }))
                  .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0)));
    }, err => console.error("houses listener:", err));
  });
  return () => { cancelled = true; stop(); };
}

async function seedFirstHouse() {
  const f = await loadFirebase();
  await f.setDoc(f.doc(f.db, "houses", SEED_HOUSE.id),
    { ...SEED_HOUSE, createdAt: Date.now() }, { merge: true });
}

export async function saveHouse(house) {
  const id = String(house.id || "").trim().toLowerCase().replace(/[^a-z0-9_-]/g, "");
  if (!id) throw new StoreError("bad-id", "The house needs a short id, letters and numbers only.");
  if (!house.name?.trim()) throw new StoreError("bad-name", "The house needs a name.");
  if (!Array.isArray(house.members) || house.members.length === 0) {
    throw new StoreError("bad-members", "Add at least one member.");
  }

  const row = {
    id,
    code: (house.code || id.slice(0, 3)).toUpperCase().slice(0, 4),
    name: house.name.trim(),
    address: (house.address || "").trim(),
    members: house.members.map(m => m.trim()).filter(Boolean)
  };

  if (isDemo) {
    const i = demo.houses.findIndex(h => h.id === id);
    if (i >= 0) demo.houses[i] = { ...demo.houses[i], ...row };
    else demo.houses.push({ ...row, createdAt: Date.now() });
    demoSave(); demoNotify();
    return row;
  }

  const f = await loadFirebase();
  const ref = f.doc(f.db, "houses", id);
  const existing = await f.getDoc(ref);
  await f.setDoc(ref, existing.exists() ? row : { ...row, createdAt: Date.now() },
                 { merge: true });
  return row;
}

/**
 * Removes the house from the list only. Entries and standings are left exactly
 * where they are, so nothing anyone logged is ever destroyed by this.
 */
export async function removeHouse(id) {
  if (isDemo) {
    demo.houses = demo.houses.filter(h => h.id !== id);
    demoSave(); demoNotify();
    return;
  }
  const f = await loadFirebase();
  await f.deleteDoc(f.doc(f.db, "houses", id));
}

// ===========================================================================
// Entries
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

/** One-shot read of a month that has already closed. */
export async function loadHouseEntries(houseId, month) {
  if (isDemo) {
    return demo.entries.filter(e => e.houseId === houseId && e.month === month);
  }
  const f = await loadFirebase();
  const q = f.query(
    f.collection(f.db, "entries"),
    f.where("houseId", "==", houseId),
    f.where("month", "==", month)
  );
  const snap = await f.getDocs(q);
  return snap.docs.map(d => ({
    id: d.id, ...d.data(),
    createdAt: d.data().createdAt?.toMillis?.() ?? Date.now()
  }));
}

export async function addEntry({ houseId, member, month, category, amount, note }) {
  const row = { houseId, member, month, category, amount, note: note || "" };
  if (isDemo) {
    demo.entries.push({ ...row, id: `d${Date.now()}`, createdAt: Date.now() });
    demoSave(); demoNotify();
    return;
  }
  const f = await loadFirebase();
  await f.addDoc(f.collection(f.db, "entries"), { ...row, createdAt: f.serverTimestamp() });
}

export async function deleteEntry(id) {
  if (isDemo) {
    demo.entries = demo.entries.filter(e => e.id !== id);
    demoSave(); demoNotify();
    return;
  }
  const f = await loadFirebase();
  await f.deleteDoc(f.doc(f.db, "entries", id));
}

// ===========================================================================
// Standings: totals only, one row per house per month
// ===========================================================================
const standingId = (month, houseId) => `${month}_${houseId}`;

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
  if (isDemo) return;
  const f = await loadFirebase();
  await f.setDoc(f.doc(f.db, "standings", standingId(month, row.houseId)), row, { merge: true });
}

export function watchStandings(month, cb) {
  if (isDemo) {
    const emit = () => cb(demo.houses.map(h => {
      const st = houseStanding(h, demo.entries.filter(e => e.houseId === h.id && e.month === month), month);
      return { month, houseId: h.id, totals: st.totals,
               qualified: st.qualified, memberCount: st.memberCount, score: st.score };
    }));
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

/** Every month ever recorded, newest first, in one query. */
export async function loadAllStandings() {
  if (isDemo) {
    const months = [...new Set(demo.entries.map(e => e.month))];
    return months.map(month => ({
      month,
      records: demo.houses.map(h => {
        const st = houseStanding(h, demo.entries.filter(e => e.houseId === h.id && e.month === month), month);
        return { month, houseId: h.id, totals: st.totals,
                 qualified: st.qualified, score: st.score };
      })
    })).sort((a, b) => b.month.localeCompare(a.month));
  }

  const f = await loadFirebase();
  const snap = await f.getDocs(f.collection(f.db, "standings"));
  const byMonth = new Map();
  for (const d of snap.docs) {
    const row = d.data();
    if (!row.month) continue;
    if (!byMonth.has(row.month)) byMonth.set(row.month, []);
    byMonth.get(row.month).push(row);
  }
  return [...byMonth.entries()]
    .map(([month, records]) => ({ month, records }))
    .sort((a, b) => b.month.localeCompare(a.month));
}
