// ---------------------------------------------------------------------------
// app.js: screen flow, state, and event wiring.
//
// Flow: pick house -> pick your name -> you are in. No password anywhere.
// ---------------------------------------------------------------------------

import { CATEGORIES, COMPETITION_START_MONTH, memberFloor } from "./config.js";
import {
  houseStanding, rankHouses, winnerOf, monthKey, monthLabelShort, monthsSince
} from "./scoring.js";
import * as store from "./store.js";
import * as ui from "./ui.js";
import { celebrate } from "./celebrate.js";

const $ = id => document.getElementById(id);

const state = {
  houses: [],
  houseId: null,
  member: null,
  month: monthKey(),
  entries: [],
  standings: [],
  history: [],
  tab: "me",
  logCat: CATEGORIES[0].key,
  viewMonth: null,
  pastEntries: [],
  pastLoading: false,
  // False until the server (not the local cache) has answered. Showing zeros
  // before then is what made it look like everyone's work had vanished.
  synced: false,
  unsub: []
};

const house = () => state.houses.find(h => h.id === state.houseId) || null;

// ---------------------------------------------------------------- helpers --
let toastTimer;
function toast(msg, isError = false) {
  const t = $("toast");
  t.textContent = msg;
  t.classList.toggle("err", isError);
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 3200);
}

const SCREENS = ["boot", "screenHouse", "screenMember", "screenMain"];
function show(id) {
  SCREENS.forEach(s => { $(s).hidden = s !== id; });
  window.scrollTo(0, 0);
}

// ------------------------------------------------------------------ theme --
(function initTheme() {
  try {
    const saved = localStorage.getItem("maneviyat-theme");
    if (saved) document.documentElement.setAttribute("data-theme", saved);
  } catch { /* storage blocked; light stays the default */ }
})();

$("themeBtn").addEventListener("click", () => {
  const root = document.documentElement;
  const next = root.getAttribute("data-theme") === "dark" ? "light" : "dark";
  root.setAttribute("data-theme", next);
  try { localStorage.setItem("maneviyat-theme", next); } catch {}
});

if (store.isDemo) {
  $("demoNote").hidden = false;
  $("demoBanner").hidden = false;
}

// =========================================================== 1. HOUSES ====
$("houseGrid").addEventListener("click", e => {
  const btn = e.target.closest("[data-house]");
  if (!btn) return;
  state.houseId = btn.dataset.house;
  openMemberPicker();
});

function renderHousePicker() {
  $("houseGrid").innerHTML = ui.houseCards(state.houses);
}

// =========================================================== 2. MEMBER ====
function openMemberPicker() {
  const h = house();
  if (!h) return show("screenHouse");
  $("memberHouseName").textContent = h.name;
  $("memberHouseAddress").textContent = h.address || "";
  $("memberGrid").innerHTML = ui.memberCards(h);
  show("screenMember");
}

$("memberGrid").addEventListener("click", async e => {
  const btn = e.target.closest("[data-member]");
  if (!btn) return;
  state.member = btn.dataset.member;
  store.completeSignIn(state.houseId, state.member);
  await enterApp();
});

document.querySelectorAll("[data-back]").forEach(btn => {
  btn.addEventListener("click", () => show("screenHouse"));
});

// ============================================================== 3. APP ====
async function enterApp() {
  const h = house();
  if (!h) return show("screenHouse");

  $("topHouse").textContent = h.name;
  $("monthPill").textContent = monthLabelShort(state.month);
  show("screenMain");
  setTab(state.tab);

  state.unsub.forEach(fn => fn());
  state.unsub = [];

  state.synced = false;
  state.unsub.push(store.watchHouseEntries(state.houseId, state.month, (entries, meta) => {
    state.entries = entries.sort((a, b) => b.createdAt - a.createdAt);
    // An empty result straight from the cache means "we don't know yet", not
    // "there is nothing". Don't trust it, and above all don't publish it.
    const trustworthy = !meta.fromCache || entries.length > 0;
    if (trustworthy) {
      state.synced = true;
      publishOurTotals();
    }
    render();
  }));

  state.unsub.push(store.watchStandings(state.month, records => {
    state.standings = records;
    render();
  }));

  loadHistory();
}

