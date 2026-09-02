// ---------------------------------------------------------------------------
// app.js: screen flow, state, and event wiring.
//
// Flow: pick house -> pick your name -> password(s) -> dashboard.
// ---------------------------------------------------------------------------

import {
  HOUSES, CATEGORIES, MIN_PASSWORD_LENGTH, houseById, isEvAbi
} from "./config.js";
import {
  houseStanding, rankHouses, winnerOf, monthKey, monthLabelShort, previousMonths
} from "./scoring.js";
import * as store from "./store.js";
import * as ui from "./ui.js";

const $ = id => document.getElementById(id);

const state = {
  houseId: null,
  member: null,
  evAbi: false,
  month: monthKey(),
  entries: [],        // this house, this month
  standings: [],       // every house's public totals, this month
  history: [],
  tab: "me",
  logCat: CATEGORIES[0].key,
  unsub: []
};

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

const SCREENS = ["boot", "screenHouse", "screenSetup", "screenMember", "screenGate", "screenMain"];
function show(id) {
  SCREENS.forEach(s => { $(s).hidden = s !== id; });
  window.scrollTo(0, 0);
}

// ------------------------------------------------------------------ theme --
(function initTheme() {
  try {
    const saved = localStorage.getItem("maneviyat-theme");
    if (saved) document.documentElement.setAttribute("data-theme", saved);
  } catch { /* storage blocked; system preference still applies */ }
})();

$("themeBtn").addEventListener("click", () => {
  // Light is the default, so "dark" is only ever an explicit choice.
  const root = document.documentElement;
  const next = root.getAttribute("data-theme") === "dark" ? "light" : "dark";
  root.setAttribute("data-theme", next);
  try { localStorage.setItem("maneviyat-theme", next); } catch {}
});

// =========================================================== 1. HOUSES ====
$("houseGrid").innerHTML = ui.houseCards(HOUSES);

// Say so, loudly. Without this there is no way to tell why a real house
// password is being refused.
if (store.isDemo) {
  $("demoNote").hidden = false;
  $("demoBanner").hidden = false;
}

$("houseGrid").addEventListener("click", e => {
  const btn = e.target.closest("[data-house]");
  if (!btn) return;
  state.houseId = btn.dataset.house;
  openMemberPicker();
});

// ====================================================== 1b. FIRST SETUP ====
// Creates the five house logins from the browser, so the Firebase console is
// never needed. Gated behind the Ev Abi password.

$("openSetup").addEventListener("click", () => {
  $("setupGate").hidden = false;
  $("setupForm").hidden = true;
  $("setupDone").hidden = true;
  $("setupGatePw").value = "";
  $("setupGateError").hidden = true;
  show("screenSetup");
  setTimeout(() => $("setupGatePw").focus(), 120);
});

$("setupBack").addEventListener("click", () => show("screenHouse"));

$("setupGateForm").addEventListener("submit", async e => {
  e.preventDefault();
  const err = $("setupGateError");
  err.hidden = true;

  const ok = await store.verifyEvAbi($("setupGatePw").value);
  if (!ok) {
    err.textContent = "Wrong Ev Abi password.";
    err.hidden = false;
    return;
  }

  $("setupFields").innerHTML = HOUSES.map(h => `
    <label class="setup-field">
      <span class="setup-field-head">
        <span class="setup-field-code">${ui.esc(h.code)}</span>
        <span>
          <span class="setup-field-name">${ui.esc(h.name)}</span>
          <span class="setup-field-addr">${ui.esc(h.address)}</span>
        </span>
      </span>
      <input type="text" class="setup-pw" data-house="${h.id}"
             minlength="${MIN_PASSWORD_LENGTH}" required autocomplete="off"
             spellcheck="false" autocapitalize="off"
             placeholder="Password for ${ui.esc(h.name)}">
    </label>`).join("");
  $("setupGate").hidden = true;
  $("setupForm").hidden = false;
  setTimeout(() => $("setupFields").querySelector("input")?.focus(), 120);
});

