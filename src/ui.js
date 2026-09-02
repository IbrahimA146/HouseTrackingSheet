// ---------------------------------------------------------------------------
// ui.js: turns state into HTML. No network calls, no event wiring.
// ---------------------------------------------------------------------------

import { CATEGORIES, CAT_KEYS, THRESHOLDS, MIN_SHARE } from "./config.js";
import { monthLabel, daysLeftIn } from "./scoring.js";

export const esc = s => String(s ?? "").replace(/[&<>"']/g, c =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export const initials = name =>
  String(name || "?").trim().split(/\s+/).slice(0, 2).map(w => w[0]).join("").toUpperCase();

const nf = n => Number(n).toLocaleString();
const ordinal = n => ["", "st", "nd", "rd"][n] || "th";

// --------------------------------------------------------------- pickers --
export function houseCards(houses) {
  return houses.map(h => `
    <button class="house-card" data-house="${h.id}">
      <span class="house-badge">${esc(h.code || initials(h.name))}</span>
      <span class="house-card-body">
        <span class="house-card-name">${esc(h.name)}</span>
        <span class="house-card-meta">${esc(h.address)} · ${h.members.length} members</span>
      </span>
      <span class="house-card-chev">›</span>
    </button>`).join("");
}

export function memberCards(house) {
  return house.members.map((name, i) => `
    <button class="member-card ${i === 0 ? "evabi" : ""}" data-member="${esc(name)}">
      <span class="member-avatar">${initials(name)}</span>
      <span class="member-name">${esc(name)}</span>
      ${i === 0 ? `<span class="role-tag">Ev Abi</span>` : ""}
    </button>`).join("");
}

// --------------------------------------------------------------- metrics --
function metric(label, value, target, floorMode) {
  const pct = target > 0 ? (value / target) * 100 : 0;
  const done = value >= target;
  const cls = done ? "done" : (floorMode ? "low" : "");
  return `
    <div class="metric">
      <div class="metric-top">
        <span class="metric-label">${label}</span>
        <span class="metric-pct">${Math.round(pct)}%</span>
      </div>
      <div class="metric-val">${nf(value)} <small>/ ${nf(target)}</small></div>
      <div class="bar"><span class="${cls}" style="width:${Math.min(100, pct)}%"></span></div>
    </div>`;
}

// ------------------------------------------------------------- "Me" tab --
export function renderMe({ member, house, standing, myEntries, month, canDelete }) {
  const me = standing.members.find(m => m.name === member);
  const floor = standing.floor;
  const days = daysLeftIn(month);

  return `
    <section class="card">
      <div class="card-head">
        <div>
          <h2>Selamün aleyküm, ${esc(member.split(" ")[0])}</h2>
          <p class="muted">${esc(house.name)} · ${days} day${days === 1 ? "" : "s"} left in ${monthLabel(month)}</p>
        </div>
        <span class="chip ${me.ok ? "good" : "bad"}">${me.ok ? "Floor cleared" : "Below floor"}</span>
      </div>
      <div class="metrics">
        ${CATEGORIES.map(c => metric(c.short, me.totals[c.key], floor[c.key], true)).join("")}
      </div>
      <p class="fineprint" style="margin-top:12px">
        Your personal floor is ${Math.round(MIN_SHARE * 100)}% of each threshold:
        ${CAT_KEYS.map(k => `<strong>${floor[k]} ${CATEGORIES.find(c => c.key === k).short.toLowerCase()}</strong>`).join(", ")}.
        Miss one and the whole house is disqualified.
      </p>
    </section>

    <section class="card">
      <div class="card-head"><h2>Log progress</h2></div>
      <form id="logForm">
        <div class="seg" id="catSeg">
          ${CATEGORIES.map((c, i) => `
            <button type="button" class="seg-btn ${i === 0 ? "is-active" : ""}" data-cat="${c.key}">${c.short}</button>`).join("")}
        </div>
        <div class="logrow">
          <input type="number" id="logAmount" min="1" step="1" inputmode="numeric"
                 placeholder="How many?" required>
          <input type="text" id="logNote" maxlength="60" placeholder="Note (optional)">
          <button class="btn btn-primary" type="submit">Add</button>
        </div>
        <p class="fineprint" id="logHint" style="margin-top:9px">${CATEGORIES[0].hint}</p>
      </form>
      <div class="entries">
        ${myEntries.length ? myEntries.map(e => entryRow(e, canDelete)).join("")
                           : `<p class="empty">Nothing logged yet this month.</p>`}
      </div>
    </section>`;
}

function entryRow(e, canDelete, withName = false) {
  const cat = CATEGORIES.find(c => c.key === e.category);
  return `
    <div class="entry">
      <span class="entry-amt">+${nf(e.amount)} ${cat ? cat.short : e.category}</span>
      ${withName ? `<span class="entry-who">${esc(e.member)}</span>` : ""}
      <span class="entry-note">${esc(e.note)}</span>
      <span class="entry-date">${new Date(e.createdAt).toLocaleDateString(undefined, { day: "numeric", month: "short" })}</span>
      ${canDelete ? `<button class="entry-del" data-del="${e.id}" aria-label="Delete entry">×</button>` : ""}
    </div>`;
}

// ---------------------------------------------------------- "House" tab --
export function renderHouse({ house, standing, month }) {
  const days = daysLeftIn(month);
  const st = standing.status;

  return `
    <section class="card">
      <div class="card-head">
        <div>
          <h2>${esc(house.name)}</h2>
          <p class="muted">${esc(house.address)} · ${standing.memberCount} members</p>
        </div>
        <span class="chip ${st.tone}">${st.label}</span>
      </div>
      <div class="metrics">
        ${CATEGORIES.map(c => metric(c.short, standing.totals[c.key], THRESHOLDS[c.key], false)).join("")}
      </div>
      <p class="fineprint" style="margin-top:12px">${esc(st.detail)} · ${days} day${days === 1 ? "" : "s"} left</p>
    </section>

    <section class="card">
      <div class="card-head">
        <div>
          <h2>Who contributed what</h2>
          <p class="muted">Share of the house total, and whether each man cleared his floor</p>
        </div>
      </div>
      <div class="mem-list">
        ${standing.members.map(m => memberBlock(m, standing)).join("")}
      </div>
    </section>`;
}

function memberBlock(m, standing) {
  return `
    <div class="mem ${m.ok ? "" : "short"}">
      <div class="mem-top">
        <span class="mem-name">${esc(m.name)}</span>
        <span class="mem-flag">${m.ok ? "Floor cleared" : "Below floor"}</span>
      </div>
      <div class="mem-cats">
        ${CAT_KEYS.map(k => {
          const need = m.short[k];
          return `
          <div class="mem-cat">
            <div class="mem-cat-label">${CATEGORIES.find(c => c.key === k).short}</div>
            <div class="mem-cat-val ${need ? "miss" : ""}">${nf(m.totals[k])}</div>
            ${need ? `<div class="mem-cat-need">need ${need} more</div>`
                   : `<div class="mem-cat-share">${m.share[k].toFixed(0)}% of house</div>`}
            <div class="sharebar"><span style="width:${Math.min(100, m.share[k])}%"></span></div>
          </div>`;
        }).join("")}
      </div>
    </div>`;
}

// ------------------------------------------------------ "Standings" tab --
export function renderRank({ myHouseId, ranking, month, history }) {
  const mine = ranking.ordered.find(r => r.houseId === myHouseId);
  const total = ranking.ordered.length;

  const hero = mine.rank
    ? `<div class="rank-num">${mine.rank}<sup>${ordinal(mine.rank)}</sup></div>
       <div class="rank-of">of ${total} houses · ${ranking.qualifiedCount} qualified so far</div>`
    : `<div class="rank-unranked">Not ranked yet</div>
       <div class="rank-of">Only houses that qualify take a place.<br>
         ${ranking.qualifiedCount} of ${total} have qualified so far.</div>`;

  return `
    <section class="card">
      <div class="card-head"><h2>Your place · ${monthLabel(month)}</h2></div>
      <div class="rankhero">${hero}</div>
    </section>

    <section class="card">
      <div class="card-head">
        <div>
          <h2>The ladder</h2>
          <p class="muted">Other houses stay hidden. You only see where you sit</p>
        </div>
      </div>
      <div class="ladder">
        ${ranking.ordered.map((r, i) => rung(r, i, myHouseId)).join("")}
      </div>
    </section>

    <section class="card">
      <div class="card-head">
        <div>
          <h2>Past months</h2>
          <p class="muted">Closed and counted automatically on the 1st</p>
        </div>
      </div>
      ${history.length
        ? history.map(h => `
            <div class="histrow">
              <strong>${monthLabel(h.month)}</strong>
              <span class="muted">${h.winner
                ? `Winner: ${esc(h.winner.name)}`
                : "No house qualified"}</span>
            </div>`).join("")
        : `<p class="empty">No finished months yet. This month is the first.</p>`}
    </section>`;
}

function rung(r, i, myHouseId) {
  const isMine = r.houseId === myHouseId;
  const isTop = r.rank === 1;
  const pos = r.rank || "&middot;";
  return `
    <div class="rung ${isMine ? "mine" : ""} ${isTop ? "top" : ""}">
      <span class="rung-pos">${pos}</span>
      <span class="rung-name ${isMine ? "" : "hidden-house"}">
        ${isMine ? esc(r.name) : "Hidden house"}
      </span>
      <span class="rung-tail">
        ${isMine ? `score ${r.score.toFixed(1)}` : (r.qualified ? "qualified" : "not qualified")}
      </span>
    </div>`;
}

// -------------------------------------------------------- "Ev Abi" tab --
export function renderSettings({ house, allEntries }) {
  return `
    <section class="card">
      <div class="card-head"><h2>Ev Abi</h2></div>
      <p class="note">
        You have exactly two powers: set the password your housemates use to get in,
        and delete a wrong entry. Everything else happens automatically:
        the thresholds, the monthly reset and the winner.
      </p>
    </section>

    <section class="card">
      <div class="card-head">
        <div>
          <h2>House password</h2>
          <p class="muted">What ${esc(house.name)} types to get in. At least 6 characters.</p>
        </div>
      </div>
      <form id="housePwForm" class="stack">
        <label>New house password
          <input type="password" id="newHousePw" minlength="6" required
                 autocomplete="new-password" placeholder="New password">
        </label>
        <button class="btn btn-primary" type="submit">Change house password</button>
        <p class="fineprint">
          Housemates already signed in stay in. Anyone signing in fresh will need the new one.
        </p>
      </form>
    </section>

    <section class="card">
      <div class="card-head">
        <div>
          <h2>Ev Abi password</h2>
          <p class="muted">The second password that proves an Ev Abi. Shared by all five.</p>
        </div>
      </div>
      <form id="evAbiPwForm" class="stack">
        <label>New Ev Abi password
          <input type="password" id="newEvAbiPw" minlength="4" required
                 autocomplete="new-password" placeholder="New password">
        </label>
        <button class="btn btn-ghost" type="submit">Change Ev Abi password</button>
      </form>
    </section>

    <section class="card">
      <div class="card-head">
        <div>
          <h2>Fix an entry</h2>
          <p class="muted">Delete anything logged wrong this month</p>
        </div>
      </div>
      <div class="entries">
        ${allEntries.length
          ? allEntries.map(e => entryRow(e, true, true)).join("")
          : `<p class="empty">Nothing logged in the house yet.</p>`}
      </div>
    </section>`;
}
