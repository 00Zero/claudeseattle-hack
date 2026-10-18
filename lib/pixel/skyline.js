/* Pixel Seattle (client-only: touches window and canvas; import from a "use client" component).
   Pixel Seattle: a canvas skyline drawn on one pixel grid, with weather and time of day.
 Looking east from Elliott Bay: Space Needle (north, left), downtown, the Great Wheel on the waterfront,
 Smith Tower, Lumen Field (south, right), Mount Rainier behind to the southeast.

 const sky = initSkyline({ canvas, theme: 'light'|'dark' })
 sky.setWeather({ code, isDay, windMph, tempF, sunrise, sunset })   // Open-Meteo fields
 sky.setTheme('dark'); sky.landmarks()  -> { needle: {x, top}, ground } in CSS px; sky.scale; sky.groundY */
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const mix = (a, b, t) => { const A = hex(a), B = hex(b); return `rgb(${Math.round(lerp(A[0], B[0], t))},${Math.round(lerp(A[1], B[1], t))},${Math.round(lerp(A[2], B[2], t))})`; };
// Deterministic noise so windows and stars stay put between frames.
const hash = (x, y) => { let h = (x * 374761393 + y * 668265263) ^ 0x5bd1e995; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967295; };

const PAL = {
  light: {
    day:   { sky: ["#F6F3EC", "#E9E6DD", "#DCDAD2"], far: "#C9C6BC", mtn: "#B9B6AC", snow: "#FAF9F5", hillFar: "#A9B2A3", hillNear: "#7E8C78", bld: "#2B2A27", bldLight: "#4A4945", bldPale: "#EDEAE1", win: "#F0C988", water: ["#9FB8C6", "#8CA9B8", "#7F9DAD"], wave: "#C9DAE2", cloud: "#FFFFFF", cloudShade: "#E3E0D7", rain: "rgba(74,122,150,.55)", ground: "#6B6A64" },
    night: { sky: ["#2B3140", "#1F2430", "#161A24"], far: "#2C3340", mtn: "#3A4150", snow: "#AEB6C4", hillFar: "#2A3330", hillNear: "#1C2522", bld: "#121212", bldLight: "#1E1E1C", bldPale: "#55565A", win: "#F5C66B", water: ["#243040", "#1C2634", "#141C27"], wave: "#3E5468", cloud: "#3A4150", cloudShade: "#2A303C", rain: "rgba(140,170,190,.5)", ground: "#2A2A28" },
  },
  dark: {
    day:   { sky: ["#23262B", "#1D1F23", "#17181B"], far: "#2E3137", mtn: "#3B3E45", snow: "#B9B6AC", hillFar: "#2C3530", hillNear: "#1F2924", bld: "#0E0E0D", bldLight: "#1E1E1C", bldPale: "#5A5A57", win: "#E9C27B", water: ["#223038", "#1B2730", "#151F27"], wave: "#3C5260", cloud: "#2E3137", cloudShade: "#24272C", rain: "rgba(140,170,190,.45)", ground: "#2A2A28" },
    night: { sky: ["#161A24", "#10131B", "#0B0D12"], far: "#1E2430", mtn: "#2A3140", snow: "#8E97A8", hillFar: "#1A2320", hillNear: "#121A16", bld: "#0A0A0A", bldLight: "#161616", bldPale: "#3E4044", win: "#F5C66B", water: ["#121A26", "#0E141E", "#0A0F17"], wave: "#2A3C4C", cloud: "#1E2430", cloudShade: "#161B24", rain: "rgba(140,170,190,.45)", ground: "#1A1A19" },
  },
};
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
  const stat = document.createElement("canvas"); const sctx = stat.getContext("2d");
  let statDirty = true, lastStatic = 0;
  const api = { scale, groundY: 0 };

  // Scene state
  let t = 0, wheelAngle = 0, ferry = { x: -40, dir: 1, speed: 5 }, flash = 0;
  let drops = [], flakes = [], clouds = [], gulls = [];
  let needleX = 0, needleTop = 0;

  function resize() {
    const cssW = canvas.clientWidth || canvas.parentElement.clientWidth || 960;
    scale = cssW >= 1000 ? 4 : cssW >= 640 ? 3 : 2;
    W = Math.ceil(cssW / scale); H = cssW >= 640 ? 96 : 110; G = H - 16;
    canvas.width = W; canvas.height = H; stat.width = W; stat.height = H;
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
  let forced = null;
  function daylight(now) {
    if (forced != null) return forced;
    now = now || new Date();
    if (wx.sunrise && wx.sunset) {
      const rise = new Date(wx.sunrise).getTime(), set = new Date(wx.sunset).getTime(), n = now.getTime(), ramp = 45 * 60000;
      if (n < rise - ramp || n > set + ramp) return 0; if (n < rise + ramp) return (n - (rise - ramp)) / (2 * ramp); if (n > set - ramp) return ((set + ramp) - n) / (2 * ramp); return 1;
    }
    return wx.isDay ? 1 : 0;
  }
  function palette() {
    const d = daylight(), base = PAL[theme] || PAL.light, a = base.night, b = base.day, out = {};
    for (const k in b) out[k] = Array.isArray(b[k]) ? b[k].map((v, i) => mix(a[k][i], v, d)) : /^#/.test(b[k]) ? mix(a[k], b[k], d) : b[k];
    const kind = WX.kind(wx.code); // weather dims the sky
    if (/overcast|rain|drizzle|showers|thunder|fog|snow/.test(kind)) { const g = kind === "thunder" ? 0.55 : 0.78; out.sky = out.sky.map((s) => mix(s.startsWith("rgb") ? rgbToHex(s) : s, theme === "dark" ? "#0E1014" : "#8F9499", 1 - g)); }
    out.daylight = d; return out;
  }
  function rgbToHex(s) { const m = s.match(/\d+/g); return "#" + m.slice(0, 3).map((n) => (+n).toString(16).padStart(2, "0")).join(""); }

  // ---------- static layer: sky, Rainier, hills, buildings ----------
  function drawStatic(pal) {
    const c = sctx; c.clearRect(0, 0, W, H);
    // sky in three bands
    R(c, 0, 0, W, G, pal.sky[0]); R(c, 0, Math.round(G * 0.42), W, G, pal.sky[1]); R(c, 0, Math.round(G * 0.72), W, G, pal.sky[2]);
    // stars
    if (pal.daylight < 0.5 && !/overcast|rain|fog|snow|thunder/.test(WX.kind(wx.code))) for (let i = 0; i < W / 3; i++) { const x = Math.floor(hash(i, 7) * W), y = Math.floor(hash(i, 11) * G * 0.6); if (hash(i, 13) > 0.3) P(c, x, y, `rgba(250,249,245,${(0.25 + hash(i, 17) * 0.5) * (1 - pal.daylight * 2)})`); }
    // moon at night / sun by day in clear weather
    drawRainier(c, pal); drawHills(c, pal); drawBuildings(c, pal);
    // waterfront edge
    R(c, 0, G, W, 1, pal.ground);
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

  function windows(c, x, y, w, h, pal, step, seed) {
    // lit windows at night; subtle lighter pixels by day
    for (let yy = y + 1; yy < y + h - 1; yy += step) for (let xx = x + 1; xx < x + w - 1; xx += 2) { const r = hash(xx + seed * 977, yy); if (pal.daylight < 0.6 ? r > 0.45 : r > 0.82) P(c, xx, yy, pal.daylight < 0.6 ? (r > 0.9 ? "#FFE3A3" : pal.win) : pal.bldLight); }
  }

  function drawBuildings(c, pal) {
    const B = pal.bld, L = pal.bldLight, Pp = pal.bldPale;
    // --- Space Needle (north, left) ---
    const nx = Math.round(W * 0.085); needleX = nx;
    const S = G - 50; // deck row
    // legs: the three legs splay at the ground, narrow to a waist, then flare to the saucer
    for (const side of [-1, 1]) { line(c, nx + side * 8, G, nx + side * 3, G - 24, B); line(c, nx + side * 3, G - 24, nx + side * 2, S + 8, B); line(c, nx + side * 2, S + 8, nx + side * 7, S + 4, B); }
    R(c, nx - 1, S + 4, 3, G - S - 4, B); // core
    R(c, nx - 6, G - 24, 13, 1, L); // the ring where the legs meet
    // saucer: cone underneath, deck, dome, spire
    R(c, nx - 4, S + 4, 9, 1, B); R(c, nx - 7, S + 3, 15, 1, B); R(c, nx - 10, S + 2, 21, 1, B);
    R(c, nx - 12, S, 25, 2, B); for (let i = -11; i <= 11; i += 2) P(c, nx + i, S + 1, pal.daylight < 0.6 ? pal.win : Pp); // deck windows
    R(c, nx - 9, S - 1, 19, 1, B); R(c, nx - 6, S - 2, 13, 1, B); R(c, nx - 3, S - 3, 7, 1, B);
    R(c, nx, S - 14, 1, 11, B); P(c, nx, S - 15, "#E0462E"); // spire and the warning light
    needleTop = S - 3;
    // --- downtown towers (mid) ---
    const tower = (fx, w, h, col, cap) => { const x = Math.round(W * fx) - (w >> 1), y = G - h; R(c, x, y, w, h, col); if (cap === "gable") { for (let i = 0; i < w / 2; i++) R(c, x + i, y - 1 - i, w - 2 * i, 1, col); } if (cap === "slant") { for (let i = 0; i < w; i++) R(c, x + i, y - Math.round(i * 0.5), 1, Math.round(i * 0.5) + 1, col); } windows(c, x, y, w, h, pal, 2, Math.round(fx * 100)); return x; };
    tower(0.26, 8, 30, L); tower(0.22, 6, 22, B);
    // Rainier Square: the tower with the curved "ski slope" base
    { const w = 10, h = 48, x = Math.round(W * 0.31) - 5, y = G - h; R(c, x, y, w, h, Pp); for (let i = 0; i < 12; i++) { const yy = G - 1 - i; const ext = Math.round(Math.pow((12 - i) / 12, 2) * 9); R(c, x - ext, yy, ext, 1, Pp); } for (let yy = y + 2; yy < G; yy += 2) for (let xx = x + 1; xx < x + w; xx += 2) P(c, xx, yy, pal.daylight < 0.6 && hash(xx, yy) > 0.5 ? pal.win : L); }
    tower(0.36, 7, 38, B, "gable"); // 1201 Third
    // Columbia Center: three stacked columns, the tallest in the city
    { const x = Math.round(W * 0.42) - 7; R(c, x, G - 54, 5, 54, B); R(c, x + 5, G - 70, 5, 70, B); R(c, x + 10, G - 62, 4, 62, B); P(c, x + 5, G - 71, B); P(c, x + 9, G - 71, B); for (let yy = G - 68; yy < G; yy += 2) for (const xx of [x + 1, x + 3, x + 6, x + 8, x + 11]) if (yy > G - (xx < x + 5 ? 54 : xx < x + 10 ? 70 : 62) + 1 && hash(xx, yy) > (pal.daylight < 0.6 ? 0.5 : 0.85)) P(c, xx, yy, pal.daylight < 0.6 ? pal.win : L); P(c, x + 7, G - 73, "#E0462E"); }
    tower(0.48, 8, 44, L, "slant"); // Municipal Tower
    tower(0.53, 6, 30, B); tower(0.57, 9, 36, L);
    // Smith Tower (south of downtown): white, slender, pyramid top with a globe
    { const w = 7, h = 40, x = Math.round(W * 0.64) - 3, y = G - h; R(c, x, y, w, h, Pp); for (let i = 0; i < 6; i++) R(c, x + i, y - 1 - i, w - 2 * i, 1, Pp); P(c, x + 3, y - 8, "#F5E6B8"); for (let yy = y + 2; yy < G - 2; yy += 2) for (const xx of [x + 1, x + 3, x + 5]) P(c, xx, yy, pal.daylight < 0.6 && hash(xx, yy) > 0.55 ? pal.win : L); }
    tower(0.69, 6, 18, B);
    // Lumen Field (further south): two sweeping roof canopies over a low bowl, light masts, a 12 flag
    { const cx = Math.round(W * 0.80), w = 50, base = G - 9; R(c, cx - w / 2, base, w, 9, L); for (let xx = cx - w / 2 + 2; xx < cx + w / 2; xx += 3) R(c, xx, base + 3, 1, 3, B);
      const arch = (ax, span, hgt, dir) => { for (let i = 0; i <= span; i++) { const u = i / span; const y = base - Math.round(Math.sin(Math.PI * Math.min(1, u * 1.05)) * hgt); const x = ax + (dir > 0 ? i : -i); R(c, x, y - 1, 1, 2, Pp); if (i % 5 === 0 && u < 0.95) R(c, x, y + 1, 1, base - y - 1, L); } };
      arch(cx - 24, 21, 14, 1); arch(cx + 24, 21, 14, -1); // the gap in the middle is open sky
      for (const lx of [cx - 20, cx - 8, cx + 8, cx + 20]) { R(c, lx, base - 18, 1, 18, B); R(c, lx - 1, base - 19, 3, 1, pal.daylight < 0.6 ? "#FFF2CC" : L); }
      R(c, cx + 26, base - 20, 1, 20, B); R(c, cx + 27, base - 20, 4, 3, "#69BE28"); P(c, cx + 28, base - 19, "#002244"); }
    // waterfront piers and the Great Wheel frame (dynamic spokes drawn per frame)
    const wxp = Math.round(W * 0.50); R(c, wxp - 16, G - 2, 32, 2, pal.ground);
    line(c, wxp - 6, G - 2, wxp, G - 13, B); line(c, wxp + 6, G - 2, wxp, G - 13, B);
  }

  // ---------- dynamic layers ----------
  function seedClouds() { clouds = []; const n = Math.round(W / 70); for (let i = 0; i < n; i++) clouds.push({ x: hash(i, 21) * W, y: 4 + hash(i, 22) * (G * 0.35), w: 10 + Math.round(hash(i, 23) * 14), v: 1.5 + hash(i, 24) * 2 }); }
  function seedGulls() { gulls = []; for (let i = 0; i < 3; i++) gulls.push({ x: hash(i, 31) * W, y: 14 + hash(i, 32) * 26, v: (hash(i, 33) > 0.5 ? 1 : -1) * (6 + hash(i, 34) * 6), ph: hash(i, 35) * 6 }); }
  function drawCloud(c, cl, pal) { const x = Math.round(cl.x), y = Math.round(cl.y), w = cl.w; R(c, x, y + 1, w, 2, pal.cloud); R(c, x + 2, y, w - 4, 1, pal.cloud); R(c, x + 3, y - 1, Math.round(w * 0.4), 1, pal.cloud); R(c, x, y + 3, w - 2, 1, pal.cloudShade); }

  function drawWeather(c, pal, dt) {
    const kind = WX.kind(wx.code), wind = (wx.windMph || 0) / 10;
    // clouds
    if (kind !== "clear") { const n = kind === "partly" ? Math.ceil(clouds.length / 2) : clouds.length; for (let i = 0; i < n; i++) { const cl = clouds[i]; cl.x += (cl.v + wind * 3) * dt * (REDUCE ? 0 : 1); if (cl.x > W + 10) cl.x = -cl.w - 5; drawCloud(c, cl, pal); } }
    if (/overcast|rain|drizzle|showers|thunder|snow/.test(kind)) { R(c, 0, 0, W, 5, pal.cloud); for (let x = 0; x < W; x += 2) if (hash(x, 99) > 0.4) P(c, x, 5, pal.cloud); R(c, 0, 6, W, 1, pal.cloudShade); }
    // sun or moon in clear/partly weather
    if (/clear|partly/.test(kind)) { const d = pal.daylight; if (d > 0.5) { const h = new Date().getHours() + new Date().getMinutes() / 60; const u = clamp((h - 7) / 11, 0, 1); const sx = Math.round(W * (0.95 - u * 0.9)), sy = Math.round(10 + Math.pow(u - 0.5, 2) * 4 * (G * 0.3)); circle(c, sx, sy, 4, "#F3C36B"); R(c, sx - 3, sy - 3, 7, 7, "#F7D28A"); for (const [a, b] of [[0, -7], [0, 7], [-7, 0], [7, 0]]) P(c, sx + a, sy + b, "#F3C36B"); } else { const mx = Math.round(W * 0.2), my = 12; circle(c, mx, my, 4, "#E8E3D3"); R(c, mx - 3, my - 3, 7, 7, "#E8E3D3"); R(c, mx - 1, my - 4, 7, 7, pal.sky[0]); } }
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

  function drawWheel(c, pal, dt) {
    const cx = Math.round(W * 0.50), cy = G - 13, r = 10; if (!REDUCE) wheelAngle += dt * 0.25;
    circle(c, cx, cy, r, pal.bld); circle(c, cx, cy, r - 3, pal.bldLight);
    for (let i = 0; i < 8; i++) { const a = wheelAngle + (i * Math.PI) / 4; const ex = cx + Math.cos(a) * r, ey = cy + Math.sin(a) * r; line(c, cx, cy, ex, ey, pal.bldLight); R(c, Math.round(ex) - 1, Math.round(ey), 2, 2, pal.daylight < 0.6 ? (i % 2 ? "#8ECAE6" : pal.win) : i % 2 ? "#4A7A96" : "#FAF9F5"); }
    P(c, cx, cy, pal.bld);
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
    ctx.clearRect(0, 0, W, H); ctx.drawImage(stat, 0, 0);
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