$("setupPwForm").addEventListener("submit", async e => {
  e.preventDefault();
  const btn = $("setupRun");
  const err = $("setupError");
  err.hidden = true;

  const passwords = {};
  document.querySelectorAll(".setup-pw").forEach(i => { passwords[i.dataset.house] = i.value; });

  if (Object.values(passwords).some(p => !p || p.length < MIN_PASSWORD_LENGTH)) {
    err.textContent =
      `Every house needs a password of at least ${MIN_PASSWORD_LENGTH} characters.`;
    err.hidden = false;
    return;
  }

  // The starting Ev Abi password is written in src/config.js, which every
  // visitor can read. Setup must replace it, so this is not optional.
  const evAbiPw = $("setupEvAbiPw").value.trim();
  if (evAbiPw.length < MIN_PASSWORD_LENGTH) {
    err.textContent =
      `Set a new Ev Abi password of at least ${MIN_PASSWORD_LENGTH} characters. ` +
      `The starting one is visible in the source, so it cannot be kept.`;
    err.hidden = false;
    return;
  }

  btn.disabled = true;
  btn.textContent = "Creating…";
  try {
    const results = await store.initializeHouses(passwords, evAbiPw);
    $("setupResults").innerHTML = results.map(r => `
      <div class="setup-row ${r.ok ? "ok" : "fail"}">
        <span class="tick">${r.ok ? "✓" : "✕"}</span>
        <span class="setup-row-body">
          <span class="setup-row-name">${ui.esc(r.name)}</span>
          <span class="setup-row-msg">${ui.esc(r.message)}</span>
        </span>
      </div>`).join("");
    $("setupForm").hidden = true;
    $("setupDone").hidden = false;
  } catch (ex) {
    err.textContent = ex.message || "Setup failed.";
    err.hidden = false;
  } finally {
    btn.disabled = false;
    btn.textContent = "Create the five house logins";
  }
});

$("setupFinish").addEventListener("click", () => show("screenHouse"));

// =========================================================== 2. MEMBER ====
function openMemberPicker() {
  const house = houseById(state.houseId);
  $("memberHouseName").textContent = house.name;
  $("memberHouseAddress").textContent = house.address;
  $("memberGrid").innerHTML = ui.memberCards(house);
  show("screenMember");
}

$("memberGrid").addEventListener("click", e => {
  const btn = e.target.closest("[data-member]");
  if (!btn) return;
  state.member = btn.dataset.member;
  openGate();
});

document.querySelectorAll("[data-back]").forEach(btn => {
  btn.addEventListener("click", () => {
    if (btn.dataset.back === "house") show("screenHouse");
    else openMemberPicker();
  });
});

// ============================================================= 3. GATE ====
function openGate() {
  const house = houseById(state.houseId);
  const evAbi = isEvAbi(house, state.member);

  $("gateAvatar").textContent = ui.initials(state.member);
  $("gateName").textContent = state.member;
  $("gateHouse").textContent = house.name + (evAbi ? " · Ev Abi" : "");
  $("gateEvAbiWrap").hidden = !evAbi;
  $("gateEvAbiPw").required = evAbi;
  $("gateHousePw").value = "";
  $("gateEvAbiPw").value = "";
  $("gateError").hidden = true;

  show("screenGate");
  setTimeout(() => $("gateHousePw").focus(), 120);
}

$("gateForm").addEventListener("submit", async e => {
  e.preventDefault();
  const btn = $("gateSubmit");
  const err = $("gateError");
  const house = houseById(state.houseId);
  const wantsEvAbi = isEvAbi(house, state.member);

  err.hidden = true;
  btn.disabled = true;
  btn.textContent = "Checking…";

  try {
    // Gate 1: the house password. Firebase verifies this server-side.
    await store.signInHouse(state.houseId, $("gateHousePw").value);

    // Gate 2: the Ev Abi password, only if they claimed that seat.
    if (wantsEvAbi) {
      const ok = await store.verifyEvAbi($("gateEvAbiPw").value);
      if (!ok) {
        await store.signOutSession();
        throw new store.StoreError("bad-evabi", "Wrong Ev Abi password.");
      }
    }

    store.completeSignIn(state.houseId, state.member, wantsEvAbi);
    state.evAbi = wantsEvAbi;
    await enterApp();
  } catch (ex) {
    err.textContent = ex.message || "Could not get you in.";
    err.hidden = false;
  } finally {
    btn.disabled = false;
    btn.textContent = "Enter";
  }
});

// ============================================================== 4. APP ====
async function enterApp() {
  const house = houseById(state.houseId);
  $("topHouse").textContent = house.name;
  $("monthPill").textContent = monthLabelShort(state.month);
  $("tabSettings").hidden = !state.evAbi;
  if (!state.evAbi && state.tab === "settings") state.tab = "me";

  show("screenMain");
  setTab(state.tab);

  state.unsub.forEach(fn => fn());
  state.unsub = [];

  state.unsub.push(store.watchHouseEntries(state.houseId, state.month, entries => {
    state.entries = entries.sort((a, b) => b.createdAt - a.createdAt);
    publishOurTotals();
    render();
  }));

  state.unsub.push(store.watchStandings(state.month, records => {
    state.standings = records;
    render();
  }));

  loadHistory();
}

/**
 * Push this house's totals (no member detail) so the other houses can be
 * ranked against us. This is what makes the ladder work without leaking
 * anyone's individual numbers.
 */
let lastPublished = "";
function publishOurTotals() {
  const standing = houseStanding(houseById(state.houseId), state.entries, state.month);
  const fingerprint = JSON.stringify([standing.totals, standing.qualified]);
  if (fingerprint === lastPublished) return;
  lastPublished = fingerprint;
  store.publishStanding(state.month, standing).catch(err =>
    console.error("could not publish standing:", err));
}

