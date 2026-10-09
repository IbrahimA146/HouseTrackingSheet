// ---------------------------------------------------------------------------
// celebrate.js: an old-timey cartoon riot when someone logs progress.
//
// Every entry gets the full show, however small. Logging one page should feel
// like winning something. The amount only decides how much extra confetti gets
// thrown on top, never whether the party happens.
// ---------------------------------------------------------------------------

// Flung across the screen on every log. Mixed Turkish and English on purpose.
const COMPLIMENTS = [
  "MÂŞALLAH!", "WOW!", "HELAL OLSUN!", "LEGEND!", "Bârekallah!",
  "AFERİN!", "UNSTOPPABLE!", "Elhamdülillah!", "YOU'RE AWESOME!",
  "EFSANE!", "ON FIRE!", "SUBHANALLAH!", "BRAVO!", "MACHINE!",
  "KEEP GOING!", "ÇOK GÜZEL!", "SUPERB!", "ALLAH RAZI OLSUN!",
  "BEAST MODE!", "HARİKA!", "THE GOAT!", "AMAZING!", "DEVAM!",
  "TOP TIER!", "MAŞALLAH BARAKALLAH!", "YOU LOVE TO SEE IT!",
  "ABSOLUTE UNIT!", "NO NOTES!", "SPECTACULAR!", "EYVALLAH!"
];

// The headline inside the card. Always enthusiastic.
const HEADLINES = [
  "MÂŞALLAH!!", "LEGENDARY!!", "HELAL OLSUN!!", "INCREDIBLE!!",
  "UNSTOPPABLE!!", "AFERİN!!", "WHAT A MOVE!!", "EFSANE!!"
];

const HUES = [42, 196, 150, 330, 262, 14, 176];
const rand = arr => arr[Math.floor(Math.random() * arr.length)];

let raf = null;
let hideTimer = null;

/**
 * @param amount  how much was just logged
 * @param floor   that category's personal floor; only adds extra flair
 * @param label   category name, e.g. "Books"
 */
