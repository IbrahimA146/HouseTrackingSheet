// ---------------------------------------------------------------------------
// config.js: the knobs. Houses themselves are no longer here, they live in
// Firestore so they can be added from inside the app.
// ---------------------------------------------------------------------------

// --- Firebase -------------------------------------------------------------
// Public by design. firestore.rules is what protects the data, not these.
export const firebaseConfig = {
  apiKey: "AIzaSyB093OQYb4v5eqKdzts8Fg2MmWAe6v4EPM",
  authDomain: "maneviyat-ad697.firebaseapp.com",
  projectId: "maneviyat-ad697",
  storageBucket: "maneviyat-ad697.firebasestorage.app",
  messagingSenderId: "441915750035",
  appId: "1:441915750035:web:0b5c5c3735559ab84fff66"
};

// --- The competition ------------------------------------------------------
export const THRESHOLDS = { books: 500, quran: 80, cevsen: 300 };

// Every member must personally reach this share of each THRESHOLD.
// 10% of 500 / 80 / 300 is 50 book pages, 8 Qur'an pages, 30 bab.
//
// Note this is 10% of the threshold, a fixed number, not 10% of whatever the
// house happens to have logged. Everyone knows their target on day one and it
// never moves.
export const MIN_SHARE = 0.10;

// Final score weighting. Books count for most, Cevsen for least.
export const WEIGHTS = { books: 0.60, quran: 0.30, cevsen: 0.10 };

export const CATEGORIES = [
  { key: "books",  label: "Book pages", short: "Books",  hint: "Pages of religious books read" },
  { key: "quran",  label: "Qur’an",     short: "Qur’an", hint: "Pages of Qur’an read this month" },
  { key: "cevsen", label: "Cevşen",     short: "Cevşen", hint: "Bab of Cevşen read" }
];
export const CAT_KEYS = CATEGORIES.map(c => c.key);

// First month of the competition. Every month from here onward is kept.
export const COMPETITION_START_MONTH = "2026-09";

// --- Seeding --------------------------------------------------------------
// Written to Firestore once, only if no houses exist yet. The id must stay
// "risale" forever: every entry already logged is tagged with it, and changing
// it would orphan all of that history.
export const SEED_HOUSE = {
  id: "risale",
  code: "RR",
  name: "Risale Regents",
  address: "Regents 26th (523) · 5x2",
  members: [
    "Ibrahim Aksoy", "Arif Camci", "Alperen Aydin",
    "Erdem Dogan", "Ihsan Yildirim", "Ahmet Karabay"
  ]
};

// --- Derived helpers ------------------------------------------------------
export const memberFloor = () =>
  CAT_KEYS.reduce((o, k) => (o[k] = Math.ceil(THRESHOLDS[k] * MIN_SHARE), o), {});