let lastPublished = "";
function publishOurTotals() {
  const h = house();
  if (!h || !state.synced) return;   // never overwrite real totals with zeros
  const standing = houseStanding(h, state.entries, state.month);
  const fingerprint = JSON.stringify([standing.totals, standing.qualified]);
  if (fingerprint === lastPublished) return;
  lastPublished = fingerprint;
  store.publishStanding(state.month, standing).catch(err =>
    console.error("could not publish standing:", err));
}

async function loadHistory() {
  try {
    const raw = await store.loadAllStandings();
    state.history = raw
      .filter(h => h.month !== state.month && h.records.length)
      .map(h => ({ month: h.month, winner: winnerOf(h.records, state.houses) }));
    render();
  } catch (err) {
    console.error("history:", err);
  }
}

/** Every month of the competition so far, newest first. */
function monthOptions() {
  return monthsSince(COMPETITION_START_MONTH, state.month)
    .map(key => ({ key, current: key === state.month }));
}

async function loadPastMonth(month) {
  state.viewMonth = month;
  if (month === state.month) { state.pastEntries = []; render(); return; }
  state.pastLoading = true;
  render();
  try {
    state.pastEntries = await store.loadHouseEntries(state.houseId, month);
  } catch (err) {
    state.pastEntries = [];
    toast(err.message || "Could not load that month.", true);
  } finally {
    state.pastLoading = false;
    render();
  }
}

document.addEventListener("change", e => {
  if (e.target.id === "monthPick") loadPastMonth(e.target.value);
});

/** A closed month has no live listener, so refetch and republish by hand. */
async function refreshPastMonth() {
  state.pastEntries = await store.loadHouseEntries(state.houseId, state.viewMonth);
  const standing = houseStanding(house(), state.pastEntries, state.viewMonth);
  await store.publishStanding(state.viewMonth, standing).catch(err =>
    console.error("could not republish standing:", err));
  render();
}

// ------------------------------------------------------------------ tabs --
$("tabbar").addEventListener("click", e => {
  const btn = e.target.closest("[data-tab]");
  if (btn) setTab(btn.dataset.tab);
});

function setTab(tab) {
  state.tab = tab;
  document.querySelectorAll("#tabbar .tab").forEach(b =>
    b.classList.toggle("is-active", b.dataset.tab === tab));
  ["me", "house", "rank", "houses"].forEach(t => { $(`panel-${t}`).hidden = t !== tab; });
  window.scrollTo(0, 0);
  render();
}

// ----------------------------------------------------------------- render --
function render() {
  if ($("screenMain").hidden) return;
  const h = house();
  if (!h) return;

  // Still waiting on the first real answer, and nothing cached to show.
  if (!state.synced && state.entries.length === 0) {
    const waiting = `<section class="card"><p class="empty">
      <span class="spinner spinner-sm"></span><br>Loading this month&rsquo;s numbers…
    </p></section>`;
    ["me", "house", "rank"].forEach(t => { $(`panel-${t}`).innerHTML = waiting; });
    if (state.tab === "houses") {
      $("panel-houses").innerHTML = ui.renderHouses({
        houses: state.houses, currentHouseId: state.houseId
      });
    }
    return;
  }

  const standing = houseStanding(h, state.entries, state.month);

  if (state.tab === "me") {
    $("panel-me").innerHTML = ui.renderMe({
      member: state.member, house: h, standing, month: state.month,
      myEntries: state.entries.filter(e => e.member === state.member).slice(0, 15)
    });
    const seg = $("catSeg");
    if (seg) seg.querySelectorAll(".seg-btn").forEach(b =>
      b.classList.toggle("is-active", b.dataset.cat === state.logCat));
    const hint = $("logHint");
    if (hint) hint.textContent = CATEGORIES.find(c => c.key === state.logCat).hint;
  }

  if (state.tab === "house") {
    const viewMonth = state.viewMonth || state.month;
    const isPast = viewMonth !== state.month;
    const entries = isPast ? state.pastEntries : state.entries;
    $("panel-house").innerHTML = ui.renderHouse({
      house: h,
      standing: isPast ? houseStanding(h, entries, viewMonth) : standing,
      viewMonth, months: monthOptions(), isPast, entries,
      loading: isPast && state.pastLoading
    });
  }

  if (state.tab === "rank") {
    const records = state.standings.length
      ? state.standings
      : [{ houseId: h.id, totals: standing.totals, qualified: standing.qualified }];
    $("panel-rank").innerHTML = ui.renderRank({
      myHouseId: state.houseId,
      ranking: rankHouses(records, state.houses),
      month: state.month,
      history: state.history,
      standing
    });
  }

  if (state.tab === "houses") {
    $("panel-houses").innerHTML = ui.renderHouses({
      houses: state.houses, currentHouseId: state.houseId
    });
  }
}

