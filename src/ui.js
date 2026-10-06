// ---------------------------------------------------------------------------
// ui.js: turns state into HTML. No network calls, no event wiring.
// ---------------------------------------------------------------------------

import { CATEGORIES, CAT_KEYS, THRESHOLDS, WEIGHTS, MIN_SHARE } from "./config.js";
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
    <button class="house-card" data-house="${esc(h.id)}">
      <span class="house-badge">${esc(h.code || initials(h.name))}</span>
      <span class="house-card-body">
        <span class="house-card-name">${esc(h.name)}</span>
        <span class="house-card-meta">${esc(h.address || "")}${h.address ? " · " : ""}${(h.members || []).length} members</span>
      </span>
      <span class="house-card-chev">›</span>
    </button>`).join("");
}

export function memberCards(house) {
  return (house.members || []).map((name, i) => `
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
export function renderMe({ member, house, standing, myEntries, month }) {
  const me = standing.members.find(m => m.name === member)
          || { totals: {}, short: {}, ok: false };
  const floor = standing.floor;
  const days = daysLeftIn(month);

  return `
    <section class="card">
      <div class="card-head">
        <div>
          <h2>Selamün aleyküm, ${esc(String(member).split(" ")[0])}</h2>
          <p class="muted">${esc(house.name)} · ${days} day${days === 1 ? "" : "s"} left in ${monthLabel(month)}</p>
        </div>
        <span class="chip ${me.ok ? "good" : "bad"}">${me.ok ? "Floor cleared" : "Below floor"}</span>
      </div>
      <div class="metrics">
        ${CATEGORIES.map(c => metric(c.short, me.totals[c.key] || 0, floor[c.key], true)).join("")}
      </div>
      <p class="fineprint" style="margin-top:12px">
        Everyone does the same ${Math.round(MIN_SHARE * 100)}% of each threshold:
        ${CAT_KEYS.map(k => `<strong>${floor[k]} ${CATEGORIES.find(c => c.key === k).short.toLowerCase()}</strong>`).join(", ")}.
        Fixed numbers, not a share of what the house logs.
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
        ${myEntries.length ? myEntries.map(e => entryRow(e, true)).join("")
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
export function renderHouse({ house, standing, viewMonth, months, isPast, entries, loading }) {
  const days = daysLeftIn(viewMonth);
  const st = standing.status;

  const picker = `
    <div class="monthbar">
      <label class="monthbar-label" for="monthPick">Month</label>
      <select id="monthPick">
        ${months.map(m => `
          <option value="${m.key}" ${m.key === viewMonth ? "selected" : ""}>
            ${monthLabel(m.key)}${m.current ? " (now)" : ""}
          </option>`).join("")}
      </select>
      ${isPast ? `<span class="chip">Closed</span>` : ""}
    </div>`;

  if (loading) {
    return `<section class="card">${picker}<p class="empty">Loading ${monthLabel(viewMonth)}…</p></section>`;
  }

  return `
    <section class="card">
      ${picker}
      <div class="card-head" style="margin-top:14px">
        <div>
          <h2>${esc(house.name)}</h2>
          <p class="muted">${esc(house.address || "")}${house.address ? " · " : ""}${standing.memberCount} members</p>
        </div>
        <span class="chip ${st.tone}">${st.label}</span>
      </div>
      <div class="metrics">
        ${CATEGORIES.map(c => metric(c.short, standing.totals[c.key], THRESHOLDS[c.key], false)).join("")}
      </div>
      <p class="fineprint" style="margin-top:12px">
        ${esc(st.detail)}${isPast ? ` · ${monthLabel(viewMonth)} is finished`
                                  : ` · ${days} day${days === 1 ? "" : "s"} left`}
      </p>
    </section>

    <section class="card">
      <div class="card-head">
        <div>
          <h2>Everyone's 10%</h2>
          <p class="muted">Each man needs ${CAT_KEYS.map(k => `${standing.floor[k]} ${CATEGORIES.find(c => c.key === k).short.toLowerCase()}`).join(", ")}</p>
        </div>
      </div>
      <div class="mem-list">
        ${standing.members.map(m => memberBlock(m, standing)).join("")}
      </div>
    </section>

    ${correctionPanel(house, viewMonth, entries, isPast)}`;
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
          const target = standing.floor[k];
          return `
          <div class="mem-cat">
            <div class="mem-cat-label">${CATEGORIES.find(c => c.key === k).short}</div>
            <div class="mem-cat-val ${need ? "miss" : ""}">${nf(m.totals[k])}<span class="mem-cat-of">/${target}</span></div>
            ${need ? `<div class="mem-cat-need">need ${need} more</div>`
                   : `<div class="mem-cat-share">done</div>`}
            <div class="sharebar"><span class="${need ? "" : "done"}" style="width:${m.floorPct[k]}%"></span></div>
          </div>`;
        }).join("")}
      </div>
    </div>`;
}

