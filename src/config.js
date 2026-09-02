// ---------------------------------------------------------------------------
// config.js: everything you might want to change lives here.
// ---------------------------------------------------------------------------

// --- Firebase -------------------------------------------------------------
// Paste your project's web config here. While these stay as "PASTE_...", the
// app runs on local demo data so you can try it without any setup.
// These keys are public by design; firestore.rules is what protects the data.
export const firebaseConfig = {
  apiKey: "PASTE_YOUR_API_KEY",
  authDomain: "PASTE_YOUR_PROJECT.firebaseapp.com",
  projectId: "PASTE_YOUR_PROJECT_ID",
  storageBucket: "PASTE_YOUR_PROJECT.appspot.com",
  messagingSenderId: "PASTE_SENDER_ID",
  appId: "PASTE_APP_ID"
};

// --- The competition ------------------------------------------------------
// Fixed. Every house must reach all three.
export const THRESHOLDS = { books: 400, quran: 60, cevsen: 100 };

// Every member must personally reach this share of each threshold,
// i.e. 40 pages, 6 Qur'an, 10 bab. Miss one and the whole house is out.
export const MIN_SHARE = 0.10;

export const CATEGORIES = [
  { key: "books",  label: "Book pages", short: "Books",  hint: "Pages of religious books read" },
  { key: "quran",  label: "Qur’an",     short: "Qur’an", hint: "Qur’an read this month" },
  { key: "cevsen", label: "Cevşen",     short: "Cevşen", hint: "Bab of Cevşen read" }
];
export const CAT_KEYS = CATEGORIES.map(c => c.key);

// --- The houses -----------------------------------------------------------
// The FIRST name in each list is the Ev Abi. Order of the rest doesn't matter.
// `id` is used as a database key. Don't change it once people have logged
// anything, or that history stops lining up.
export const HOUSES = [
  {
    id: "risale", code: "RR", name: "Risale Regents", address: "Regents 26th (523) · 5x2",
    members: [
      "Ibrahim Aksoy", "Arif Camci", "Alperen Aydin",
      "Erdem Dogan", "Ihsan Yildirim", "Ahmet Karabay"
    ]
  },
  {
    id: "grand", code: "GR", name: "Grand Regents", address: "Regents 26th · 5x2",
    members: [
      "Emre Tunca", "Serdar Can Cakin", "Enes Gurbuz",
      "Fahreddin Ali Pala", "Cemal Taban", "Abdulaziz Imanaliev"
    ]
  },
  {
    id: "prestige", code: "PRP", name: "Prestige Pearl", address: "Pearl 608 · 4x2",
    members: [
      "Nihat Topcu", "Mehmet Bisen", "Adil Ulu",
      "Ali Guvener", "Alper Ozbey", "Erkam Said Ekici"
    ]
  },
  {
    id: "pirlanta", code: "PIP", name: "Pirlanta Pearl", address: "Pearl 603 · 4x2",
    members: [
      "Bera Dogan", "Yusuf Koroglu", "Esad Gürbüz",
      "Efe Gürbüz", "Hakan Ince", "Mehmet Canbegi"
    ]
  },
  {
    id: "gurbet", code: "GG", name: "Gurbet Galileo", address: "Galileo 408 · 3x2",
    members: [
      "Selim Gurkas", "Ramiz Aksoy", "Yahya Güvercin",
      "Omer Dokan", "Ahmed Yakub Sarihan"
    ]
  }
];

// Each house signs in as one Firebase account: <house id>@maneviyat.app.
// The domain is never emailed, it just has to be a valid-looking address.
export const AUTH_DOMAIN = "maneviyat.app";

// --- Passwords ------------------------------------------------------------
// The Ev Abi password, used only to prove you're the Ev Abi of a house you
// already have the house password for. An Ev Abi can change it in Settings.
// Once changed, the stored value wins and this line stops being used.
export const DEFAULT_EV_ABI_PASSWORD = "RRgoat";

// NOTE: house passwords are deliberately NOT stored in this file.
//
// Everything in src/ is downloaded by every visitor's browser, so anything
// written here is public, whether or not the repository is private. Putting
// the house passwords here would let any member read every other house's
// password from View Source, which is exactly the wall this app is meant to
// keep up. You type them once in the setup wizard instead.

// Firebase refuses any password under 6 characters. The house passwords are
// shorter than that so they stay easy to say out loud, so the app appends this
// suffix before handing anything to Firebase: someone types a short password,
// and Firebase stores that password plus this.
//
// It is not a secret, it just satisfies the length rule. Changing it would
// lock out every existing house, so leave it alone once you are set up.
export const PASSWORD_SUFFIX = ".mnv.house";

// Shortest password someone is allowed to type. The suffix covers the rest.
export const MIN_PASSWORD_LENGTH = 4;

// Demo-mode house password. Demo mode only, never used against Firebase.
export const DEMO_HOUSE_PASSWORD = "demo";

// --- Derived helpers ------------------------------------------------------
export const houseById  = id => HOUSES.find(h => h.id === id) || null;
export const evAbiOf    = house => house.members[0];
export const isEvAbi    = (house, member) => house.members[0] === member;
export const memberFloor = () =>
  CAT_KEYS.reduce((o, k) => (o[k] = Math.ceil(THRESHOLDS[k] * MIN_SHARE), o), {});