// ------------------------------------------------------- logging progress --
document.addEventListener("click", e => {
  const seg = e.target.closest("#catSeg .seg-btn");
  if (!seg) return;
  state.logCat = seg.dataset.cat;
  seg.parentElement.querySelectorAll(".seg-btn").forEach(b =>
    b.classList.toggle("is-active", b === seg));
  $("logHint").textContent = CATEGORIES.find(c => c.key === state.logCat).hint;
  $("logAmount").focus();
});

document.addEventListener("submit", async e => {
  if (e.target.id !== "logForm") return;
  e.preventDefault();

  const amount = parseInt($("logAmount").value, 10);
  if (!Number.isFinite(amount) || amount <= 0) return toast("Enter a number above zero.", true);
  if (amount > 10000) return toast("That looks like a typo.", true);

  const btn = e.target.querySelector("button[type=submit]");
  btn.disabled = true;
  try {
    await store.addEntry({
      houseId: state.houseId, member: state.member, month: state.month,
      category: state.logCat, amount, note: $("logNote").value.trim()
    });
    $("logAmount").value = "";
    $("logNote").value = "";
    const cat = CATEGORIES.find(c => c.key === state.logCat);
    celebrate(amount, memberFloor()[state.logCat], cat.short);
  } catch (err) {
    toast(err.message || "Could not save.", true);
  } finally {
    btn.disabled = false;
  }
});

document.addEventListener("click", async e => {
  const del = e.target.closest("[data-del]");
  if (!del) return;
  const isPast = !!state.viewMonth && state.viewMonth !== state.month;
  if (!confirm("Delete this entry?")) return;
  try {
    await store.deleteEntry(del.dataset.del);
    if (isPast) await refreshPastMonth();
    toast("Entry deleted");
  } catch (err) {
    toast(err.message || "Could not delete.", true);
  }
});

// Adding to someone else, in any month, from the House tab.
document.addEventListener("submit", async e => {
  if (e.target.id !== "fixForm") return;
  e.preventDefault();

  const amount = parseInt($("fixAmount").value, 10);
  if (!Number.isFinite(amount) || amount <= 0) return toast("Enter a number above zero.", true);
  if (amount > 10000) return toast("That looks like a typo.", true);

  const month = state.viewMonth || state.month;
  const btn = e.target.querySelector("button[type=submit]");
  btn.disabled = true;
  try {
    await store.addEntry({
      houseId: state.houseId, member: $("fixMember").value, month,
      category: $("fixCat").value, amount, note: "added by hand"
    });
    $("fixAmount").value = "";
    if (month !== state.month) await refreshPastMonth();
    toast("Saved");
  } catch (err) {
    toast(err.message || "Could not save.", true);
  } finally {
    btn.disabled = false;
  }
});

