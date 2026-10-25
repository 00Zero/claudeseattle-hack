"use client";

import { useEffect, useState } from "react";

// A finalist's stage time: a 5-minute demo, then 2 minutes of Q&A. Clicks only (no keys), so the
// clicker keeps moving slides.
const PHASES = { demo: { label: "Demo", seconds: 5 * 60 }, qa: { label: "Q&A", seconds: 2 * 60 } };
type Phase = keyof typeof PHASES;

const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

export function DemoTimer() {
  const [phase, setPhase] = useState<Phase>("demo");
  const [left, setLeft] = useState(PHASES.demo.seconds);
  const [endsAt, setEndsAt] = useState<number | null>(null);

  useEffect(() => {
    if (endsAt == null) return;
    const tick = () => {
      const remaining = Math.max(0, Math.round((endsAt - Date.now()) / 1000));
      setLeft(remaining);
      if (remaining === 0) setEndsAt(null);
    };
    const timer = setInterval(tick, 250);
    return () => clearInterval(timer);
  }, [endsAt]);

  const running = endsAt != null;
  const over = left === 0;
  const start = () => setEndsAt(Date.now() + left * 1000);
  const pause = () => setEndsAt(null);
  const switchTo = (next: Phase, run: boolean) => {
    setPhase(next);
    setLeft(PHASES[next].seconds);
    setEndsAt(run ? Date.now() + PHASES[next].seconds * 1000 : null);
  };

  const button = "rounded-full border border-line-strong px-6 py-3 text-[21px] font-semibold hover:bg-fg/5";
  return (
    <div className="flex flex-col items-center gap-6 rounded-2xl border border-line bg-bg-raised px-10 py-9" data-no-advance>
      <p className="font-mono text-[22px] uppercase tracking-[0.16em] text-fg-faint">{PHASES[phase].label}</p>
      <p className={`font-mono text-[150px] leading-none tabular-nums ${over ? "text-accent" : left <= 30 ? "text-clay-deep" : "text-fg"}`}>{over ? "Time" : clock(left)}</p>
      <div className="flex gap-3">
        {!over && <button type="button" className={`${button} ${running ? "" : "border-accent bg-accent text-accent-fg hover:bg-clay-deep"}`} onClick={running ? pause : start}>{running ? "Pause" : left === PHASES[phase].seconds ? `Start ${PHASES[phase].label.toLowerCase()}` : "Resume"}</button>}
        {phase === "demo" && <button type="button" className={over ? `${button} border-accent bg-accent text-accent-fg` : button} onClick={() => switchTo("qa", true)}>Start Q&amp;A</button>}
        {phase === "qa" && <button type="button" className={button} onClick={() => switchTo("demo", false)}>Back to demo</button>}
      </div>
    </div>
  );
}