function correctionPanel(house, viewMonth, entries, isPast) {
  const rows = [...(entries || [])].sort((a, b) =>
    String(a.member).localeCompare(String(b.member)) ||
    String(a.category).localeCompare(String(b.category)));

  return `
    <section class="card">
      <div class="card-head">
        <div>
          <h2>Fix ${monthLabel(viewMonth)}</h2>
          <p class="muted">${isPast ? "This month is closed, but numbers can still be put right." : "Add to anyone, or delete a wrong row."}</p>
        </div>
      </div>

      <form id="fixForm" class="logform">
        <div class="logrow logrow-fix">
          <select id="fixMember">
            ${(house.members || []).map(m => `<option value="${esc(m)}">${esc(m)}</option>`).join("")}
          </select>
          <select id="fixCat">
            ${CATEGORIES.map(c => `<option value="${c.key}">${c.short}</option>`).join("")}
          </select>
          <input type="number" id="fixAmount" min="1" step="1" inputmode="numeric"
                 placeholder="Amount" required>
          <button class="btn btn-primary" type="submit">Add</button>
        </div>
        <p class="fineprint">
          Entries are append-only, so turning 20 into 30 means adding 10, or
          deleting the wrong row and adding a right one.
        </p>
      </form>

      <div class="entries">
        ${rows.length ? rows.map(e => entryRow(e, true, true)).join("")
                      : `<p class="empty">Nothing logged in ${monthLabel(viewMonth)}.</p>`}
      </div>
    </section>`;
}

