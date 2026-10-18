/* Clawd, the Claude Code mascot, as a drop-in 8-bit widget.
   One script, no images, no dependencies. Draws Clawd on a pixel grid (canvas, image-rendering: pixelated),
   wanders, reacts to clicks, can be dragged, and has a Seahawks "12" jersey.

   Usage:
     <script src="clawd-pixel.js"></script>
     <script>const clawd = initClawd({ wanderMode: 'bottom' })</script>

   Options (all optional):
     wanderMode        'bottom' (fixed overlay along the viewport bottom), 'free' (roams the viewport),
                       or 'stage' (walks the ground line of a host element; pass `stage`).
     stage             element or selector; its bottom edge is the ground line in 'stage' mode.
     scale             pixel size in CSS px (default 3 or 4 by viewport width).
     walkSpeed         1 = ~30 CSS px/s at scale 3.
     spawnChanceJersey chance to start in the jersey (default 0.25).
     zIndex            overlay z-index (default 9999).
     colors            override any sprite color: { body, eye, navy, green, grey, ball }.
     weather()         function returning 'rain' | 'drizzle' | 'snow' | 'clear' | ... (umbrella in rain).
     landmarks         { needle: { x, top } } in stage px: lets Clawd climb the Space Needle.
     verbs             extra spinner verbs.

   Returns a controller: { el, say(text), perform(action), setJersey(bool), toggleJersey(), destroy(), state }.
   Styles are prefixed `clawdw-`; the overlay has pointer-events:none, only Clawd himself is clickable.
   Honors prefers-reduced-motion (no wandering; blinks, looks around, and talks). */