async function loadHistory() {
  try {
    const months = previousMonths(6);
    const raw = await store.loadHistory(months);
    state.history = raw
      .filter(h => h.records.length)
      .map(h => ({ month: h.month, winner: winnerOf(h.records) }));
    render();
  } catch (err) {
    console.error("history:", err);
  }
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
  ["me", "house", "rank", "settings"].forEach(t =>
    { $(`panel-${t}`).hidden = t !== tab; });
  window.scrollTo(0, 0);
  render();
}

// ----------------------------------------------------------------- render --
function render() {
  if ($("screenMain").hidden) return;

  const house = houseById(state.houseId);
  const standing = houseStanding(house, state.entries, state.month);

  if (state.tab === "me") {
    $("panel-me").innerHTML = ui.renderMe({
      member: state.member,
      house, standing, month: state.month,
      myEntries: state.entries.filter(e => e.member === state.member).slice(0, 15),
      canDelete: true
    });
    // Restore the category the user had selected before this re-render.
    const seg = $("catSeg");
    if (seg) seg.querySelectorAll(".seg-btn").forEach(b =>
      b.classList.toggle("is-active", b.dataset.cat === state.logCat));
    const hint = $("logHint");
    if (hint) hint.textContent = CATEGORIES.find(c => c.key === state.logCat).hint;
  }

  if (state.tab === "house") {
    $("panel-house").innerHTML = ui.renderHouse({ house, standing, month: state.month });
  }

  if (state.tab === "rank") {
    const records = state.standings.length
      ? state.standings
      : [{ houseId: house.id, totals: standing.totals, qualified: standing.qualified }];
    $("panel-rank").innerHTML = ui.renderRank({
      myHouseId: state.houseId,
      ranking: rankHouses(records),
      month: state.month,
      history: state.history
    });
  }

  if (state.tab === "settings" && state.evAbi) {
    $("panel-settings").innerHTML = ui.renderSettings({ house, allEntries: state.entries });
  }
}

// ------------------------------------------------------- logging progress --
document.addEventListener("click", e => {
  const seg = e.target.closest("#catSeg .seg-btn");
  if (seg) {
    state.logCat = seg.dataset.cat;
    seg.parentElement.querySelectorAll(".seg-btn").forEach(b =>
      b.classList.toggle("is-active", b === seg));
    $("logHint").textContent = CATEGORIES.find(c => c.key === state.logCat).hint;
    $("logAmount").focus();
  }
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
    toast(`+${amount} ${CATEGORIES.find(c => c.key === state.logCat).short} logged`);
  } catch (err) {
    toast(err.message || "Could not save.", true);
  } finally {
    btn.disabled = false;
  }
});

document.addEventListener("click", async e => {
  const del = e.target.closest("[data-del]");
  if (!del) return;
  const entry = state.entries.find(x => x.id === del.dataset.del);
  // Anyone can remove their own; an Ev Abi can remove anyone's.
  if (entry && entry.member !== state.member && !state.evAbi) {
    return toast("Only the Ev Abi can delete someone else's entry.", true);
  }
  if (!confirm("Delete this entry?")) return;
  try {
    await store.deleteEntry(del.dataset.del);
    toast("Entry deleted");
  } catch (err) {
    toast(err.message || "Could not delete.", true);
  }
});

// ------------------------------------------------------- Ev Abi settings --
document.addEventListener("submit", async e => {
  if (e.target.id === "housePwForm") {
    e.preventDefault();
    const pw = $("newHousePw").value;
    try {
      await store.setHousePassword(pw);
      $("newHousePw").value = "";
      toast("House password changed");
    } catch (err) { toast(err.message, true); }
  }

  if (e.target.id === "evAbiPwForm") {
    e.preventDefault();
    const pw = $("newEvAbiPw").value;
    try {
      await store.setEvAbiPassword(pw);
      $("newEvAbiPw").value = "";
      toast("Ev Abi password changed");
    } catch (err) { toast(err.message, true); }
  }
});

// --------------------------------------------------------------- sign out --
$("signOutBtn").addEventListener("click", async () => {
  if (!confirm("Sign out of this house?")) return;
  state.unsub.forEach(fn => fn());
  state.unsub = [];
  await store.signOutSession();
  Object.assign(state, {
    houseId: null, member: null, evAbi: false, entries: [], standings: [], history: [], tab: "me"
  });
  lastPublished = "";
  show("screenHouse");
});

// ------------------------------------------------------------------ boot --
(async function boot() {
  // A new calendar month? Just pick it up. Nothing to close by hand.
  state.month = monthKey();

  try {
    const resumed = await store.resumeSession();
    if (resumed && houseById(resumed.houseId)) {
      state.houseId = resumed.houseId;
      state.member = resumed.member;
      state.evAbi = !!resumed.evAbi;
      await enterApp();
      return;
    }
  } catch (err) {
    console.error("resume failed:", err);
  }
  show("screenHouse");
})();
