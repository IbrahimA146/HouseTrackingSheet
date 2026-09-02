// ---------------------------------------------------------------------------
// scoring.js: the competition rules, as pure functions.
//
// Nothing in here touches the network or the DOM, so if the rules ever change
// this is the only file that needs to.
// ---------------------------------------------------------------------------

import { THRESHOLDS, CAT_KEYS, HOUSES, memberFloor } from "./config.js";

export const zeroTotals = () => CAT_KEYS.reduce((o, k) => (o[k] = 0, o), {});

/** Sum a list of entries into per-member totals. */
export function totalsByMember(entries) {
  const out = new Map();
  for (const e of entries) {
    if (!CAT_KEYS.includes(e.category)) continue;
    if (!out.has(e.member)) out.set(e.member, zeroTotals());
    out.get(e.member)[e.category] += Number(e.amount) || 0;
  }
  return out;
}

/**
 * Full standing for one house from its own entries.
 *
 * A house qualifies only if BOTH are true:
 *   1. all three house totals reach their thresholds, and
 *   2. every member has personally reached 10% of every threshold.
 */
export function houseStanding(house, entries, month = null) {
  const floor = memberFloor();
  const byMember = totalsByMember(entries);

  const members = house.members.map(name => {
    const totals = byMember.get(name) || zeroTotals();
    const short = {};
    let ok = true;
    for (const k of CAT_KEYS) {
      const gap = Math.max(0, floor[k] - totals[k]);
      short[k] = gap;
      if (gap > 0) ok = false;
    }
    return { name, totals, short, ok };
  });

  const totals = zeroTotals();
  for (const m of members) for (const k of CAT_KEYS) totals[k] += m.totals[k];

  // Share of the house's own effort, per category: "who carried what".
  for (const m of members) {
    m.share = {};
    for (const k of CAT_KEYS) {
      m.share[k] = totals[k] > 0 ? (m.totals[k] / totals[k]) * 100 : 0;
    }
  }

  const metThreshold = CAT_KEYS.every(k => totals[k] >= THRESHOLDS[k]);
  const shortMembers = members.filter(m => !m.ok);
  const allMembersOk = members.length > 0 && shortMembers.length === 0;

  return {
    houseId: house.id,
    name: house.name,
    memberCount: members.length,
    members,
    totals,
    floor,
    metThreshold,
    allMembersOk,
    shortMembers,
    qualified: metThreshold && allMembersOk,
    score: scoreOf(totals),
    status: statusOf(metThreshold, allMembersOk, shortMembers.length,
                     month ? daysLeftIn(month) === 0 : false)
  };
}

/** Mean completion across the three categories, as a percentage. */
export function scoreOf(totals) {
  const sum = CAT_KEYS.reduce((s, k) => s + totals[k] / THRESHOLDS[k], 0);
  return (sum / CAT_KEYS.length) * 100;
}

/**
 * Nothing is actually lost until the month ends, so a live month never says
 * "Disqualified". On the 1st every house has zero of everything, and greeting
 * all five with a red DISQUALIFIED would be both discouraging and untrue.
 * The per-member cards still show exactly who is short, all month long.
 */
function statusOf(metThreshold, allMembersOk, shortCount, monthOver) {
  const men = n => `${n} member${n === 1 ? "" : "s"}`;

  if (metThreshold && allMembersOk) {
    return { tone: "good", label: "Qualified", detail: "Reward earned" };
  }

  if (monthOver) {
    return allMembersOk
      ? { tone: "bad", label: "Below threshold",
          detail: "The house did not reach all three thresholds" }
      : { tone: "bad", label: "Disqualified",
          detail: `${men(shortCount)} finished below the 10% floor` };
  }

  // Month still running.
  if (!allMembersOk) {
    return { tone: "warn", label: "At risk",
             detail: `${men(shortCount)} still below the 10% floor` };
  }
  return { tone: "warn", label: "On track",
           detail: "Everyone has cleared his floor, thresholds still to go" };
}

/**
 * Rank every house from the lightweight public standings records.
 * Only qualified houses take a reward place; the rest are unranked.
 *
 * `records` is [{ houseId, totals, qualified }, ...] and carries no member
 * detail, which is what lets a house see its position without seeing anyone
 * else's numbers.
 */
export function rankHouses(records) {
  const rows = HOUSES.map(h => {
    const rec = records.find(r => r.houseId === h.id);
    const totals = rec ? rec.totals : zeroTotals();
    return {
      houseId: h.id,
      name: h.name,
      qualified: !!(rec && rec.qualified),
      score: scoreOf(totals)
    };
  });

  const ranked = rows
    .filter(r => r.qualified)
    .sort((a, b) => b.score - a.score);
  ranked.forEach((r, i) => { r.rank = i + 1; });

  // Houses that haven't qualified are listed after, still ordered by score so
  // they can see how far off the pace they are.
  const rest = rows.filter(r => !r.qualified).sort((a, b) => b.score - a.score);

  return { ordered: [...ranked, ...rest], qualifiedCount: ranked.length, rows };
}

/** Winner of a finished month, or null if nobody qualified. */
export function winnerOf(records) {
  const { ordered } = rankHouses(records);
  const top = ordered.find(r => r.rank === 1);
  return top || null;
}

// --- calendar -------------------------------------------------------------

export const monthKey = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

/** Compact form for tight spaces, e.g. "Sep 2026". */
export function monthLabelShort(key) {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1)
    .toLocaleDateString(undefined, { month: "short", year: "numeric" });
}

export function monthLabel(key) {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1)
    .toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

/** Days left in the month the key refers to (0 once it's in the past). */
export function daysLeftIn(key, now = new Date()) {
  const [y, m] = key.split("-").map(Number);
  const end = new Date(y, m, 1);              // first day of the next month
  return Math.max(0, Math.ceil((end - now) / 86400000));
}

export function previousMonths(count, from = monthKey()) {
  const [y, m] = from.split("-").map(Number);
  const out = [];
  for (let i = 1; i <= count; i++) {
    const d = new Date(y, m - 1 - i, 1);
    out.push(monthKey(d));
  }
  return out;
}