// ---------------------------------------------------------- houses admin --
document.addEventListener("click", e => {
  const edit = e.target.closest("[data-edit-house]");
  if (edit) {
    const h = state.houses.find(x => x.id === edit.dataset.editHouse);
    if (!h) return;
    $("houseEditingId").value = h.id;
    $("houseName").value = h.name || "";
    $("houseCode").value = h.code || "";
    $("houseAddress").value = h.address || "";
    $("houseMembers").value = (h.members || []).join("\n");
    $("houseFormTitle").textContent = `Edit ${h.name}`;
    $("houseSave").textContent = "Save changes";
    $("houseCancel").hidden = false;
    $("houseDelete").hidden = state.houses.length <= 1;
    $("houseName").scrollIntoView({ behavior: "smooth", block: "center" });
    return;
  }

  if (e.target.id === "houseCancel") resetHouseForm();

  if (e.target.id === "houseDelete") {
    const id = $("houseEditingId").value;
    if (!id) return;
    if (!confirm("Remove this house from the list?\n\nNothing anyone logged is deleted. " +
                 "The numbers stay in the database and come back if you add the house again."))
      return;
    store.removeHouse(id)
      .then(() => { resetHouseForm(); toast("House removed from the list"); })
      .catch(err => toast(err.message || "Could not remove.", true));
  }
});

function resetHouseForm() {
  const f = $("houseForm");
  if (!f) return;
  f.reset();
  $("houseEditingId").value = "";
  $("houseFormTitle").textContent = "Add a house";
  $("houseSave").textContent = "Add house";
  $("houseCancel").hidden = true;
  $("houseDelete").hidden = true;
  $("houseError").hidden = true;
}

document.addEventListener("submit", async e => {
  if (e.target.id !== "houseForm") return;
  e.preventDefault();

  const err = $("houseError");
  err.hidden = true;

  const editingId = $("houseEditingId").value;
  const name = $("houseName").value.trim();
  const members = $("houseMembers").value.split("\n").map(s => s.trim()).filter(Boolean);
  // An existing house keeps its id forever: every entry already logged points
  // at it, and changing it would strand all of that history.
  const id = editingId || name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

  const btn = $("houseSave");
  btn.disabled = true;
  try {
    await store.saveHouse({
      id, name, members,
      code: $("houseCode").value.trim(),
      address: $("houseAddress").value.trim()
    });
    resetHouseForm();
    toast(editingId ? "House updated" : "House added");
  } catch (ex) {
    err.textContent = ex.message || "Could not save the house.";
    err.hidden = false;
  } finally {
    btn.disabled = false;
  }
});

// ------------------------------------------------------------ switch user --
$("signOutBtn").addEventListener("click", () => {
  if (!confirm("Switch to a different person?")) return;
  state.unsub.forEach(fn => fn());
  state.unsub = [];
  store.clearSession();
  Object.assign(state, {
    houseId: null, member: null, entries: [], standings: [],
    history: [], tab: "me", viewMonth: null, pastEntries: [], synced: false
  });
  lastPublished = "";
  show("screenHouse");
});

// ------------------------------------------------------------------ boot --
(async function boot() {
  state.month = monthKey();

  try {
    await store.ensureSignedIn();
  } catch (err) {
    console.error("anonymous sign-in failed:", err);
    toast(err.message || "Could not reach the database.", true);
  }

  let first = true;
  store.watchHouses(async houses => {
    state.houses = houses;
    renderHousePicker();

    if (first) {
      first = false;
      const saved = store.getSession();
      if (saved && houses.some(h => h.id === saved.houseId)) {
        state.houseId = saved.houseId;
        state.member = saved.member;
        await enterApp();
        return;
      }
      show("screenHouse");
      return;
    }

    // A house was added or edited while someone was looking at the app.
    if (state.houseId && !houses.some(h => h.id === state.houseId)) {
      store.clearSession();
      state.houseId = null;
      show("screenHouse");
    } else {
      render();
    }
  });

  // If the houses listener never fires (offline, rules wrong), don't sit on
  // the spinner forever.
  setTimeout(() => {
    if (!$("boot").hidden) {
      renderHousePicker();
      show("screenHouse");
    }
  }, 6000);
})();