(function (global) {
  const VERBS = ["Accomplishing","Actualizing","Architecting","Baking","Beboppin'","Boogieing","Booping","Bootstrapping","Brewing","Burrowing","Caramelizing","Cerebrating","Churning","Clauding","Coalescing","Cogitating","Combobulating","Concocting","Cooking","Crafting","Crunching","Deliberating","Dilly-dallying","Discombobulating","Doodling","Drizzling","Ebbing","Elucidating","Fermenting","Fiddle-faddling","Finagling","Flibbertigibbeting","Flummoxing","Frolicking","Gallivanting","Germinating","Gitifying","Grooving","Gusting","Hatching","Herding","Honking","Hullaballooing","Ideating","Incubating","Jitterbugging","Kerfuffling","Lollygagging","Manifesting","Marinating","Meandering","Misting","Moonwalking","Moseying","Mulling","Noodling","Orchestrating","Percolating","Perambulating","Philosophizing","Pondering","Pontificating","Precipitating","Prestidigitating","Puttering","Puzzling","Razzle-dazzling","Recombobulating","Reticulating","Ruminating","Scampering","Schlepping","Shenaniganing","Shimmying","Simmering","Skedaddling","Sketching","Spelunking","Stewing","Synthesizing","Thinking","Thundering","Tinkering","Tomfoolering","Transmogrifying","Unfurling","Vibing","Waddling","Wandering","Whirring","Wibbling","Wrangling","Zesting"];
  const FOOTBALL_VERBS = ["Touchdowning", "Audibling", "Blitzing", "Huddling", "Scrambling", "Spiking", "Hiking", "Punting"];
  const GLYPHS = ["·", "✢", "✳", "✶", "✻", "✽", "✻", "✶", "✳", "✢"];

  // Sprite grid: 16 wide x 13 tall. Body cols 2–13 rows 0–9, arms cols 0–1 and 14–15 rows 4–6, legs rows 10–12.
  // o body orange · k eye · n navy · g action green · w wolf grey · . transparent
  const CLASSIC = [
    "..oooooooooooo..",
    "..oooooooooooo..",
    "..ookkoooookkoo..".slice(0, 16),
    "..ookkoooookkoo..".slice(0, 16),
    "oooooooooooooooo",
    "oooooooooooooooo",
    "oooooooooooooooo",
    "..oooooooooooo..",
    "..oooooooooooo..",
    "..oooooooooooo..",
    "..oo.oo..oo.oo..",
    "..oo.oo..oo.oo..",
    "..oo.oo..oo.oo..",
  ];
  const JERSEY = CLASSIC.slice(0, 4).concat([
    "ggggnnoooonngggg",
    "owwwnnnoonnnwwwo",
    "onnnnnnggnnnnnno",
    "..nnnnnnnnnnnn..",
    "..nnwwnnwwwnnn..",
    "..nnnwnnnwwnnn..",
  ], CLASSIC.slice(10));
  // Fix row 9 ("1" and "2" bottoms) and keep legs: rows 7–9 are the chest.
  JERSEY[9] = "..nnwwwnwwwnnn..";
  JERSEY.splice(10, 0); // legs already follow

  const DEFAULT_COLORS = { body: "#D97757", eye: "#141413", navy: "#002244", green: "#69BE28", grey: "#A5ACAF", ball: "#8B4A2B", lace: "#FAF9F5", cup: "#FAF9F5", umbrella: "#4A7A96", laptop: "#6B6A64", screen: "#B9D9E8", shadow: "rgba(20,20,19,.18)" };

  const CSS = `
  .clawdw-overlay{position:fixed;inset:0;pointer-events:none;z-index:var(--clawdw-z,9999);overflow:visible}
  .clawdw-overlay.clawdw-stage{position:absolute;inset:auto 0 0 0;height:0}
  .clawdw-actor{position:absolute;left:0;top:0;pointer-events:auto;cursor:grab;touch-action:none;will-change:transform;user-select:none;-webkit-user-select:none}
  .clawdw-actor.clawdw-drag{cursor:grabbing}
  .clawdw-actor canvas{display:block;image-rendering:pixelated;image-rendering:crisp-edges}
  .clawdw-ball{position:absolute;left:0;top:0;pointer-events:none;image-rendering:pixelated;will-change:transform}
  .clawdw-bubble{position:absolute;pointer-events:none;white-space:nowrap;padding:4px 7px;
    font:500 11px/1.2 ui-monospace,"Geist Mono",Menlo,monospace;letter-spacing:.02em;
    color:var(--clawdw-bubble-fg,#141413);background:var(--clawdw-bubble-bg,#FAF9F5);
    border:2px solid var(--clawdw-bubble-line,#141413);box-shadow:3px 3px 0 var(--clawdw-bubble-line,#141413);
    opacity:0;transform:translateY(4px);transition:opacity .15s steps(3),transform .15s steps(3)}
  .clawdw-bubble.clawdw-show{opacity:1;transform:none}
  .clawdw-bubble .clawdw-glyph{color:var(--clawdw-accent,#D97757);display:inline-block;width:1em}
  @media (prefers-reduced-motion:reduce){.clawdw-bubble{transition:none}}`;

  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  function initClawd(opts) {
    opts = Object.assign({ wanderMode: "bottom", walkSpeed: 1, spawnChanceJersey: 0.25, zIndex: 9999, verbs: [] }, opts || {});
    const REDUCE = global.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const colors = Object.assign({}, DEFAULT_COLORS, opts.colors || {});
    if (!document.getElementById("clawdw-css")) { const s = document.createElement("style"); s.id = "clawdw-css"; s.textContent = CSS; document.head.appendChild(s); }

    const scale = opts.scale || (global.innerWidth < 640 ? 3 : 4);
    const mode = opts.wanderMode;
    const stage = typeof opts.stage === "string" ? document.querySelector(opts.stage) : opts.stage;
    const overlay = document.createElement("div");
    overlay.className = "clawdw-overlay" + (mode === "stage" ? " clawdw-stage" : "");
    overlay.style.setProperty("--clawdw-z", opts.zIndex);
    (mode === "stage" && stage ? stage : document.body).appendChild(overlay);

    // Canvas is 40x28 logical px: the 16x13 sprite sits at (12,14) so props fit above and beside it.
    const CW = 40, CH = 28, OX = 12, OY = 14;
    const actor = document.createElement("div");
    actor.className = "clawdw-actor";
    actor.setAttribute("role", "img");
    actor.setAttribute("aria-label", "Clawd, the Claude Code mascot. Click to say hi, drag to move.");
    actor.setAttribute("title", "Clawd");
    const cv = document.createElement("canvas");
    cv.width = CW; cv.height = CH; cv.style.width = CW * scale + "px"; cv.style.height = CH * scale + "px";
    actor.appendChild(cv);
    const bubble = document.createElement("div"); bubble.className = "clawdw-bubble"; bubble.setAttribute("role", "status");
    overlay.appendChild(actor); overlay.appendChild(bubble);
    const ctx = cv.getContext("2d");
    const W = CW * scale, H = CH * scale;              // CSS size of the actor
    const FOOT = (OY + 13) * scale;                    // y of Clawd's feet inside the actor

    // World bounds: where the actor's top-left may be. Ground y is where the feet touch.
    function bounds() {
      if (mode === "stage") { const r = stage.getBoundingClientRect(); return { w: r.width, h: r.height, ground: 0 }; }
      return { w: global.innerWidth, h: global.innerHeight, ground: global.innerHeight };
    }
    const groundTop = () => (mode === "stage" ? 0 : bounds().ground) - FOOT; // actor top when standing on the ground

    const state = {
      x: 0, y: 0, dir: 1, jersey: Math.random() < opts.spawnChanceJersey, action: "idle", t: 0,
      blink: 0, look: 0, carrying: false, umbrella: false, dragging: false,
    };
    const b0 = bounds();
    state.x = rand(0.1, 0.7) * (b0.w - W);
    state.y = mode === "free" ? rand(0.2, 0.8) * (b0.h - H) : groundTop();

    // ---------- drawing ----------
    function px(x, y, c) { ctx.fillStyle = c; ctx.fillRect(x, y, 1, 1); }
    function rect(x, y, w, h, c) { ctx.fillStyle = c; ctx.fillRect(x, y, w, h); }
    const colorOf = { o: colors.body, k: colors.eye, n: colors.navy, g: colors.green, w: colors.grey };

    function drawSprite(f) {
      // f: { legs: 0|1|2, blink, lookX, lookY, armL: 'down'|'up'|'out', armR, bodyDy, squash }
      const grid = (state.jersey ? JERSEY : CLASSIC).map((r) => r.split(""));
      // legs frames
      if (f.legs === 1) { for (const c of [2, 3, 9, 10]) grid[12][c] = "."; }
      if (f.legs === 2) { for (const c of [5, 6, 12, 13]) grid[12][c] = "."; }
      if (f.sit) { for (let r = 10; r < 13; r++) for (let c = 0; c < 16; c++) grid[r][c] = "."; for (const c of [2, 3, 5, 6, 9, 10, 12, 13]) grid[10][c] = "o"; }
      // eyes
      const eyeRows = f.blink ? [3] : [2, 3];
      for (let r = 2; r <= 3; r++) for (const c of [4, 5, 10, 11]) grid[r][c] = "o";
      const lx = clamp(f.lookX || 0, -1, 1), ly = clamp(f.lookY || 0, -1, 1);
      for (const r of eyeRows) for (const c of [4, 5, 10, 11]) { const rr = clamp(r + ly, 1, 4), cc = c + lx; if (grid[rr] && grid[rr][cc] !== undefined) grid[rr][cc] = "k"; }
      // arms
      const armColor = (r) => (state.jersey ? (r === 4 ? "g" : r === 5 ? "w" : "n") : "o");
      function arm(side, pose) {
        const cols = side === "L" ? [0, 1] : [14, 15];
        for (let r = 4; r <= 6; r++) for (const c of cols) grid[r][c] = ".";
        if (pose === "down") { for (let r = 4; r <= 6; r++) for (const c of cols) grid[r][c] = r === 5 && state.jersey && (c === 0 || c === 15) ? "o" : armColor(r); }
        if (pose === "up") { for (let r = 1; r <= 3; r++) for (const c of cols) grid[r][c] = state.jersey ? (r === 3 ? "g" : "o") : "o"; }
        if (pose === "out") { for (let r = 4; r <= 5; r++) for (const c of cols) grid[r][c] = armColor(r); const c2 = side === "L" ? -1 : 16; if (c2 < 0 || c2 > 15) { /* beyond grid: drawn below */ } }
      }
      arm("L", f.armL || "down"); arm("R", f.armR || "down");
      const dy = f.bodyDy || 0;
      for (let r = 0; r < 13; r++) for (let c = 0; c < 16; c++) { const ch = grid[r][c]; if (ch !== ".") px(OX + c, OY + r + (r < 10 ? dy : 0), colorOf[ch]); }
      if (f.armR === "out") rect(OX + 16, OY + 4 + dy, 1, 2, colors.body);
      if (f.armL === "out") rect(OX - 1, OY + 4 + dy, 1, 2, colors.body);
    }
    function drawShadow() { rect(OX + 1, OY + 13, 14, 1, colors.shadow); }
    function drawUmbrella(t) {
      const sway = Math.round(Math.sin(t * 2) * 0.5);
      rect(OX + 2 + sway, OY - 5, 14, 1, colors.umbrella); rect(OX + sway, OY - 4, 18, 1, colors.umbrella); rect(OX - 1 + sway, OY - 3, 20, 1, colors.umbrella);
      for (let i = 0; i < 20; i += 4) px(OX - 1 + sway + i, OY - 2, colors.umbrella);
      rect(OX + 15, OY - 2, 1, 6, colors.eye);
    }
    function drawCoffee(t) { rect(OX + 16, OY + 3, 3, 3, colors.cup); px(OX + 19, OY + 4, colors.cup); px(OX + 17, OY + 4, "#5a3a22"); if (Math.floor(t * 3) % 2) { px(OX + 17, OY + 1, "rgba(120,120,110,.6)"); px(OX + 18, OY, "rgba(120,120,110,.4)"); } else { px(OX + 18, OY + 1, "rgba(120,120,110,.6)"); px(OX + 17, OY, "rgba(120,120,110,.4)"); } }
    function drawLaptop(t) { rect(OX + 16, OY + 8, 7, 1, colors.laptop); rect(OX + 17, OY + 3, 6, 5, colors.laptop); rect(OX + 18, OY + 4, 4, 3, Math.floor(t * 4) % 3 === 0 ? colors.lace : colors.screen); px(OX + 19 + (Math.floor(t * 6) % 3), OY + 5, colors.eye); }
    function drawBallInHand(side) { const x = side === "R" ? OX + 16 : OX - 3; rect(x, OY + 4, 3, 2, colors.ball); px(x + 1, OY + 4, colors.lace); }
    function drawZ(t) { const k = Math.floor(t * 2) % 3; const zx = OX + 15, zy = OY - 2 - k * 2; rect(zx, zy, 3, 1, colors.eye); px(zx + 1, zy + 1, colors.eye); rect(zx, zy + 2, 3, 1, colors.eye); }
    function drawSweat() { px(OX + 15, OY, colors.umbrella); }

    function render(f) {
      ctx.clearRect(0, 0, CW, CH);
      if (!f.noShadow) drawShadow();
      if (f.rotate) { ctx.save(); ctx.translate(CW / 2, OY + 13); ctx.rotate(f.rotate); ctx.translate(-CW / 2, -(OY + 13)); }
      drawSprite(f);
      if (f.rotate) ctx.restore();
      if (f.umbrella) drawUmbrella(f.t);
      if (f.coffee) drawCoffee(f.t);
      if (f.laptop) drawLaptop(f.t);
      if (f.ball) drawBallInHand(f.ball);
      if (f.zzz) drawZ(f.t);
      if (f.sweat) drawSweat();
    }

    // ---------- speech ----------
    let bubbleTimer = null, glyphTimer = null;
    function say(html, ms) {
      bubble.innerHTML = html; bubble.classList.add("clawdw-show");
      clearTimeout(bubbleTimer); bubbleTimer = setTimeout(hush, ms || 2200);
    }
    function hush() { bubble.classList.remove("clawdw-show"); clearInterval(glyphTimer); }
    function spin(verb, ms) {
      let i = 0; const draw = () => (bubble.innerHTML = `<span class="clawdw-glyph">${GLYPHS[i++ % GLYPHS.length]}</span> ${verb}…`);
      draw(); bubble.classList.add("clawdw-show"); clearInterval(glyphTimer); glyphTimer = setInterval(draw, 180);
      clearTimeout(bubbleTimer); bubbleTimer = setTimeout(hush, ms || 3000);
    }
    function placeBubble() {
      const bw = bubble.offsetWidth, bx = clamp(state.x + W / 2 - bw / 2, 4, bounds().w - bw - 4);
      bubble.style.transform = "";
      bubble.style.left = bx + "px"; bubble.style.top = state.y + (OY - 8) * scale - bubble.offsetHeight + "px";
    }

    // ---------- projectiles (football) ----------
    const balls = [];
    function throwBall(x0, y0, vx, vy, spin) {
      const c = document.createElement("canvas"); c.width = 4; c.height = 3; c.className = "clawdw-ball";
      c.style.width = 4 * scale + "px"; c.style.height = 3 * scale + "px";
      const g = c.getContext("2d"); g.fillStyle = colors.ball; g.fillRect(0, 0, 4, 3); g.fillStyle = colors.lace; g.fillRect(1, 0, 2, 1); g.fillStyle = "rgba(255,255,255,.3)"; g.fillRect(0, 1, 1, 1);
      overlay.appendChild(c);
      balls.push({ el: c, x: x0, y: y0, vx, vy, spin, rot: 0, life: 0, bounces: 0 });
    }
    function stepBalls(dt) {
      const groundY = (mode === "stage" ? 0 : bounds().ground) - 3 * scale;
      for (let i = balls.length - 1; i >= 0; i--) {
        const b = balls[i]; b.life += dt; b.vy += 900 * dt; b.x += b.vx * dt; b.y += b.vy * dt; b.rot += b.spin * dt;
        if (b.y > groundY) { b.y = groundY; b.vy = -b.vy * 0.45; b.vx *= 0.7; b.bounces++; b.spin *= 0.5; }
        b.el.style.transform = `translate(${Math.round(b.x)}px, ${Math.round(b.y)}px) rotate(${Math.round(b.rot / 90) * 90}deg)`;
        if (b.life > 4 || b.x < -40 || b.x > bounds().w + 40) { b.el.remove(); balls.splice(i, 1); }
      }
    }

    // ---------- actions ----------
    // Each action: { dur, update(t, dt) -> frame } ; t in seconds since action start.
    const speed = () => 30 * (opts.walkSpeed || 1) * (scale / 3);
    let current = null, queue = [];

    function walkFrame(t) { return { legs: 1 + (Math.floor(t * 6) % 2), bodyDy: Math.floor(t * 6) % 2 ? -1 : 0 }; }
    function idleFrame(t) { return { legs: 0, bodyDy: Math.floor(t) % 2 ? 0 : 0, blink: state.blink > 0, lookX: state.look }; }
    const base = (f, t) => Object.assign({ t, umbrella: state.umbrella && !f.noUmbrella }, f);

    const actions = {
      idle(dur) { return { dur: dur || rand(1.2, 3), update: (t) => idleFrame(t) }; },
      look() { let lx = pick([-1, 1]); return { dur: 2.2, update: (t) => { if (t > 1.1) lx = -lx; state.look = lx; return idleFrame(t); } , end: () => (state.look = 0) }; },
      walk(target, fast) {
        const b = bounds(); const tx = target != null ? target : rand(0, b.w - W);
        state.dir = tx < state.x ? -1 : 1;
        const sp = speed() * (fast ? 2.4 : 1); const dur = Math.abs(tx - state.x) / sp;
        return { dur, update: (t, dt) => { state.x = clamp(state.x + state.dir * sp * dt, 0, b.w - W); if (Math.abs(state.x - tx) < 2) current.dur = 0; return Object.assign(walkFrame(t * (fast ? 1.8 : 1)), fast ? { ball: "R", bodyDy: -1 } : {}); } };
      },
      think() { const verb = pick(VERBS.concat(opts.verbs, state.jersey ? FOOTBALL_VERBS : [])); const dur = rand(2.8, 4.5); spin(verb, dur * 1000); return { dur, update: (t) => ({ legs: 0, lookY: -1, lookX: Math.floor(t * 2) % 2 ? 1 : 0 }) }; },
      wave() { return { dur: 2, update: (t) => ({ legs: 0, armR: Math.floor(t * 5) % 2 ? "up" : "out", lookX: 0 }) }; },
      sit() { return { dur: rand(3, 5), update: (t) => ({ sit: true, lookX: Math.floor(t / 1.5) % 3 - 1, blink: Math.floor(t * 10) % 37 === 0 }) }; },
      nap() { say("", 1); return { dur: rand(5, 8), update: () => ({ sit: true, blink: true, zzz: true }), end: hush }; },
      coffee() { return { dur: rand(3, 5), update: (t) => ({ legs: 0, armR: "out", coffee: true, lookX: Math.floor(t) % 2 ? 1 : 0, blink: Math.floor(t * 2) % 5 === 0 }) }; },
      laptop() { const d = rand(4, 6); spin(pick(["Compiling", "Gitifying", "Linting", "Deploying", "Vibing"]), d * 1000); return { dur: d, update: (t) => ({ sit: true, laptop: true, lookY: 1, lookX: 1, armR: "out", blink: Math.floor(t * 10) % 23 === 0 }) }; },
      dance() { spin(pick(["Boogieing", "Jitterbugging", "Moonwalking", "Grooving", "Shimmying"]), 3600); return { dur: 3.6, update: (t) => { const k = Math.floor(t * 4) % 4; state.dir = k < 2 ? 1 : -1; return { legs: 1 + (k % 2), armL: k % 2 ? "up" : "out", armR: k % 2 ? "out" : "up", bodyDy: k % 2 ? -1 : 0 }; } }; },
      hop(txt) { if (txt) say(txt); return { dur: 0.6, update: (t) => { const h = Math.sin(Math.PI * Math.min(1, t / 0.6)); return { legs: t < 0.5 ? 0 : 1, bodyDy: 0, noShadow: false, lift: Math.round(h * 7) * scale }; } }; },
      trip() { say("oof", 1400); return { dur: 2.2, update: (t) => (t < 0.5 ? { legs: 1, rotate: state.dir * (t / 0.5) * (Math.PI / 2) } : t < 1.6 ? { rotate: state.dir * Math.PI / 2, blink: true, sweat: true } : { legs: 0, rotate: state.dir * ((2.2 - t) / 0.6) * (Math.PI / 2) }) }; },
      climb() {
        const lm = opts.landmarks && opts.landmarks.needle; if (!lm || mode !== "stage") return actions.idle(0.1);
        const gx = clamp(lm.x - W / 2, 0, bounds().w - W), gtop = groundTop(), top = lm.top - FOOT; const walk = Math.abs(gx - state.x) / speed(); const climbDur = Math.abs(gtop - top) / (speed() * 0.9);
        const dur = walk + climbDur + 2.5 + climbDur;
        state.dir = gx < state.x ? -1 : 1;
        return { dur, update: (t, dt) => {
          if (t < walk) { state.x += state.dir * speed() * dt; return walkFrame(t); }
          const u = t - walk;
          if (u < climbDur) { state.x = gx; state.y = gtop - (u / climbDur) * (gtop - top); return { legs: 1 + (Math.floor(u * 6) % 2), armL: Math.floor(u * 6) % 2 ? "up" : "down", armR: Math.floor(u * 6) % 2 ? "down" : "up", noShadow: true }; }
          if (u < climbDur + 2.5) { state.y = top; if (u > climbDur + 1.2 && !current.said) { current.said = true; say("605 ft", 1300); } return { legs: 0, lookX: Math.floor(u * 2) % 3 - 1, noShadow: true }; }
          const d = u - climbDur - 2.5; state.y = top + Math.min(1, d / climbDur) * (gtop - top); return { legs: 1 + (Math.floor(d * 6) % 2), armL: Math.floor(d * 6) % 2 ? "up" : "down", armR: Math.floor(d * 6) % 2 ? "down" : "up", noShadow: true };
        }, end: () => (state.y = groundTop()) };
      },
      throwBall() { let thrown = false; return { dur: 1.6, update: (t) => { if (t > 0.7 && !thrown) { thrown = true; throwBall(state.x + (state.dir > 0 ? W - 10 * scale : 8 * scale), state.y + (OY + 3) * scale, state.dir * rand(140, 220) * (scale / 3), -rand(180, 260) * (scale / 3), state.dir * 720); spin(pick(["Spiraling", "Touchdowning", "Hiking"]), 1800); } return { legs: 0, armR: t < 0.7 ? "up" : "out", ball: t < 0.7 ? "R" : null, lookX: 1 }; } }; },
      kick() { let kicked = false; return { dur: 2, update: (t) => { if (t > 0.9 && !kicked) { kicked = true; throwBall(state.x + (state.dir > 0 ? W - 12 * scale : 10 * scale), state.y + (OY + 11) * scale, state.dir * rand(60, 120) * (scale / 3), -rand(300, 380) * (scale / 3), state.dir * 1080); say("Punting", 1400); } return t < 0.9 ? { legs: 0, lookY: 1 } : { legs: 2, bodyDy: -1, armL: "out", armR: "up" }; } }; },
      rush() { const b = bounds(); const tx = state.dir > 0 ? b.w - W : 0; state.dir = tx < state.x ? -1 : 1; const sp = speed() * 2.6; const dur = Math.abs(tx - state.x) / sp + 1.2; let done = false; return { dur, update: (t, dt) => { if (!done) { state.x = clamp(state.x + state.dir * sp * dt, 0, b.w - W); if (state.x <= 0 || state.x >= b.w - W) { done = true; say("Touchdown!", 1500); } return Object.assign(walkFrame(t * 1.8), { ball: "R", bodyDy: -1 }); } return { legs: 0, armL: "up", armR: "up", bodyDy: Math.floor(t * 8) % 2 ? -1 : 0 }; } }; },
      fall(toY) { const y0 = state.y; const d = Math.sqrt(2 * Math.abs(toY - y0) / 1800) || 0.01; return { dur: d + 0.35, update: (t) => { if (t < d) { state.y = y0 + 0.5 * 1800 * t * t; return { legs: 1, armL: "up", armR: "up", noShadow: true }; } state.y = toY; return { legs: 0, bodyDy: t - d < 0.18 ? 1 : 0 }; } }; },
    };

    function chooseNext() {
      if (state.dragging) return actions.idle(0.3);
      const raining = /rain|drizzle|shower|thunder/.test(String(opts.weather ? opts.weather() : ""));
      state.umbrella = raining && Math.random() < 0.8;
      if (REDUCE) return pick([actions.idle, actions.look, actions.think, actions.wave, actions.coffee])();
      const bag = ["walk", "walk", "walk", "walk", "idle", "idle", "look", "look", "think", "think", "wave", "sit", "coffee", "nap", "dance", "laptop", "trip", "climb"];
      if (state.jersey) bag.push("throwBall", "throwBall", "kick", "rush");
      if (raining) bag.push("walk", "walk");
      const name = pick(bag);
      if (name === "coffee" || name === "laptop" || name === "nap" || name === "dance") state.umbrella = false;
      return actions[name]();
    }

    function start(a) { if (current && current.end) current.end(); current = a; current.t = 0; }

    // ---------- main loop ----------
    let last = performance.now(), frameAcc = 0;
    function loop(now) {
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      if (!current) start(chooseNext());
      current.t += dt;
      let f = current.update(current.t, dt) || {};
      state.blink = state.blink > 0 ? state.blink - dt : Math.random() < dt / 3.5 ? 0.12 : 0;
      f = base(f, current.t);
      if (current.t >= current.dur) { if (current.end) current.end(); current = queue.shift() || null; }
      frameAcc += dt;
      if (frameAcc > 1 / 14) { frameAcc = 0; render(f); }
      const lift = f.lift || 0;
      actor.style.transform = `translate(${Math.round(state.x)}px, ${Math.round(state.y - lift)}px)`;
      cv.style.transform = `scaleX(${state.dir})`;
      if (bubble.classList.contains("clawdw-show")) placeBubble();
      stepBalls(dt);
      raf = requestAnimationFrame(loop);
    }
    let raf = requestAnimationFrame(loop);

    // ---------- interaction ----------
    let down = null, moved = false, clickTimer = null, clicks = 0;
    actor.addEventListener("pointerdown", (e) => { down = { x: e.clientX, y: e.clientY, ox: state.x, oy: state.y }; moved = false; actor.setPointerCapture(e.pointerId); });
    actor.addEventListener("pointermove", (e) => {
      if (!down) return; const dx = e.clientX - down.x, dy = e.clientY - down.y;
      if (!moved && Math.hypot(dx, dy) < 4) return;
      moved = true; state.dragging = true; actor.classList.add("clawdw-drag"); hush();
      const b = bounds(); state.x = clamp(down.ox + dx, -W / 2, b.w - W / 2); state.y = down.oy + dy;
      start({ dur: 9e9, update: () => ({ legs: 1, armL: "up", armR: "up", noShadow: true, blink: false, lookY: 1 }) });
    });
    const up = () => {
      if (!down) return; down = null;
      if (moved) { state.dragging = false; actor.classList.remove("clawdw-drag"); const g = mode === "free" ? state.y : groundTop(); if (state.y < g - 1) start(actions.fall(g)); else { state.y = g; current = null; } return; }
      clicks++; clearTimeout(clickTimer);
      if (clicks >= 2) { clicks = 0; state.jersey = !state.jersey; start(actions.hop(state.jersey ? "Go Hawks" : "Classic")); return; }
      clickTimer = setTimeout(() => { clicks = 0; }, 280);
      const verb = pick(state.jersey ? FOOTBALL_VERBS.concat(VERBS) : VERBS.concat(opts.verbs));
      start(actions.hop(`<span class="clawdw-glyph">✻</span> ${verb}…`));
      queue = [];
    };
    actor.addEventListener("pointerup", up); actor.addEventListener("pointercancel", up);
    global.addEventListener("resize", () => { const b = bounds(); state.x = clamp(state.x, 0, b.w - W); if (mode !== "free" && !state.dragging) state.y = groundTop(); });

    return {
      el: actor, state, VERBS, GLYPHS,
      say: (t, ms) => say(t, ms),
      perform: (name) => { if (actions[name]) start(actions[name]()); },
      setJersey: (v) => { state.jersey = !!v; },
      toggleJersey: () => { state.jersey = !state.jersey; return state.jersey; },
      destroy: () => { cancelAnimationFrame(raf); overlay.remove(); },
    };
  }

  global.initClawd = initClawd;
  global.initClawd.VERBS = VERBS;
  global.initClawd.GLYPHS = GLYPHS;
})(window);
