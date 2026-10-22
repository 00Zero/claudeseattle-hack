/* Pixel Seattle (client-only: touches window and canvas; import from a "use client" component).
   Pixel Seattle: a canvas skyline drawn on one pixel grid, with weather and time of day.
 Looking east from Elliott Bay: Space Needle (north, left), the monorail, AI House on Pier 70, downtown, the Great Wheel on the waterfront,
 Smith Tower, Lumen Field (south, right), a Terminal 46 crane, Mount Rainier behind to the southeast.

 const sky = initSkyline({ canvas, theme: 'light'|'dark' })
 sky.setWeather({ code, isDay, windMph, tempF, sunrise, sunset })   // Open-Meteo fields
 sky.setTheme('dark'); sky.landmarks()  -> { needle: {x, top}, ground } in CSS px; sky.scale; sky.groundY
 sky.setTime(new Date(...)) previews another time of day (null for the real clock) */
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const mix = (a, b, t) => { const A = hex(a), B = hex(b); return `rgb(${Math.round(lerp(A[0], B[0], t))},${Math.round(lerp(A[1], B[1], t))},${Math.round(lerp(A[2], B[2], t))})`; };
// Deterministic noise so windows and stars stay put between frames.
const hash = (x, y) => { let h = (x * 374761393 + y * 668265263) ^ 0x5bd1e995; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967295; };
const toHex = (s) => s[0] === "#" ? s : "#" + s.match(/\d+/g).slice(0, 3).map((n) => (+n).toString(16).padStart(2, "0")).join("");
const smooth = (x) => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };
const HOUR = 3600000, LUNAR_DAY = 24.84 * HOUR;
// Moon phase, low precision (Meeus, Astronomical Algorithms, ch. 48): illuminated fraction within a fraction of a percent.
// age is the mean elongation as a fraction of the synodic month (0 new, 0.5 full).
function moonPhase(ms) {
  const T = (ms / 86400000 + 2440587.5 - 2451545) / 36525, r = Math.PI / 180;
  const D = 297.8501921 + 445267.1114034 * T, M = 357.5291092 + 35999.0502909 * T, Mp = 134.9633964 + 477198.8675055 * T;
  const i = 180 - D - 6.289 * Math.sin(Mp * r) + 2.1 * Math.sin(M * r) - 1.274 * Math.sin((2 * D - Mp) * r) - 0.658 * Math.sin(2 * D * r) - 0.214 * Math.sin(2 * Mp * r) - 0.11 * Math.sin(D * r);
  const age = (((D % 360) + 360) % 360) / 360;
  return { lit: (1 + Math.cos(i * r)) / 2, waxing: age < 0.5, age };
}

const PAL = {
  light: {
    day:   { sky: ["#F6F3EC", "#E9E6DD", "#DCDAD2"], far: "#C9C6BC", mtn: "#B9B6AC", snow: "#FAF9F5", hillFar: "#A9B2A3", hillNear: "#7E8C78", bld: "#2B2A27", bldLight: "#4A4945", bldPale: "#EDEAE1", win: "#F0C988", water: ["#9FB8C6", "#8CA9B8", "#7F9DAD"], wave: "#C9DAE2", cloud: "#FFFFFF", cloudShade: "#E3E0D7", rain: "rgba(74,122,150,.55)", ground: "#6B6A64", ndl: "#F8F6F0", ndlShade: "#D9D5C9", ndlEdge: "#8F8C83", brick: "#A65B47", brickShade: "#7E4436", roof: "#33415C", glass: "#6F8FA3", crane: "#D9694A", craneShade: "#A84E36", pier: "#E6E4DD", pierRoof: "#8F928F", pierRed: "#B0383A" },
    night: { sky: ["#2B3140", "#1F2430", "#161A24"], far: "#2C3340", mtn: "#3A4150", snow: "#AEB6C4", hillFar: "#2A3330", hillNear: "#1C2522", bld: "#121212", bldLight: "#1E1E1C", bldPale: "#55565A", win: "#F5C66B", water: ["#243040", "#1C2634", "#141C27"], wave: "#3E5468", cloud: "#3A4150", cloudShade: "#2A303C", rain: "rgba(140,170,190,.5)", ground: "#2A2A28", ndl: "#C8CAD0", ndlShade: "#9A9DA6", ndlEdge: "#3A4050", brick: "#4A2E28", brickShade: "#33201C", roof: "#1A2030", glass: "#2E3A48", crane: "#7A3A2A", craneShade: "#5A2A1E", pier: "#7A7D86", pierRoof: "#3E434E", pierRed: "#5A2228" },
  },
  dark: {
    day:   { sky: ["#23262B", "#1D1F23", "#17181B"], far: "#2E3137", mtn: "#3B3E45", snow: "#B9B6AC", hillFar: "#2C3530", hillNear: "#1F2924", bld: "#0E0E0D", bldLight: "#1E1E1C", bldPale: "#5A5A57", win: "#E9C27B", water: ["#223038", "#1B2730", "#151F27"], wave: "#3C5260", cloud: "#2E3137", cloudShade: "#24272C", rain: "rgba(140,170,190,.45)", ground: "#2A2A28", ndl: "#D8D5CB", ndlShade: "#A9A69C", ndlEdge: "#3E4046", brick: "#6E4136", brickShade: "#4E2F27", roof: "#232B3B", glass: "#3A4A57", crane: "#A85440", craneShade: "#7E3E2F", pier: "#9C9A93", pierRoof: "#55585A", pierRed: "#7E2C2E" },
    night: { sky: ["#161A24", "#10131B", "#0B0D12"], far: "#1E2430", mtn: "#2A3140", snow: "#8E97A8", hillFar: "#1A2320", hillNear: "#121A16", bld: "#0A0A0A", bldLight: "#161616", bldPale: "#3E4044", win: "#F5C66B", water: ["#121A26", "#0E141E", "#0A0F17"], wave: "#2A3C4C", cloud: "#1E2430", cloudShade: "#161B24", rain: "rgba(140,170,190,.45)", ground: "#1A1A19", ndl: "#AEB2BC", ndlShade: "#7E838E", ndlEdge: "#262B36", brick: "#3A2621", brickShade: "#2A1B17", roof: "#141824", glass: "#1E2834", crane: "#5E2E22", craneShade: "#43201A", pier: "#5C606A", pierRoof: "#2E333C", pierRed: "#4A1C20" },
  },
};
// Sunrise and sunset colors, mixed over the palette near those times: sky bands top to horizon, alpenglow on Rainier, the bay and clouds.
// Sunset is the vivid one; sunrise is softer.
const GLOW = {
  dusk: { sky: ["#5B4E8C", "#D9668A", "#F28B3C"], snow: "#F7A8A0", mtn: "#8E6A8C", far: "#C98A9A", cloud: "#FFB27A", cloudShade: "#C0607A", water: ["#B9708A", "#8E5E80", "#6E5272"], wave: "#F4A27A", sun: "#F06A35", sunRim: "#F59A50" },
  dawn: { sky: ["#7F8FC0", "#E9A3B5", "#F7C98A"], snow: "#F9CDB4", mtn: "#9C8AA0", far: "#D6B0B4", cloud: "#FFD6B0", cloudShade: "#D9A0A8", water: ["#C4A4B4", "#A08CA6", "#8A7D98"], wave: "#F7CDA8", sun: "#F5A04A", sunRim: "#F8C27A" },
};
const GLOW_WEIGHT = { water: 0.5, wave: 0.5, far: 0.7 };
const WX = { // Open-Meteo WMO codes -> kind
  kind(code) { if (code == null) return "drizzle"; if (code === 0) return "clear"; if (code <= 2) return "partly"; if (code === 3) return "overcast"; if (code <= 48) return "fog"; if (code <= 57) return "drizzle"; if (code <= 67) return "rain"; if (code <= 77) return "snow"; if (code <= 82) return "showers"; if (code <= 86) return "snow"; return "thunder"; },
  label(code) { return { clear: "Clear", partly: "Partly cloudy", overcast: "Overcast", fog: "Fog", drizzle: "Drizzle", rain: "Rain", snow: "Snow", showers: "Showers", thunder: "Thunderstorms" }[this.kind(code)]; },
};