export function celebrate(amount, floor, label) {
  const overlay = document.getElementById("celebrate");
  const canvas  = document.getElementById("celebrateCanvas");
  const wordBox = document.getElementById("celebrateWords");
  if (!overlay || !canvas) return;

  // Everyone gets a party. Big logs just get a bigger one.
  const ratio = floor > 0 ? Math.min(amount / floor, 1) : 0.5;
  const extra = Math.round(ratio * 10);
  const hue = rand(HUES);
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

  document.getElementById("celebrateAmount").textContent = `+${amount.toLocaleString()}`;
  document.getElementById("celebrateLabel").textContent = label;
  document.getElementById("celebrateTier").textContent = rand(HEADLINES);

  overlay.hidden = false;
  overlay.className = "celebrate is-on";
  overlay.style.setProperty("--glow-hue", hue);

  // ---- compliments flooding the screen --------------------------------
  wordBox.innerHTML = "";
  if (!reduced) {
    const count = 14 + extra;
    const picked = shuffle([...COMPLIMENTS]).slice(0, count);
    picked.forEach((word, i) => {
      // Two elements on purpose: the outer one carries the random position,
      // tilt and size as a static transform, the inner one runs the animation.
      // Keyframes that reference var() get dropped by the browser, which left
      // every word frozen at scale(0).
      const el = document.createElement("span");
      el.className = "cword";
      const inner = document.createElement("span");
      inner.className = "cword-in";
      inner.textContent = word;
      el.appendChild(inner);
      // Scatter wide, and keep the middle band clearer so the card stays read.
      const left = 4 + Math.random() * 84;
      const top = Math.random() < 0.5
        ? 4 + Math.random() * 30          // upper band
        : 62 + Math.random() * 30;        // lower band
      el.style.left = left + "%";
      el.style.top = top + "%";
      const tilt = (Math.random() * 44 - 22).toFixed(1);
      const scale = (0.75 + Math.random() * 0.85).toFixed(2);
      el.style.transform = `rotate(${tilt}deg) scale(${scale})`;
      el.style.setProperty("--hue", rand(HUES));
      inner.style.animationDelay = (i * 45 + Math.random() * 90).toFixed(0) + "ms";
      wordBox.appendChild(el);
    });
  }

  clearTimeout(hideTimer);
  hideTimer = setTimeout(() => hide(overlay), reduced ? 1200 : 2800);
  if (reduced) return;

  // ---- cartoon burst on canvas ----------------------------------------
  const ctx = canvas.getContext("2d");
  const dpr = Math.min(devicePixelRatio || 1, 2);
  const w = canvas.width  = innerWidth  * dpr;
  const h = canvas.height = innerHeight * dpr;
  canvas.style.width  = innerWidth + "px";
  canvas.style.height = innerHeight + "px";

  const cx = w / 2, cy = h / 2;
  const reach = Math.hypot(w, h) * 0.6;

  const lineCount = 40 + extra * 2;
  const lines = Array.from({ length: lineCount }, (_, i) => ({
    angle: (Math.PI * 2 * i) / lineCount + (Math.random() - 0.5) * 0.25,
    inner: 40 * dpr,
    len: (90 + Math.random() * 170) * dpr,
    speed: (16 + Math.random() * 18) * dpr,
    width: (3 + Math.random() * 8) * dpr,
    life: 1
  }));

  const starCount = 20 + extra * 2;
  const stars = Array.from({ length: starCount }, () => {
    const a = Math.random() * Math.PI * 2;
    const sp = (7 + Math.random() * 13) * dpr;
    return {
      x: cx, y: cy,
      vx: Math.cos(a) * sp,
      vy: Math.sin(a) * sp - 5 * dpr,
      r: (9 + Math.random() * 15) * dpr,
      rot: Math.random() * Math.PI,
      spin: (Math.random() - 0.5) * 0.45,
      hue: rand(HUES),
      life: 1
    };
  });

  const rings = [{ r: 20 * dpr, life: 1, delay: 0 }, { r: 10 * dpr, life: 1, delay: 10 }];
  let frame = 0;
  cancelAnimationFrame(raf);

  (function draw() {
    ctx.clearRect(0, 0, w, h);
    frame++;
    let alive = false;

    for (const ring of rings) {
      if (frame < ring.delay || ring.life <= 0) continue;
      alive = true;
      ring.r += 26 * dpr;
      ring.life -= 0.04;
      ctx.beginPath();
      ctx.arc(cx, cy, ring.r, 0, Math.PI * 2);
      ctx.strokeStyle = `hsla(${hue}, 90%, 55%, ${Math.max(0, ring.life) * 0.65})`;
      ctx.lineWidth = 9 * dpr * Math.max(0, ring.life);
      ctx.stroke();
    }

    for (const L of lines) {
      if (L.life <= 0) continue;
      L.inner += L.speed;
      L.life -= 0.03;
      if (L.inner > reach) { L.life = 0; continue; }
      alive = true;
      const x1 = cx + Math.cos(L.angle) * L.inner;
      const y1 = cy + Math.sin(L.angle) * L.inner;
      const x2 = cx + Math.cos(L.angle) * (L.inner + L.len);
      const y2 = cy + Math.sin(L.angle) * (L.inner + L.len);
      ctx.strokeStyle = `hsla(${hue}, 95%, 52%, ${Math.max(0, L.life) * 0.8})`;
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
      s.vy += 0.4 * dpr;
      s.vx *= 0.99;
      s.rot += s.spin;
      s.life -= 0.013;
      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.rotate(s.rot);
      ctx.fillStyle = `hsla(${s.hue}, 95%, 58%, ${Math.max(0, s.life)})`;
      ctx.strokeStyle = `hsla(${s.hue}, 90%, 26%, ${Math.max(0, s.life) * 0.85})`;
      ctx.lineWidth = 2 * dpr;
      star(ctx, s.r);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

    if (alive) raf = requestAnimationFrame(draw);
    else ctx.clearRect(0, 0, w, h);
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

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function hide(overlay) {
  cancelAnimationFrame(raf);
  overlay.classList.remove("is-on");
  overlay.hidden = true;
  const wordBox = document.getElementById("celebrateWords");
  if (wordBox) wordBox.innerHTML = "";
}
