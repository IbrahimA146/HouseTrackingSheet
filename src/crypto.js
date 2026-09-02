// ---------------------------------------------------------------------------
// crypto.js: password hashing for the Ev Abi gate.
//
// The house password itself is verified by Firebase Authentication, which does
// the real thing server-side. This file only covers the Ev Abi password, which
// is a second check inside a house you already have the password for.
//
// PBKDF2-SHA256 with a random salt, so the stored value can't be read straight
// back out of the database.
// ---------------------------------------------------------------------------

const ITERATIONS = 150000;
const enc = new TextEncoder();

const toHex = buf =>
  [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");

const fromHex = hex =>
  new Uint8Array(hex.match(/.{1,2}/g).map(b => parseInt(b, 16)));

async function derive(password, salt) {
  const key = await crypto.subtle.importKey(
    "raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: ITERATIONS, hash: "SHA-256" }, key, 256
  );
  return toHex(bits);
}

/** Hash a password for storage. Returns "salt:hash". */
export async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await derive(password, salt);
  return `${toHex(salt)}:${hash}`;
}

/** Check a password against a stored "salt:hash". */
export async function verifyPassword(password, stored) {
  if (typeof stored !== "string" || !stored.includes(":")) return false;
  const [saltHex, expected] = stored.split(":");
  try {
    const actual = await derive(password, fromHex(saltHex));
    // Length-constant comparison. Cheap here, but the right habit.
    if (actual.length !== expected.length) return false;
    let diff = 0;
    for (let i = 0; i < actual.length; i++) diff |= actual.charCodeAt(i) ^ expected.charCodeAt(i);
    return diff === 0;
  } catch {
    return false;
  }
}