function initSkyline(opts) {
  const canvas = typeof opts.canvas === "string" ? document.querySelector(opts.canvas) : opts.canvas;
  const ctx = canvas.getContext("2d");
  const REDUCE = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let theme = opts.theme || "light";
  let wx = { code: 51, isDay: 1, windMph: 6, tempF: 54, sunrise: null, sunset: null };
  let W = 320, H = 96, scale = 4, G = 80;
  // Three static layers: back (sky, sun, moon, Rainier), front (hills, buildings) and the Space Needle on top.
  // Clouds drift between back and front; the monorail runs between front and the Needle.
  const layer = () => { const cv = document.createElement("canvas"); return [cv, cv.getContext("2d")]; };
  const [back, bctx] = layer(), [front, fctx] = layer(), [fore, nctx] = layer();
  let statDirty = true, lastStatic = 0;
  const api = { scale, groundY: 0 };

  // Scene state
  let t = 0, wheelAngle = 0, ferry = { x: -40, dir: 1, speed: 5 }, flash = 0;
  let drops = [], flakes = [], clouds = [], gulls = [];
  let needleX = 0, needleTop = 0, monoX1 = 0, monoY = 0;

  function resize() {
    const cssW = canvas.clientWidth || canvas.parentElement.clientWidth || 960;
    scale = cssW >= 1000 ? 4 : cssW >= 640 ? 3 : 2;
    W = Math.ceil(cssW / scale); H = cssW >= 640 ? 96 : 110; G = H - 16;
    canvas.width = W; canvas.height = H; for (const cv of [back, front, fore]) { cv.width = W; cv.height = H; }
    canvas.style.height = H * scale + "px";
    api.scale = scale; api.groundY = G * scale; api.width = W * scale; api.height = H * scale;
    drops = []; flakes = []; seedClouds(); seedGulls(); ferry.x = -40; statDirty = true;
  }

  // ---------- pixel helpers ----------
  const P = (c, x, y, col) => { c.fillStyle = col; c.fillRect(x | 0, y | 0, 1, 1); };
  const R = (c, x, y, w, h, col) => { c.fillStyle = col; c.fillRect(x | 0, y | 0, w | 0, h | 0); };
  function line(c, x0, y0, x1, y1, col) { x0 |= 0; y0 |= 0; x1 |= 0; y1 |= 0; const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1; let e = dx + dy; for (;;) { P(c, x0, y0, col); if (x0 === x1 && y0 === y1) break; const e2 = 2 * e; if (e2 >= dy) { e += dy; x0 += sx; } if (e2 <= dx) { e += dx; y0 += sy; } } }
  function circle(c, cx, cy, r, col) { let x = r, y = 0, err = 1 - r; while (x >= y) { for (const [a, b] of [[x, y], [y, x], [-y, x], [-x, y], [-x, -y], [-y, -x], [y, -x], [x, -y]]) P(c, cx + a, cy + b, col); y++; if (err < 0) err += 2 * y + 1; else { x--; err += 2 * (y - x) + 1; } } }

  // ---------- daylight ----------
  let forced = null, clock = null;
  const nowMs = () => clock ?? Date.now();
  // Today's sunrise and sunset (the venue's times of day from Open-Meteo, else 7am and 6pm), moved onto the current date.
  function sunTimes() {
    const day = new Date(nowMs()), at = (iso, h) => { const s = iso ? new Date(iso) : null; return new Date(day).setHours(s ? s.getHours() : h, s ? s.getMinutes() : 0, 0, 0); };
    return { rise: at(wx.sunrise, 7), set: at(wx.sunset, 18) };
  }
  function daylight() {
    if (forced != null) return forced;
    const { rise, set } = sunTimes(), n = nowMs(), ramp = 45 * 60000;
    if (n < rise - ramp || n > set + ramp) return 0; if (n < rise + ramp) return (n - (rise - ramp)) / (2 * ramp); if (n > set - ramp) return ((set + ramp) - n) / (2 * ramp); return 1;
  }
  // Sunrise and sunset color peaks ten minutes before sunrise and after sunset, and fades out over an hour either side.
  function twilight() {
    const { rise, set } = sunTimes(), n = nowMs(), w = HOUR;
    const dusk = 1 - Math.abs(n - (set + 10 * 60000)) / w, dawn = 1 - Math.abs(n - (rise - 10 * 60000)) / w;
    return dusk > 0 ? { glow: smooth(dusk), dusk: true } : { glow: smooth(dawn), dusk: false };
  }
  function palette() {
    const d = daylight(), base = PAL[theme] || PAL.light, a = base.night, b = base.day, out = { sun: "#F3C36B", sunRim: "#F7D28A" };
    for (const k in b) out[k] = Array.isArray(b[k]) ? b[k].map((v, i) => mix(a[k][i], v, d)) : /^#/.test(b[k]) ? mix(a[k], b[k], d) : b[k];
    const kind = WX.kind(wx.code); // weather dims the sky
    if (/overcast|rain|drizzle|showers|thunder|fog|snow/.test(kind)) { const g = kind === "thunder" ? 0.55 : 0.78; out.sky = out.sky.map((s) => mix(toHex(s), theme === "dark" ? "#0E1014" : "#8F9499", 1 - g)); }
    // sunrise and sunset color, muted in the dark theme and mostly hidden behind cloud
    const tw = twilight(), k = tw.glow * (theme === "dark" ? 0.55 : 0.8) * (/clear|partly/.test(kind) ? 1 : /overcast|fog/.test(kind) ? 0.3 : 0.15);
    if (k > 0) { const g = tw.dusk ? GLOW.dusk : GLOW.dawn; for (const key in g) { const kk = k * (GLOW_WEIGHT[key] ?? 1); out[key] = Array.isArray(g[key]) ? out[key].map((v, i) => mix(toHex(v), g[key][i], kk)) : mix(toHex(out[key]), g[key], kk); } }
    out.daylight = d; return out;
  }

  // ---------- static layers: sky, Rainier, hills, buildings ----------
  function drawStatic(pal) {
    const c = bctx; c.clearRect(0, 0, W, H); fctx.clearRect(0, 0, W, H); nctx.clearRect(0, 0, W, H);
    // sky in three bands, dithered where they meet
    const b1 = Math.round(G * 0.42), b2 = Math.round(G * 0.72);
    R(c, 0, 0, W, G, pal.sky[0]); R(c, 0, b1, W, G, pal.sky[1]); R(c, 0, b2, W, G, pal.sky[2]);
    for (const [y, col] of [[b1, pal.sky[1]], [b2, pal.sky[2]]]) for (let x = 0; x < W; x++) { if ((x + y) % 2) P(c, x, y - 1, col); if (x % 4 === y % 4) P(c, x, y - 2, col); }
    const skyAt = (y) => (y < b1 ? pal.sky[0] : y < b2 ? pal.sky[1] : pal.sky[2]);
    // stars
    if (pal.daylight < 0.5 && !/overcast|rain|fog|snow|thunder/.test(WX.kind(wx.code))) for (let i = 0; i < W / 3; i++) { const x = Math.floor(hash(i, 7) * W), y = Math.floor(hash(i, 11) * G * 0.6); if (hash(i, 13) > 0.3) P(c, x, y, `rgba(250,249,245,${(0.25 + hash(i, 17) * 0.5) * (1 - pal.daylight * 2)})`); }
    // sun and moon behind the mountain and the skyline: sharp in clear or partly cloudy weather, a hazy disc through overcast, fog
    // or drizzle, hidden in rain and snow
    const kind = WX.kind(wx.code), vis = /clear|partly/.test(kind) ? 1 : /overcast|fog|drizzle/.test(kind) ? 0.35 : 0;
    if (vis) { drawMoon(c, pal, skyAt, vis); drawSun(c, pal, skyAt, vis); }
    drawRainier(c, pal); drawHills(fctx, pal); drawBuildings(fctx, pal); drawNeedle(nctx, pal);
    // waterfront edge
    R(fctx, 0, G, W, 1, pal.ground);
  }

  // Sun and moon share one arc: up from behind Rainier at the right, down behind the hills at the left, 10px from the top at its height.
  // u runs 0 to 1 from rising to setting; at 0 and 1 the body sits on the hilltops, and it slips behind them just past either end.
  const arc = (u) => ({ x: Math.round(W * (0.95 - u * 0.9)), y: Math.round(G - 10 - Math.sin(Math.PI * u) * (G - 20)) });

  function drawSun(c, pal, skyAt, vis) {
    const { rise, set } = sunTimes(), u = (nowMs() - rise) / (set - rise);
    if (u <= -0.06 || u >= 1.06) return;
    const { x, y } = arc(u);
    if (vis < 1) { const haze = (col, k) => mix(toHex(skyAt(y)), toHex(col), k); circle(c, x, y, 6, haze(pal.sunRim, vis * 0.35)); circle(c, x, y, 4, haze(pal.sunRim, vis)); R(c, x - 3, y - 3, 7, 7, haze(pal.sunRim, vis)); return; } // no rays, a faint ring of glow
    circle(c, x, y, 4, pal.sun); R(c, x - 3, y - 3, 7, 7, pal.sunRim); for (const [a, b] of [[0, -7], [0, 7], [-7, 0], [7, 0]]) P(c, x + a, y + b, pal.sun);
  }

  function drawMoon(c, pal, skyAt, vis) {
    // The moon trails the sun by its age in lunar days: a new moon rises with the sun, a full moon at sunset.
    // It is up for about half a lunar day around its transit.
    const n = nowMs(), { rise, set } = sunTimes(), ph = moonPhase(n), transit = (rise + set) / 2 + ph.age * LUNAR_DAY;
    const off = ((((n - transit) % LUNAR_DAY) + LUNAR_DAY * 1.5) % LUNAR_DAY) - LUNAR_DAY / 2, u = off / (LUNAR_DAY / 2) + 0.5;
    if (u <= -0.06 || u >= 1.06) return;
    const { x, y } = arc(u), r = 4.5, day = pal.daylight > 0.5, col = day ? (theme === "dark" ? "#B9B6AC" : "#D3D6DC") : "#E8E3D3";
    // lit side on the right while waxing, the left while waning; the terminator is an ellipse with half-width (1 - 2 * lit) * w
    const term = 1 - 2 * ph.lit;
    for (let dy = -4; dy <= 4; dy++) {
      const w = Math.sqrt(r * r - dy * dy);
      for (let dx = -4; dx <= 4; dx++) {
        if (dx * dx + dy * dy > r * r) continue;
        const lit = ph.waxing ? dx + 0.5 > w * term : dx - 0.5 < -w * term;
        const bg = toHex(skyAt(y + dy));
        P(c, x + dx, y + dy, lit ? mix(bg, col, vis) : day || vis < 1 ? bg : mix(bg, "#E8E3D3", 0.1)); // faint earthshine on clear nights
      }
    }
  }

  function drawRainier(c, pal) {
    const cx = Math.round(W * 0.74), hw = Math.max(64, Math.round(W * 0.34)), peak = Math.round(G * 0.18), base = G - 8;
    const prof = (dx) => { // Rainier: broad dome, steep upper flanks, long gentle lower slopes, Little Tahoma bump on the left flank
      const u = Math.abs(dx) / hw; if (u >= 1) return base;
      let h = Math.pow(1 - u, 1.35); h = Math.min(h, 0.985 + (1 - u) * 0.015); // slightly flattened summit
      if (dx < -hw * 0.16 && dx > -hw * 0.34) h += 0.07 * Math.sin(Math.PI * ((-dx - hw * 0.16) / (hw * 0.18))); // Little Tahoma
      return Math.round(base - h * (base - peak));
    };
    const snowY = peak + Math.round((base - peak) * 0.5);
    for (let dx = -hw; dx <= hw; dx++) { const x = cx + dx; if (x < 0 || x >= W) continue; const top = prof(dx); const edge = snowY + Math.round(Math.sin(dx * 0.6) * 2 + Math.sin(dx * 0.17) * 3); for (let y = top; y < base; y++) { const lit = dx < 0 ? 1 : 0; let col = y < edge ? pal.snow : pal.mtn; if (y >= edge && lit && hash(x, y) > 0.86) col = pal.snow; if (y < edge && !lit && hash(x, y) > 0.9) col = pal.mtn; P(c, x, y, col); } }
    // glacier ridges: a few darker vertical streaks down the snow
    for (let i = 0; i < 6; i++) { const dx = Math.round((hash(i, 3) - 0.5) * hw * 0.5); const x = cx + dx, top = prof(dx) + 3; line(c, x, top, x + Math.sign(dx) * 2, snowY - 1, pal.mtn); }
    // distant haze band at the base
    for (let x = 0; x < W; x++) for (let y = base - 6; y < base; y++) if (hash(x, y) > 0.5) P(c, x, y, pal.far);
  }

  function drawHills(c, pal) {
    const far = (x) => G - 12 - Math.round(3 * Math.sin(x / 23) + 2 * Math.sin(x / 9 + 1) + 2 * Math.sin(x / 41));
    const near = (x) => G - 6 - Math.round(2.5 * Math.sin(x / 17 + 2) + 1.5 * Math.sin(x / 7) + 2 * Math.sin(x / 31 + 1));
    for (let x = 0; x < W; x++) { for (let y = far(x); y < G; y++) P(c, x, y, pal.hillFar); for (let y = near(x); y < G; y++) P(c, x, y, pal.hillNear); if (hash(x, 1) > 0.7) P(c, x, near(x) - 1, pal.hillNear); if (hash(x, 2) > 0.8) P(c, x, far(x) - 1, pal.hillFar); }
  }

  function windows(c, x, y, w, h, pal, step, seed, facade) {
    // lit windows at night; by day a full grid of glass a shade off the facade (darker on grey towers, lighter on black ones), a few catching the sky
    const night = pal.daylight < 0.6, glass = facade === pal.bldLight ? pal.bld : pal.bldLight;
    for (let yy = y + 1; yy < y + h - 1; yy += step) for (let xx = x + 1; xx < x + w - 1; xx += 2) { const r = hash(xx + seed * 977, yy); if (night) { if (r > 0.45) P(c, xx, yy, r > 0.9 ? "#FFE3A3" : pal.win); } else P(c, xx, yy, r > 0.9 ? pal.glass : glass); }
  }

  // --- Space Needle (north, left): off-white legs, saucer and halo, a black core and glass band ---
  function drawNeedle(c, pal) {
    const B = pal.bld, N = pal.ndl, Ns = pal.ndlShade, Ne = pal.ndlEdge;
    const nx = Math.round(W * 0.085); needleX = nx;
    const S = G - 50; // halo row
    // legs: wide at the ground, pinched to a waist two-thirds up, flaring out to the saucer
    const legHw = (y) => { const t = (G - y) / (G - S - 4), tw = 0.7; return Math.round(t <= tw ? 2 + 7 * Math.pow((tw - t) / tw, 1.5) : 2 + 5 * Math.pow((t - tw) / (1 - tw), 1.8)); };
    R(c, nx, S + 3, 2, G - S - 3, B); // elevator core
    for (const side of [-1, 1]) for (let y = G; y > S + 4; y--) line(c, nx + side * (legHw(y) + 1), y, nx + side * (legHw(y - 1) + 1), y - 1, Ne);
    for (const side of [-1, 1]) for (let y = G; y > S + 4; y--) line(c, nx + side * legHw(y), y, nx + side * legHw(y - 1), y - 1, side > 0 ? Ns : N);
    R(c, nx - 1, S + 4, 1, G - S - 4, N); P(c, nx - 2, G - 1, N); // the front leg, in front of the core
    { const y = G - 9, hw = legHw(y); R(c, nx - hw - 1, y - 1, 2 * hw + 3, 3, Ne); R(c, nx - hw, y, 2 * hw + 1, 1, N); } // the ring where the legs meet
    // saucer, top to bottom: cap, roof, halo, glass band behind the halo slats, the tapered underside
    const rows = [[S - 4, 1], [S - 3, 3], [S - 2, 6], [S - 1, 9], [S, 12], [S + 1, 12], [S + 2, 10], [S + 3, 8]];
    for (const [y, hw] of rows) R(c, nx - hw - 1, y - 1, 2 * hw + 3, 3, Ne);
    for (const [y, hw] of rows) { R(c, nx - hw, y, 2 * hw + 1, 1, N); R(c, nx + Math.ceil(hw / 2), y, hw - Math.ceil(hw / 2) + 1, 1, Ns); }
    for (let i = -11; i <= 11; i++) if (i % 3) P(c, nx + i, S + 1, pal.daylight < 0.6 && i % 3 === 1 ? pal.win : B); // glass band, slats every third pixel
    R(c, nx - 4, S + 3, 9, 1, B); // the dark soffit where the legs meet the saucer
    R(c, nx, S - 14, 1, 10, Ne); P(c, nx, S - 15, "#E0462E"); // spire and the warning light
    needleTop = S - 3;
  }

  function drawBuildings(c, pal) {
    const B = pal.bld, L = pal.bldLight, Pp = pal.bldPale, N = pal.ndl, Ns = pal.ndlShade, Ne = pal.ndlEdge;
    const nx = Math.round(W * 0.085);
    // --- downtown towers (mid) ---
    const tower = (fx, w, h, col, cap) => { const x = Math.round(W * fx) - (w >> 1), y = G - h; R(c, x, y, w, h, col); if (cap === "gable") { for (let i = 0; i < w / 2; i++) R(c, x + i, y - 1 - i, w - 2 * i, 1, col); } if (cap === "slant") { for (let i = 0; i < w; i++) R(c, x + i, y - Math.round(i * 0.5), 1, Math.round(i * 0.5) + 1, col); } windows(c, x, y, w, h, pal, 2, Math.round(fx * 100), col); return x; };
    tower(0.26, 8, 30, L); tower(0.22, 6, 22, B);
    // Rainier Square: the tower with the curved "ski slope" base
    { const w = 10, h = 48, x = Math.round(W * 0.31) - 5, y = G - h; R(c, x, y, w, h, Pp); for (let i = 0; i < 12; i++) { const yy = G - 1 - i; const ext = Math.round(Math.pow((12 - i) / 12, 2) * 9); R(c, x - ext, yy, ext, 1, Pp); } for (let yy = y + 2; yy < G; yy += 2) for (let xx = x + 1; xx < x + w; xx += 2) P(c, xx, yy, pal.daylight < 0.6 && hash(xx, yy) > 0.5 ? pal.win : L); }
    tower(0.36, 7, 38, B, "gable"); // 1201 Third
    // Columbia Center: three stacked columns, the tallest in the city
    { const x = Math.round(W * 0.42) - 7; R(c, x, G - 54, 5, 54, B); R(c, x + 5, G - 70, 5, 70, B); R(c, x + 10, G - 62, 4, 62, B); P(c, x + 5, G - 71, B); P(c, x + 9, G - 71, B); for (let yy = G - 68; yy < G; yy += 2) for (const xx of [x + 1, x + 3, x + 6, x + 8, x + 11]) if (yy > G - (xx < x + 5 ? 54 : xx < x + 10 ? 70 : 62) + 1 && (pal.daylight >= 0.6 || hash(xx, yy) > 0.5)) P(c, xx, yy, pal.daylight < 0.6 ? pal.win : hash(xx, yy) > 0.9 ? pal.glass : L); P(c, x + 7, G - 73, "#E0462E"); }
    tower(0.48, 8, 44, L, "slant"); // Municipal Tower
    tower(0.53, 6, 30, B); tower(0.57, 9, 36, L);
    // Smith Tower (south of downtown): white, slender, pyramid top with a globe
    { const w = 7, h = 40, x = Math.round(W * 0.64) - 3, y = G - h; R(c, x, y, w, h, Pp); for (let i = 0; i < 6; i++) R(c, x + i, y - 1 - i, w - 2 * i, 1, Pp); P(c, x + 3, y - 8, "#F5E6B8"); for (let yy = y + 2; yy < G - 2; yy += 2) for (const xx of [x + 1, x + 3, x + 5]) P(c, xx, yy, pal.daylight < 0.6 && hash(xx, yy) > 0.55 ? pal.win : L); }
    tower(0.69, 6, 18, B);
    // Lumen Field (further south): two white truss arches, crossing in the middle, over the navy roof and a brick bowl
    { const cx = Math.round(W * 0.80), base = G - 7;
      R(c, cx - 26, base, 52, 7, pal.brick); R(c, cx - 26, base, 52, 1, pal.brickShade);
      for (let xx = cx - 25; xx < cx + 26; xx += 2) R(c, xx, base + 2, 1, 2, pal.daylight < 0.6 && hash(xx, base) > 0.4 ? pal.win : pal.glass);
      for (let xx = cx - 24; xx < cx + 26; xx += 7) R(c, xx, base + 1, 1, 6, pal.brickShade);
      const arch = (x0, x1, hgt) => { const span = x1 - x0;
        for (let x = x0; x <= x1; x++) { const u = (x - x0) / span, s = Math.sin(Math.PI * u), top = base - Math.round(s * hgt), roofTop = base - Math.round(s * 4);
          R(c, x, roofTop, 1, base - roofTop, pal.roof); // the roof under the arch
          if (top < roofTop - 3 && (x - x0) % 4 === 2) R(c, x, top + 3, 1, roofTop - top - 3, Ns); // hangers down to the roof
          P(c, x, top - 1, Ne); P(c, x, top, N); if ((x - x0) % 2 === 0) P(c, x, top + 1, N); P(c, x, top + 2, x - x0 > span / 2 ? Ns : N); } }; // top chord, truss web, bottom chord
      arch(cx - 26, cx + 4, 12); arch(cx - 5, cx + 26, 13); // the east arch behind, the west arch in front
      R(c, cx + 27, base - 18, 1, 18, B); R(c, cx + 28, base - 18, 4, 3, "#69BE28"); P(c, cx + 29, base - 17, "#002244"); } // the 12 flag
    // a container crane at Terminal 46, boom raised, when there is room at the right edge
    if (W >= 240) { const x0 = W - 14, x1 = x0 + 9, K = pal.crane, Ks = pal.craneShade;
      R(c, x0, G - 18, 1, 18, K); R(c, x1, G - 18, 1, 18, Ks); R(c, x0, G - 9, 10, 1, Ks); // portal legs and sill beam
      R(c, x0 - 3, G - 20, 16, 2, K); R(c, x0 + 4, G - 23, 6, 3, Ks); // girder and machinery house
      line(c, x0 + 1, G - 21, x0 + 5, G - 33, K); line(c, x1 - 1, G - 21, x0 + 5, G - 33, Ks); // A-frame
      line(c, x0 - 3, G - 21, x0 - 9, G - 46, K); line(c, x0 - 2, G - 21, x0 - 8, G - 46, K); // raised boom
      line(c, x0 + 5, G - 33, x0 - 8, G - 43, Ks); // stay
      if (pal.daylight < 0.6) P(c, x0 - 9, G - 47, "#E0462E"); }
    // Seattle Center Monorail: the beam on pylons from behind the Needle to Westlake behind the second tower, in front of the
    // first. Raised above true scale so it clears Pier 70; the train runs per frame.
    monoX1 = Math.round(W * 0.26) - 4; monoY = G - 13;
    R(c, 0, monoY, monoX1, 2, Ne); R(c, 0, monoY, monoX1, 1, Ns);
    for (let x = 3; x < monoX1; x += 8) R(c, x, monoY + 2, 1, G - monoY - 2, Ne);
    // AI House on Pier 70, in front of the first towers: the red west end, the long shed behind it
    { const fx = nx + 14, sx = fx + 13, len = 14, lit = pal.daylight < 0.6;
      R(c, sx, G - 8, len, 1, pal.pierRoof); R(c, sx, G - 7, len, 6, pal.pier);
      for (let xx = sx + 1; xx < sx + len - 1; xx += 2) P(c, xx, G - 5, lit && hash(xx, 70) > 0.4 ? pal.win : pal.pierRoof);
      R(c, fx + 3, G - 10, 7, 1, pal.pierRed); R(c, fx, G - 9, 13, 8, pal.pierRed); // arched sign parapet, red facade
      R(c, fx, G - 8, 13, 1, pal.ndl); // white trim under the parapet
      for (let xx = fx + 1; xx < fx + 12; xx += 2) { P(c, xx, G - 6, lit ? pal.win : pal.pierRoof); P(c, xx, G - 3, lit ? pal.win : pal.pierRoof); } // two floors of windows
      R(c, fx - 1, G - 2, sx + len - fx + 1, 1, pal.ndl); // the railing along the deck
      for (let xx = fx - 1; xx < sx + len; xx++) P(c, xx, G - 1, xx % 2 ? pal.ground : B); } // deck on piles
    // waterfront piers and the Great Wheel frame (dynamic spokes drawn per frame)
    const wxp = Math.round(W * 0.50); R(c, wxp - 16, G - 2, 32, 2, pal.ground);
    line(c, wxp - 6, G - 2, wxp, G - 13, pal.ndl); line(c, wxp + 6, G - 2, wxp, G - 13, pal.ndlShade);
  }

  // ---------- dynamic layers ----------
  function seedClouds() { clouds = []; const n = Math.round(W / 70); for (let i = 0; i < n; i++) clouds.push({ x: hash(i, 21) * W, y: 4 + hash(i, 22) * (G * 0.35), w: 10 + Math.round(hash(i, 23) * 14), v: 1.5 + hash(i, 24) * 2 }); }
  function seedGulls() { gulls = []; for (let i = 0; i < 3; i++) gulls.push({ x: hash(i, 31) * W, y: 14 + hash(i, 32) * 26, v: (hash(i, 33) > 0.5 ? 1 : -1) * (6 + hash(i, 34) * 6), ph: hash(i, 35) * 6 }); }
  function drawCloud(c, cl, pal) { const x = Math.round(cl.x), y = Math.round(cl.y), w = cl.w; R(c, x, y + 1, w, 2, pal.cloud); R(c, x + 2, y, w - 4, 1, pal.cloud); R(c, x + 3, y - 1, Math.round(w * 0.4), 1, pal.cloud); R(c, x, y + 3, w - 2, 1, pal.cloudShade); }

  // clouds and the overcast deck, drawn in front of Rainier and behind the skyline
  function drawClouds(c, pal, dt) {
    const kind = WX.kind(wx.code), wind = (wx.windMph || 0) / 10;
    if (kind !== "clear") { const n = kind === "partly" ? Math.ceil(clouds.length / 2) : clouds.length; for (let i = 0; i < n; i++) { const cl = clouds[i]; cl.x += (cl.v + wind * 3) * dt * (REDUCE ? 0 : 1); if (cl.x > W + 10) cl.x = -cl.w - 5; drawCloud(c, cl, pal); } }
    if (/overcast|rain|drizzle|showers|thunder|snow/.test(kind)) { R(c, 0, 0, W, 5, pal.cloud); for (let x = 0; x < W; x += 2) if (hash(x, 99) > 0.4) P(c, x, 5, pal.cloud); R(c, 0, 6, W, 1, pal.cloudShade); }
  }

  function drawWeather(c, pal, dt) {
    const kind = WX.kind(wx.code), wind = (wx.windMph || 0) / 10;
    // rain and drizzle
    if (/rain|drizzle|showers|thunder/.test(kind)) {
      const target = kind === "drizzle" ? W / 6 : kind === "rain" ? W / 3 : W / 2.2;
      while (drops.length < target) drops.push({ x: Math.random() * W, y: Math.random() * G, v: 55 + Math.random() * 30, len: kind === "drizzle" ? 2 : 3 });
      for (const d of drops) { if (!REDUCE) { d.y += d.v * dt; d.x += wind * 10 * dt; } if (d.y > G) { d.y = -3; d.x = Math.random() * W; } if (d.x > W) d.x = 0; R(c, d.x, d.y, 1, d.len, pal.rain); }
      if (kind === "thunder" && Math.random() < 0.004) flash = 0.12;
    }
    if (kind === "snow") { while (flakes.length < W / 4) flakes.push({ x: Math.random() * W, y: Math.random() * G, v: 8 + Math.random() * 8, ph: Math.random() * 6 }); for (const f of flakes) { if (!REDUCE) { f.y += f.v * dt; f.x += Math.sin(t + f.ph) * 4 * dt + wind * 4 * dt; } if (f.y > G) { f.y = -1; f.x = Math.random() * W; } P(c, f.x, f.y, "rgba(250,249,245,.9)"); } }
    if (kind === "fog") { for (let i = 0; i < 4; i++) { const y = G - 26 + i * 6 + Math.round(Math.sin(t * 0.3 + i) * 1.5); const off = Math.round(t * (2 + i)) % 40; for (let x = -40 + off; x < W; x += 40) R(c, x, y, 28, 3, theme === "dark" ? "rgba(120,130,140,.22)" : "rgba(240,238,230,.55)"); } }
    if (flash > 0) { flash -= dt; R(c, 0, 0, W, G, "rgba(250,249,245,.35)"); }
    // gulls
    for (const g of gulls) { if (!REDUCE) { g.x += g.v * (1 + wind * 0.4) * dt; g.y += Math.sin(t + g.ph) * 2 * dt; } if (g.x > W + 4) g.x = -4; if (g.x < -4) g.x = W + 4; const up = Math.floor(t * 4 + g.ph) % 2; const x = Math.round(g.x), y = Math.round(g.y); const col = pal.daylight > 0.5 ? pal.bld : pal.bldPale; if (up) { P(c, x - 1, y - 1, col); P(c, x, y, col); P(c, x + 1, y - 1, col); } else { P(c, x - 1, y, col); P(c, x, y, col); P(c, x + 1, y, col); } }
  }

  function drawWater(c, pal) {
    R(c, 0, G + 1, W, H - G - 1, pal.water[0]); R(c, 0, G + 6, W, H - G - 6, pal.water[1]); R(c, 0, G + 11, W, H - G - 11, pal.water[2]);
    const off = Math.round(t * 6);
    for (let y = G + 2; y < H; y += 3) for (let x = ((y * 7 + off * (y % 2 ? 1 : -1)) % 16 + 16) % 16; x < W; x += 16) R(c, x, y, 3, 1, pal.wave);
    if (pal.daylight < 0.6) { for (const lx of [needleX, Math.round(W * 0.42) - 2, Math.round(W * 0.50), Math.round(W * 0.64), Math.round(W * 0.80) - 20]) for (let y = G + 2; y < H; y += 2) if (hash(lx, y + off) > 0.5) P(c, lx + ((y + off) % 3) - 1, y, "rgba(245,198,107,.55)"); }
  }

  function drawFerry(c, pal, dt) {
    if (!REDUCE) ferry.x += ferry.dir * ferry.speed * dt;
    if (ferry.x > W + 40) { ferry.dir = -1; } if (ferry.x < -40) { ferry.dir = 1; }
    const x = Math.round(ferry.x), y = G + 4;
    R(c, x - 11, y + 2, 22, 3, "#FAF9F5"); R(c, x - 12, y + 3, 24, 1, "#FAF9F5"); R(c, x - 11, y + 5, 22, 1, "#1E4D2B");
    R(c, x - 9, y - 1, 18, 3, "#FAF9F5"); R(c, x - 6, y - 3, 12, 2, "#FAF9F5"); R(c, x - 9, y + 1, 18, 1, "#2F6B3C");
    for (let i = -8; i < 9; i += 2) P(c, x + i, y, pal.daylight < 0.6 ? pal.win : "#4A7A96"); for (let i = -5; i < 6; i += 2) P(c, x + i, y - 2, pal.daylight < 0.6 ? pal.win : "#4A7A96");
    R(c, x, y - 5, 1, 2, "#1E4D2B"); const wake = ferry.dir > 0 ? x - 14 : x + 12; R(c, wake, y + 4, 3, 1, pal.wave); P(c, wake - ferry.dir * 2, y + 5, pal.wave);
  }

  // One train, after the Seattle Center Monorail's two: the red one heads downtown from behind the Needle and slips behind
  // the second tower; after a pause the blue one comes back out and runs behind the Needle. 9 s a run with easing, 5 s
  // hidden at each end, where the colors swap. Cream body, dark window band, colored roof trim and stripe, silver skirt.
  const MONO = { red: ["#D2232A", "#9E1A20"], blue: ["#5BB4D9", "#3F8DB0"] };
  function drawMonorail(c, pal) {
    const L = clamp(Math.round(monoX1 * 0.22), 10, 16), run = monoX1 + L; if (monoX1 < 20) return;
    const s = REDUCE ? 4.5 : t % 28; if ((s >= 9 && s < 14) || s >= 23) return;
    const out = s < 9, u = smooth(out ? s / 9 : (s - 14) / 9), x = REDUCE ? Math.round(monoX1 * 0.45 - L / 2) : Math.round(out ? -L + u * run : monoX1 - u * run);
    const dim = (col) => mix(col, "#1A1C22", (1 - pal.daylight) * 0.45), night = pal.daylight < 0.6;
    const [accent, rib] = (out ? MONO.red : MONO.blue).map(dim), cream = dim("#EDE6D3"), glass = night ? pal.win : dim("#3E4A55"), silver = dim("#B8BCC0"), silverShade = dim("#8C9196");
    const col = (i) => (out ? x + i : x + L - 1 - i); // i counts from the tail; the cab leads
    const row = (y, i0, i1, color) => { for (let i = i0; i <= i1; i++) P(c, col(i), y, typeof color === "function" ? color(i) : color); };
    const y = monoY - 4;
    c.save(); c.beginPath(); c.rect(0, 0, monoX1, H); c.clip(); // hidden behind the second tower
    row(y, 2, L - 3, accent); // roof trim
    row(y + 1, 1, L - 2, (i) => (i === 1 || (i < L - 4 && i % 4 === 0) ? cream : glass)); // windows, the cab's wraparound windscreen at the front
    row(y + 2, 0, L - 1, cream);
    row(y + 3, 0, L - 1, accent); // the stripe between cream and silver
    row(y + 4, 0, L - 1, (i) => (i === L - 1 ? rib : silver)); // silver skirt over the beam, an accent rib on the nose
    row(y + 5, 1, L - 2, silverShade);
    c.restore();
  }

  function drawWheel(c, pal, dt) {
    const cx = Math.round(W * 0.50), cy = G - 13, r = 10; if (!REDUCE) wheelAngle += dt * 0.25;
    // white like the real one: rim, inner ring and spokes in the Needle's off-white, dark glass gondolas
    circle(c, cx, cy, r, pal.ndl); circle(c, cx, cy, r - 3, pal.ndlShade);
    for (let i = 0; i < 8; i++) { const a = wheelAngle + (i * Math.PI) / 4; const ex = cx + Math.cos(a) * r, ey = cy + Math.sin(a) * r; line(c, cx, cy, ex, ey, pal.ndlShade); R(c, Math.round(ex) - 1, Math.round(ey), 2, 2, pal.daylight < 0.6 ? (i % 2 ? "#8ECAE6" : pal.win) : i % 2 ? "#4A7A96" : "#3E4A55"); }
    R(c, cx - 1, cy - 1, 3, 3, pal.ndl); // hub
  }

  // ---------- loop ----------
  let last = performance.now(), acc = 0, rafId = 0, alive = true;
  function frame(now) {
    if (!alive) return;
    const dt = Math.min(0.05, (now - last) / 1000); last = now; t += dt; acc += dt;
    if (acc < 1 / 15) { rafId = requestAnimationFrame(frame); return; } // 15 fps: pixel art cadence
    const step = acc; acc = 0;
    const pal = palette();
    if (statDirty || now - lastStatic > 30000) { drawStatic(pal); statDirty = false; lastStatic = now; }
    ctx.clearRect(0, 0, W, H); ctx.drawImage(back, 0, 0); drawClouds(ctx, pal, step); ctx.drawImage(front, 0, 0); drawMonorail(ctx, pal); ctx.drawImage(fore, 0, 0);
    drawWheel(ctx, pal, step); drawWeather(ctx, pal, step); drawWater(ctx, pal); drawFerry(ctx, pal, step);
    // the Space Needle's warning light blinks
    if (Math.floor(t * 1.2) % 2) P(ctx, needleX, needleTop - 12, "#FF5C3B");
    rafId = requestAnimationFrame(frame);
  }

  resize(); drawStatic(palette());
  let rto; const onResize = () => { clearTimeout(rto); rto = setTimeout(resize, 120); };
  window.addEventListener("resize", onResize);
  rafId = requestAnimationFrame(frame);

  Object.assign(api, {
    setWeather(w) { Object.assign(wx, w || {}); statDirty = true; },
    setTheme(th) { theme = th === "dark" ? "dark" : "light"; statDirty = true; },
    forceDaylight(v) { forced = v; statDirty = true; },
    setTime(d) { clock = d == null ? null : +d; statDirty = true; },
    destroy() { alive = false; cancelAnimationFrame(rafId); window.removeEventListener("resize", onResize); },
    landmarks() { return { needle: { x: needleX * scale, top: needleTop * scale }, ground: G * scale }; },
    daylight: () => daylight(),
    kind: () => WX.kind(wx.code), label: () => WX.label(wx.code),
    get weather() { return wx; },
  });
  return api;
}

initSkyline.WX = WX;
export { initSkyline, WX };
