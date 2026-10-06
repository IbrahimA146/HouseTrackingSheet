// ---------------------------------------------------------------------------
// celebrate.js: an old-timey cartoon burst when someone logs progress.
//
// Rubber-hose era silliness: radiating speed lines, tumbling stars, a big
// squash-and-stretch pop, and a bit of film wobble. The bigger the amount
// relative to that category's personal floor, the sillier it gets.
// ---------------------------------------------------------------------------

const TIERS = [
  { at: 0.00, name: "calm",   word: "Elhamdülillah",  lines: 14, stars:  4, hue: 196, pop: 1 },
  { at: 0.25, name: "warm",   word: "Bârekallah!",    lines: 22, stars:  8, hue: 176, pop: 2 },
  { at: 0.50, name: "bright", word: "Mâşallah!",      lines: 32, stars: 14, hue: 150, pop: 3 },
  { at: 1.00, name: "gold",   word: "MÂŞALLAH!!",     lines: 46, stars: 22, hue:  42, pop: 4 }
];

const pick = ratio => TIERS.reduce((best, t) => (ratio >= t.at ? t : best), TIERS[0]);

let raf = null;
let hideTimer = null;

/**
 * @param amount  how much was just logged
 * @param floor   that category's personal floor, used to scale the show
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
  overlay.className = `celebrate is-on tier-${tier.name} pop-${tier.pop}`;
  overlay.style.setProperty("--glow-hue", tier.hue);

  clearTimeout(hideTimer);
  hideTimer = setTimeout(() => hide(overlay), reduced ? 1100 : 2200);
  if (reduced) return;

  const ctx = canvas.getContext("2d");
  const dpr = Math.min(devicePixelRatio || 1, 2);
  const w = canvas.width  = innerWidth  * dpr;
  const h = canvas.height = innerHeight * dpr;
  canvas.style.width  = innerWidth + "px";
  canvas.style.height = innerHeight + "px";

  const cx = w / 2, cy = h / 2;
  const reach = Math.hypot(w, h) * 0.55;

  // Classic cartoon impact lines: tapered spokes that shoot out and thin away.
  const lines = Array.from({ length: tier.lines }, (_, i) => {
    const jitter = (Math.random() - 0.5) * 0.25;
    return {
      angle: (Math.PI * 2 * i) / tier.lines + jitter,
      inner: 40 * dpr,
      len: (90 + Math.random() * 150) * dpr,
      speed: (16 + Math.random() * 16) * dpr,
      width: (3 + Math.random() * 7) * dpr,
      life: 1
    };
  });

  // Tumbling stars, flung out with a bit of gravity so they arc like gags.
  const stars = Array.from({ length: tier.stars }, () => {
    const a = Math.random() * Math.PI * 2;
    const sp = (7 + Math.random() * 11) * dpr;
    return {
      x: cx, y: cy,
      vx: Math.cos(a) * sp,
      vy: Math.sin(a) * sp - 5 * dpr,
      r: (9 + Math.random() * 13) * dpr,
      rot: Math.random() * Math.PI,
      spin: (Math.random() - 0.5) * 0.42,
      hue: tier.hue + (Math.random() * 46 - 23),
      life: 1
    };
  });

  // One fat expanding ring, the cartoon "impact" ripple.
  const ring = { r: 20 * dpr, life: 1 };

  cancelAnimationFrame(raf);

  (function draw() {
    ctx.clearRect(0, 0, w, h);

    if (ring.life > 0) {
      ring.r += 26 * dpr;
      ring.life -= 0.045;
      ctx.beginPath();
      ctx.arc(cx, cy, ring.r, 0, Math.PI * 2);
      ctx.strokeStyle = `hsla(${tier.hue}, 90%, 55%, ${ring.life * 0.7})`;
      ctx.lineWidth = 9 * dpr * ring.life;
      ctx.stroke();
    }

    let alive = ring.life > 0;

    for (const L of lines) {
      if (L.life <= 0) continue;
      alive = true;
      L.inner += L.speed;
      L.life -= 0.034;
      if (L.inner > reach) { L.life = 0; continue; }

      const x1 = cx + Math.cos(L.angle) * L.inner;
      const y1 = cy + Math.sin(L.angle) * L.inner;
      const x2 = cx + Math.cos(L.angle) * (L.inner + L.len);
      const y2 = cy + Math.sin(L.angle) * (L.inner + L.len);

      ctx.strokeStyle = `hsla(${tier.hue}, 95%, 52%, ${Math.max(0, L.life) * 0.8})`;
      ctx.lineWidth = L.width * Math.max(0, L.life);
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }

    for (const s of stars) {
      if (s.life <= 0) continue;
      alive = true;
      s.x += s.vx;
      s.y += s.vy;
      s.vy += 0.42 * dpr;        // gravity, so they arc and drop
      s.vx *= 0.99;
      s.rot += s.spin;
      s.life -= 0.016;

      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.rotate(s.rot);
      ctx.fillStyle = `hsla(${s.hue}, 95%, 58%, ${Math.max(0, s.life)})`;
      ctx.strokeStyle = `hsla(${s.hue}, 90%, 28%, ${Math.max(0, s.life) * 0.8})`;
      ctx.lineWidth = 2 * dpr;
      star(ctx, s.r);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

    if (alive) raf = requestAnimationFrame(draw);
    else { ctx.clearRect(0, 0, w, h); hide(overlay); }
  })();
}

/** Five-pointed star centred on the current transform origin. */
function star(ctx, r) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const rad = i % 2 === 0 ? r : r * 0.45;
    const a = (Math.PI / 5) * i - Math.PI / 2;
    const x = Math.cos(a) * rad, y = Math.sin(a) * rad;
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  }
  ctx.closePath();
}

function hide(overlay) {
  cancelAnimationFrame(raf);
  overlay.classList.remove("is-on");
  overlay.hidden = true;
}
