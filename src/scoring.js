// ---------------------------------------------------------------------------
// scoring.js: the competition rules, as pure functions.
//
// Nothing here touches the network or the DOM, so if the rules change this is
// the only file that needs to.
// ---------------------------------------------------------------------------

import { THRESHOLDS, CAT_KEYS, WEIGHTS, memberFloor } from "./config.js";

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
 *   2. every member has personally reached 10% of every THRESHOLD.
 *
 * The per-member floor is a fixed number (50 / 8 / 30), not a share of what
 * the house happened to log. One man short in one category and the whole
 * house is out, however good the totals look.
 */
export function houseStanding(house, entries, month = null) {
  const floor = memberFloor();
  const byMember = totalsByMember(entries);
  const roster = house?.members || [];

  const members = roster.map(name => {
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

  // How far each man got through his own floor, plus what he put into the
  // house pot. The first is the rule; the second is just interesting.
  for (const m of members) {
    m.floorPct = {};
    m.share = {};
    for (const k of CAT_KEYS) {
      m.floorPct[k] = floor[k] > 0 ? Math.min(100, (m.totals[k] / floor[k]) * 100) : 100;
      m.share[k] = totals[k] > 0 ? (m.totals[k] / totals[k]) * 100 : 0;
    }
  }

  const metThreshold = CAT_KEYS.every(k => totals[k] >= THRESHOLDS[k]);
  const shortMembers = members.filter(m => !m.ok);
  const allMembersOk = members.length > 0 && shortMembers.length === 0;

  return {
    houseId: house?.id,
    name: house?.name,
    memberCount: members.length,
    members,
    totals,
    floor,
    metThreshold,
    allMembersOk,
    shortMembers,
    qualified: metThreshold && allMembersOk,
    score: scoreOf(totals),
    breakdown: breakdownOf(totals),
    status: statusOf(metThreshold, allMembersOk, shortMembers.length,
                     month ? daysLeftIn(month) === 0 : false)
  };
}

/**
 * Final score, weighted: books 60%, Qur'an 30%, Cevsen 10%.
 * 100 means every threshold met exactly. Over 100 means ahead of target.
 */
export function scoreOf(totals) {
  return CAT_KEYS.reduce(
    (s, k) => s + WEIGHTS[k] * (totals[k] / THRESHOLDS[k]), 0) * 100;
}

/** What each category contributed to the final score, for showing the maths. */
export function breakdownOf(totals) {
  return CAT_KEYS.map(k => ({
    key: k,
    total: totals[k],
    threshold: THRESHOLDS[k],
    weight: WEIGHTS[k],
    pctOfTarget: (totals[k] / THRESHOLDS[k]) * 100,
    points: WEIGHTS[k] * (totals[k] / THRESHOLDS[k]) * 100
  }));
}

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
  if (!allMembersOk) {
    return { tone: "warn", label: "At risk",
             detail: `${men(shortCount)} still below the 10% floor` };
  }
  return { tone: "warn", label: "On track",
           detail: "Everyone has cleared his floor, thresholds still to go" };
}

/**
 * Rank houses from the public standings records (totals only, no member
 * detail). Only qualified houses take a reward place.
 */
export function rankHouses(records, houses = []) {
  const rows = houses.map(h => {
    const rec = records.find(r => r.houseId === h.id);
    const totals = rec ? rec.totals : zeroTotals();
    return {
      houseId: h.id,
      name: h.name,
      qualified: !!(rec && rec.qualified),
      totals,
      score: scoreOf(totals),
      breakdown: breakdownOf(totals)
    };
  });

  const ranked = rows.filter(r => r.qualified).sort((a, b) => b.score - a.score);
  ranked.forEach((r, i) => { r.rank = i + 1; });
  const rest = rows.filter(r => !r.qualified).sort((a, b) => b.score - a.score);

  return { ordered: [...ranked, ...rest], qualifiedCount: ranked.length, rows };
}

/** Winner of a finished month, or null if nobody qualified. */
export function winnerOf(records, houses = []) {
  const { ordered } = rankHouses(records, houses);
  return ordered.find(r => r.rank === 1) || null;
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
  const end = new Date(y, m, 1);
  return Math.max(0, Math.ceil((end - now) / 86400000));
}

/**
 * Every month from `start` up to `upTo`, newest first. The list grows by one
 * each month instead of scrolling old months off the back.
 */
export function monthsSince(start, upTo = monthKey()) {
  const out = [];
  let [y, m] = upTo.split("-").map(Number);
  const [sy, sm] = start.split("-").map(Number);
  if (sy * 12 + sm > y * 12 + m) return [upTo];
  while (y * 12 + m >= sy * 12 + sm) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    if (--m === 0) { m = 12; y--; }
  }
  return out;
}
