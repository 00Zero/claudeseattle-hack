/* Clawd: the Claude Code mascot, drawn in SVG and driven by a small state machine.
   No dependencies. Colors come from CSS tokens (--clawd, --clawd-ink, --clawd-bubble-*).

   Usage:
     <div id="stage" style="position:relative"></div>
     <script src="clawd.js"></script>
     <script>Clawd.mount({ stage: '#stage', scale: 1.4 })</script>

   Behaviours (picked at random while idle): walk, think (spinner verb bubble), nap, boop.
   Interactions: eyes follow the pointer; click to hop; five quick clicks and he razzle-dazzles.
   Respects prefers-reduced-motion: Clawd stands still and only blinks and thinks. */
(function () {
  // Claude Code's spinner verbs (from the CLI), trimmed to the ones that read well on a page.
  const VERBS = [
    "Accomplishing", "Actualizing", "Architecting", "Baking", "Beboppin'", "Boogieing", "Booping",
    "Bootstrapping", "Brewing", "Burrowing", "Caramelizing", "Cerebrating", "Churning", "Clauding",
    "Coalescing", "Cogitating", "Combobulating", "Concocting", "Cooking", "Crafting", "Crunching",
    "Deliberating", "Dilly-dallying", "Discombobulating", "Doodling", "Drizzling", "Ebbing",
    "Elucidating", "Fermenting", "Fiddle-faddling", "Finagling", "Flibbertigibbeting", "Flummoxing",
    "Frolicking", "Gallivanting", "Germinating", "Gitifying", "Grooving", "Gusting", "Hatching",
    "Herding", "Honking", "Hullaballooing", "Ideating", "Incubating", "Jitterbugging", "Kerfuffling",
    "Lollygagging", "Manifesting", "Marinating", "Meandering", "Misting", "Moonwalking", "Moseying",
    "Mulling", "Noodling", "Orchestrating", "Percolating", "Perambulating", "Philosophizing",
    "Pondering", "Pontificating", "Precipitating", "Prestidigitating", "Puttering", "Puzzling",
    "Razzle-dazzling", "Recombobulating", "Reticulating", "Ruminating", "Scampering", "Schlepping",
    "Shenaniganing", "Shimmying", "Simmering", "Skedaddling", "Sketching", "Spelunking", "Stewing",
    "Synthesizing", "Thinking", "Thundering", "Tinkering", "Tomfoolering", "Transmogrifying",
    "Unfurling", "Vibing", "Waddling", "Wandering", "Whirring", "Wibbling", "Wrangling", "Zesting",
  ];
  // The CLI's spinner frames.
  const GLYPHS = ["·", "✢", "✳", "✶", "✻", "✽", "✻", "✶", "✳", "✢"];

  const REDUCE = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

  const CSS = `
  .clawd{position:absolute;bottom:0;left:0;width:48px;height:44px;cursor:pointer;user-select:none;
    transition:left var(--clawd-walk,2s) linear;will-change:left;touch-action:manipulation}
  .clawd svg{width:100%;height:100%;overflow:visible;transform:scaleX(var(--dir,1));transition:transform .15s}
  .clawd .body{fill:var(--clawd,#D97757)}
  .clawd .eye{fill:var(--clawd-ink,#141413);transform-origin:center;transform-box:fill-box;transition:transform .12s}
  .clawd .leg{fill:var(--clawd,#D97757);transform-origin:top center;transform-box:fill-box}
  .clawd.walking .leg:nth-child(odd){animation:clawd-step .32s infinite alternate ease-in-out}
  .clawd.walking .leg:nth-child(even){animation:clawd-step .32s infinite alternate-reverse ease-in-out}
  .clawd.walking .body,.clawd.walking .eye{animation:clawd-bob .32s infinite alternate ease-in-out}
  .clawd.blink .eye{transform:scaleY(.1)}
  .clawd.napping .eye{transform:scaleY(.12)}
  .clawd.hop svg{animation:clawd-hop .5s cubic-bezier(.22,1,.36,1)}
  .clawd.dazzle svg{animation:clawd-spin 1.1s cubic-bezier(.22,1,.36,1)}
  .clawd .bubble{position:absolute;bottom:calc(100% + 10px);left:50%;transform:translate(-50%,4px);
    white-space:nowrap;padding:.35rem .6rem;border-radius:10px;border:1px solid var(--clawd-bubble-line,rgba(0,0,0,.14));
    background:var(--clawd-bubble-bg,#fff);color:var(--clawd-bubble-fg,#141413);
    font:500 12px/1.2 var(--font-mono,ui-monospace,monospace);opacity:0;pointer-events:none;
    transition:opacity .2s,transform .2s}
  .clawd .bubble::after{content:"";position:absolute;top:100%;left:50%;margin-left:-5px;border:5px solid transparent;
    border-top-color:var(--clawd-bubble-bg,#fff)}
  .clawd .bubble.show{opacity:1;transform:translate(-50%,0)}
  .clawd .bubble .glyph{color:var(--clawd,#D97757);display:inline-block;width:1em}
  .clawd .bubble.zzz{font-family:var(--font-display,serif);font-style:italic;font-size:14px;border-color:transparent;background:transparent}
  .clawd .bubble.zzz::after{display:none}
  @keyframes clawd-step{from{transform:translateY(0) scaleY(1)}to{transform:translateY(-3px) scaleY(.7)}}
  @keyframes clawd-bob{from{transform:translateY(0)}to{transform:translateY(-1.5px)}}
  @keyframes clawd-hop{0%{transform:scaleX(var(--dir,1)) translateY(0)}40%{transform:scaleX(var(--dir,1)) translateY(-26px)}
    70%{transform:scaleX(var(--dir,1)) translateY(0) scaleY(.85)}100%{transform:scaleX(var(--dir,1)) translateY(0)}}
  @keyframes clawd-spin{0%{transform:scaleX(var(--dir,1)) rotate(0)}100%{transform:scaleX(var(--dir,1)) rotate(360deg)}}
  @media (prefers-reduced-motion:reduce){.clawd{transition:none}.clawd *{animation:none!important}}`;

  // Body ratio follows the CLI's block-character Clawd: a wide rounded body, two eye notches, four stub legs.
  const SVG = `<svg viewBox="0 0 48 44" aria-hidden="true">
    <rect class="body" x="4" y="4" width="40" height="30" rx="9"/>
    <rect class="eye" x="14" y="13" width="6" height="9" rx="1.5"/>
    <rect class="eye" x="28" y="13" width="6" height="9" rx="1.5"/>
    <g class="legs">
      <rect class="leg" x="9" y="33" width="6" height="9" rx="2"/>
      <rect class="leg" x="17" y="33" width="6" height="9" rx="2"/>
      <rect class="leg" x="25" y="33" width="6" height="9" rx="2"/>
      <rect class="leg" x="33" y="33" width="6" height="9" rx="2"/>
    </g>
  </svg><div class="bubble" role="status" aria-live="polite"></div>`;

  function injectCSS() {
    if (document.getElementById("clawd-css")) return;
    const s = document.createElement("style");
    s.id = "clawd-css";
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  function mount(opts) {
    opts = opts || {};
    injectCSS();
    const stage = typeof opts.stage === "string" ? document.querySelector(opts.stage) : opts.stage || document.body;
    const scale = opts.scale || 1;
    const el = document.createElement("div");
    el.className = "clawd";
    el.setAttribute("aria-label", "Clawd, the Claude Code mascot");
    el.setAttribute("title", "Clawd (click me)");
    el.style.width = 48 * scale + "px";
    el.style.height = 44 * scale + "px";
    el.innerHTML = SVG;
    stage.appendChild(el);
    const bubble = el.querySelector(".bubble");
    const eyes = el.querySelectorAll(".eye");
    const speed = (opts.speed || 55) * scale; // px per second

    let x = opts.start != null ? opts.start : rand(0.15, 0.6);
    let timer = null, glyphTimer = null, state = "idle", clicks = 0, clickTimer = null;
    const widthPx = () => stage.clientWidth - el.offsetWidth;
    const setX = (frac, dur) => {
      el.style.setProperty("--clawd-walk", dur + "s");
      el.style.left = Math.round(frac * widthPx()) + "px";
    };
    setX(x, 0);

    const say = (html, cls) => {
      bubble.className = "bubble show" + (cls ? " " + cls : "");
      bubble.innerHTML = html;
    };
    const hush = () => { bubble.className = "bubble"; clearInterval(glyphTimer); };

    function schedule(fn, ms) { clearTimeout(timer); timer = setTimeout(fn, ms); }

    function idle() {
      state = "idle";
      el.className = "clawd";
      hush();
      const next = REDUCE ? pick([think, think, blinkOnce]) : pick([walk, walk, walk, walk, think, think, nap, blinkOnce, boop]);
      schedule(next, rand(1200, 3500));
    }

    function blinkOnce() {
      el.classList.add("blink");
      setTimeout(() => el.classList.remove("blink"), 140);
      schedule(idle, 300);
    }

    function walk() {
      state = "walking";
      const target = rand(0.02, 0.98);
      const dist = Math.abs(target - x) * widthPx();
      const dur = Math.max(0.8, dist / speed);
      el.style.setProperty("--dir", target < x ? -1 : 1);
      el.classList.add("walking");
      x = target;
      setX(x, dur);
      schedule(idle, dur * 1000 + 100);
    }

    function think(verb) {
      state = "thinking";
      verb = verb || pick(VERBS);
      const t0 = Date.now();
      let i = 0;
      const render = () => {
        const secs = Math.floor((Date.now() - t0) / 1000);
        say(`<span class="glyph">${GLYPHS[i++ % GLYPHS.length]}</span> ${verb}… <span style="opacity:.6">(${secs}s · esc to interrupt)</span>`);
      };
      render();
      glyphTimer = setInterval(render, 180);
      schedule(idle, rand(3200, 6000));
    }

    function nap() {
      state = "napping";
      el.classList.add("napping");
      say("z z z", "zzz");
      schedule(idle, rand(5000, 9000));
    }

    function boop() {
      state = "boop";
      el.classList.add("hop");
      say("boop");
      schedule(idle, 900);
    }

    function dazzle() {
      state = "dazzle";
      el.className = "clawd dazzle";
      think("Razzle-dazzling");
      schedule(idle, 2400);
    }

    // Eyes follow the pointer while idle or thinking.
    const onMove = (e) => {
      if (state === "napping" || state === "walking") return;
      const r = el.getBoundingClientRect();
      const dx = Math.max(-1, Math.min(1, (e.clientX - (r.left + r.width / 2)) / 300));
      const dy = Math.max(-1, Math.min(1, (e.clientY - (r.top + r.height / 2)) / 300));
      eyes.forEach((eye) => (eye.style.transform = `translate(${dx * 1.5}px, ${dy * 1.5}px)`));
    };
    window.addEventListener("pointermove", onMove, { passive: true });

    el.addEventListener("click", () => {
      clicks++;
      clearTimeout(clickTimer);
      clickTimer = setTimeout(() => (clicks = 0), 900);
      if (clicks >= 5) { clicks = 0; return dazzle(); }
      if (state === "napping") { say("!"); el.classList.remove("napping"); schedule(idle, 700); return; }
      el.classList.remove("hop");
      void el.offsetWidth; // restart the hop
      boop();
    });

    window.addEventListener("resize", () => setX(x, 0));
    schedule(idle, 600);

    return {
      el,
      think, walk, nap, dazzle,
      say: (text) => { say(text); schedule(idle, 2500); },
    };
  }

  window.Clawd = { mount, VERBS, GLYPHS };
})();
