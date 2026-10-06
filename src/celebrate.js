// ---------------------------------------------------------------------------
// celebrate.js: a quiet moment of şükür when someone logs progress.
//
// Deliberately gentle. Soft light rising rather than confetti exploding, a
// slow halo, and a word of thanks. The bigger the amount relative to that
// category's personal floor, the warmer and wider it gets, but it never turns
// into fireworks.
// ---------------------------------------------------------------------------

const TIERS = [
  { at: 0.00, name: "calm",  word: "Elhamdülillah", motes: 14, hue: 196, rise: 0.5, halo: 1 },
  { at: 0.25, name: "warm",  word: "Bârekallah",    motes: 22, hue: 176, rise: 0.6, halo: 1 },
  { at: 0.50, name: "bright",word: "Mâşallah",      motes: 32, hue: 152, rise: 0.7, halo: 2 },
  { at: 1.00, name: "gold",  word: "Mâşallah",      motes: 44, hue:  44, rise: 0.8, halo: 2 }
];

const pick = ratio => TIERS.reduce((best, t) => (ratio >= t.at ? t : best), TIERS[0]);

let raf = null;
let hideTimer = null;

/**
 * @param amount  how much was just logged
 * @param floor   that category's personal floor, used to scale the warmth
 * @param label   category name, e.g. "Books"
 */
export function celebrate(amount, floor, label) {
  const overlay = document.getElementById("celebrate");
  const canvas  = document.getElementById("celebrateCanvas");
  if (!overlay || !canvas) return;

  const ratio = floor > 0 ? amount / floor : 0.5;
  const tier = pick(ratio);
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

  document.getElementById("celebrateAmount").textContent = `+${amount.toLocaleString()}`;
  document.getElementById("celebrateLabel").textContent = label;
  document.getElementById("celebrateTier").textContent = tier.word;

  overlay.hidden = false;
  overlay.className = `celebrate is-on tier-${tier.name}`;
  overlay.style.setProperty("--glow-hue", tier.hue);

  clearTimeout(hideTimer);
  hideTimer = setTimeout(() => hide(overlay), reduced ? 1100 : 1900);
  if (reduced) return;

  const ctx = canvas.getContext("2d");
  const dpr = Math.min(devicePixelRatio || 1, 2);
  const w = canvas.width  = innerWidth  * dpr;
  const h = canvas.height = innerHeight * dpr;
  canvas.style.width  = innerWidth + "px";
  canvas.style.height = innerHeight + "px";

  const cx = w / 2, cy = h / 2;

  // Light motes drifting upward, like dust in a shaft of light.
  const motes = Array.from({ length: tier.motes }, () => ({
    x: cx + (Math.random() - 0.5) * innerWidth * 0.55 * dpr,
    y: cy + (Math.random() * 0.45 + 0.1) * innerHeight * dpr,
    r: (1.2 + Math.random() * 2.6) * dpr,
    vy: -(tier.rise + Math.random() * 0.7) * dpr,
    drift: (Math.random() - 0.5) * 0.35 * dpr,
    life: 0,                       // fades in, then out
    ttl: 60 + Math.random() * 50,
    hue: tier.hue + (Math.random() * 30 - 15)
  }));

  const halos = Array.from({ length: tier.halo }, (_, i) => ({
    r: 10 * dpr, life: 1, delay: i * 14
  }));

  let frame = 0;
  cancelAnimationFrame(raf);

  (function draw() {
    ctx.clearRect(0, 0, w, h);
    frame++;

    // Slow halo, barely there.
    for (const halo of halos) {
      if (frame < halo.delay) continue;
      halo.r += 2.6 * dpr;
      halo.life -= 0.013;
      if (halo.life <= 0) continue;
      ctx.beginPath();
      ctx.arc(cx, cy, halo.r, 0, Math.PI * 2);
      ctx.strokeStyle = `hsla(${tier.hue}, 70%, 65%, ${halo.life * 0.28})`;
      ctx.lineWidth = 1.6 * dpr;
      ctx.stroke();
    }

    let alive = false;
    for (const m of motes) {
      m.life++;
      if (m.life > m.ttl) continue;
      alive = true;
      m.y += m.vy;
      m.x += m.drift;

      // Ease in for the first third, out for the last third.
      const t = m.life / m.ttl;
      const alpha = t < 0.3 ? t / 0.3 : (t > 0.7 ? (1 - t) / 0.3 : 1);

      const g = ctx.createRadialGradient(m.x, m.y, 0, m.x, m.y, m.r * 3);
      g.addColorStop(0, `hsla(${m.hue}, 85%, 72%, ${alpha * 0.85})`);
      g.addColorStop(1, `hsla(${m.hue}, 85%, 72%, 0)`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(m.x, m.y, m.r * 3, 0, Math.PI * 2);
      ctx.fill();
    }

    if (alive || halos.some(x => x.life > 0)) {
      raf = requestAnimationFrame(draw);
    } else {
      ctx.clearRect(0, 0, w, h);
      hide(overlay);
    }
  })();
}

function hide(overlay) {
  cancelAnimationFrame(raf);
  overlay.classList.remove("is-on");
  overlay.hidden = true;
}