// ---------------------------------------------------------- "Score" tab --
export function renderRank({ myHouseId, ranking, month, history, standing }) {
  const mine = ranking.ordered.find(r => r.houseId === myHouseId) || ranking.ordered[0];
  const total = ranking.ordered.length;
  const solo = total <= 1;

  const hero = mine?.rank
    ? `<div class="rank-num">${mine.rank}<sup>${ordinal(mine.rank)}</sup></div>
       <div class="rank-of">of ${total} house${total === 1 ? "" : "s"} · ${ranking.qualifiedCount} qualified</div>`
    : `<div class="rank-unranked">Not qualified yet</div>
       <div class="rank-of">A house takes a place only once it qualifies.</div>`;

  return `
    <section class="card">
      <div class="card-head"><h2>Final score · ${monthLabel(month)}</h2></div>
      <div class="rankhero">
        <div class="score-big">${standing.score.toFixed(1)}</div>
        <div class="rank-of">100 means every threshold hit exactly</div>
      </div>
      <div class="weighted">
        ${standing.breakdown.map(b => {
          const cat = CATEGORIES.find(c => c.key === b.key);
          return `
          <div class="wrow">
            <div class="wrow-head">
              <span class="wrow-name">${cat.short}</span>
              <span class="wrow-weight">${Math.round(b.weight * 100)}% weight</span>
            </div>
            <div class="wrow-bar"><span style="width:${Math.min(100, b.pctOfTarget)}%"></span></div>
            <div class="wrow-foot">
              <span>${nf(b.total)} / ${nf(b.threshold)}</span>
              <span class="wrow-points">+${b.points.toFixed(1)} pts</span>
            </div>
          </div>`;
        }).join("")}
        <div class="wtotal">
          <span>Total</span>
          <strong>${standing.score.toFixed(1)}</strong>
        </div>
      </div>
      <p class="fineprint" style="margin-top:12px">
        Books count ${Math.round(WEIGHTS.books * 100)}%, Qur&rsquo;an ${Math.round(WEIGHTS.quran * 100)}%,
        Cev&#351;en ${Math.round(WEIGHTS.cevsen * 100)}%. Reaching a threshold early
        keeps adding points, so going past 100 is possible.
      </p>
    </section>

    ${solo ? "" : `
    <section class="card">
      <div class="card-head"><h2>Your place</h2></div>
      <div class="rankhero">${hero}</div>
      <div class="ladder">
        ${ranking.ordered.map(r => rung(r, myHouseId)).join("")}
      </div>
    </section>`}

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
              <span class="muted">${h.winner ? `Winner: ${esc(h.winner.name)}` : "Nobody qualified"}</span>
            </div>`).join("")
        : `<p class="empty">No finished months yet.</p>`}
    </section>`;
}

function rung(r, myHouseId) {
  const isMine = r.houseId === myHouseId;
  const isTop = r.rank === 1;
  return `
    <div class="rung ${isMine ? "mine" : ""} ${isTop ? "top" : ""}">
      <span class="rung-pos">${r.rank || "&middot;"}</span>
      <span class="rung-name ${isMine ? "" : "hidden-house"}">
        ${isMine ? esc(r.name) : "Another house"}
      </span>
      <span class="rung-tail">${isMine ? `score ${r.score.toFixed(1)}` : (r.qualified ? "qualified" : "not qualified")}</span>
    </div>`;
}

// --------------------------------------------------------- "Houses" tab --
export function renderHouses({ houses, currentHouseId }) {
  return `
    <section class="card">
      <div class="card-head">
        <div>
          <h2>Houses</h2>
          <p class="muted">Add a house and its members. Nothing anyone logged is ever deleted.</p>
        </div>
      </div>
      <div class="house-admin">
        ${houses.map(h => `
          <div class="house-admin-row ${h.id === currentHouseId ? "is-current" : ""}">
            <span class="house-badge">${esc(h.code || initials(h.name))}</span>
            <span class="house-admin-body">
              <span class="house-card-name">${esc(h.name)}</span>
              <span class="house-card-meta">${(h.members || []).length} members${h.address ? " · " + esc(h.address) : ""}</span>
            </span>
            <button class="btn btn-ghost btn-sm" data-edit-house="${esc(h.id)}">Edit</button>
          </div>`).join("")}
      </div>
    </section>

    <section class="card">
      <div class="card-head">
        <div>
          <h2 id="houseFormTitle">Add a house</h2>
          <p class="muted">One member per line</p>
        </div>
      </div>
      <form id="houseForm" class="stack">
        <input type="hidden" id="houseEditingId" value="">
        <label>House name
          <input type="text" id="houseName" required maxlength="40" placeholder="Grand Regents">
        </label>
        <div class="logrow logrow-house">
          <label>Short code
            <input type="text" id="houseCode" maxlength="4" placeholder="GR">
          </label>
          <label>Address <span class="hint">optional</span>
            <input type="text" id="houseAddress" maxlength="60" placeholder="Regents 26th · 5x2">
          </label>
        </div>
        <label>Members, one per line
          <textarea id="houseMembers" rows="7" required
                    placeholder="Emre Tunca&#10;Serdar Can Cakin&#10;Enes Gurbuz"></textarea>
        </label>
        <p class="fineprint">The first name is the Ev Abi.</p>
        <div class="house-form-actions">
          <button class="btn btn-primary" type="submit" id="houseSave">Add house</button>
          <button class="btn btn-ghost" type="button" id="houseCancel" hidden>Cancel</button>
          <button class="btn btn-danger" type="button" id="houseDelete" hidden>Remove from list</button>
        </div>
        <p class="errmsg" id="houseError" hidden></p>
      </form>
    </section>`;
}
