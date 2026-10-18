"use client";

import { useEffect, useState } from "react";
import { formatPacific } from "@/lib/time";
import { useNow } from "./use-now";

export type Moment = { label: string; at: string };
export type AgendaSlot = { what: string; start: string; end: string };

// Claude Code's spinner frames.
const GLYPHS = ["·", "✢", "✳", "✶", "✻", "✽", "✻", "✶", "✳", "✢"];

// "Sat 4:30 pm" in Pacific time: short enough for the card's two-column rows.
function shortPacific(iso: string) {
  return new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", weekday: "short", hour: "numeric", minute: "2-digit" })
    .format(new Date(iso))
    .replace(",", "")
    .replace(" AM", " am")
    .replace(" PM", " pm");
}

function timeLeft(ms: number) {
  if (ms <= 0) return "now";
  const d = Math.floor(ms / 864e5);
  const h = Math.floor(ms / 36e5) % 24;
  const m = Math.floor(ms / 6e4) % 60;
  if (d) return `in ${d}d ${h}h`;
  if (h) return `in ${h}h ${m}m`;
  return `in ${m}m`;
}

// The hero card: how much of the hackathon clock is left, what is next, and the key moments.
// Countdowns render only on the client so the server HTML never disagrees with the browser clock.
export function ContextWindow({ openAt, closeAt, moments, slots }: { openAt: string; closeAt: string; moments: Moment[]; slots: AgendaSlot[] }) {
  const now = useNow();
  const [glyph, setGlyph] = useState(4);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const spin = setInterval(() => setGlyph((g) => (g + 1) % GLYPHS.length), 180);
    return () => clearInterval(spin);
  }, []);

  const open = new Date(openAt).getTime();
  const close = new Date(closeAt).getTime();
  // Share of the hackathon clock left, from the start of the event to its end.
  // The bar fills with the share used, like Claude Code's context meter: full means auto-compact.
  const pct = now == null ? null : Math.max(0, Math.min(100, (100 * (close - now)) / (close - open)));

  const current = now == null ? null : slots.find((s) => now >= new Date(s.start).getTime() && now <= new Date(s.end).getTime());
  const next = now == null ? null : slots.find((s) => now < new Date(s.start).getTime());
  const target = current ?? next;
  // Don't repeat the "next up" item in the list below it.
  const nextAt = !current && target ? new Date(target.start).getTime() : null;
  const listed = moments.filter((m) => new Date(m.at).getTime() !== nextAt);

  return (
    <aside aria-label="Where we are in the hackathon" className="grid min-w-0 gap-3 rounded-lg border border-line bg-bg-raised p-4 font-mono text-xs text-fg-muted">
      <div className="flex flex-wrap justify-between gap-3">
        <span title="Time left in the event">
          <span className="inline-block w-[1em] text-accent" aria-hidden="true">
            {GLYPHS[glyph]}
          </span>{" "}
          Context window <b className="font-medium text-fg">{pct == null ? "—" : `${pct.toFixed(0)}%`}</b> remaining
        </span>
        <span>
          auto-compact <b className="font-medium text-fg">{shortPacific(closeAt)}</b>
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded border border-line bg-bg-sunken" aria-hidden="true">
        <i className="block h-full bg-gradient-to-r from-accent to-clay-deep transition-[width] duration-700" style={{ width: pct == null ? "0%" : `${(100 - pct).toFixed(1)}%` }} />
      </div>
      <div className="grid gap-1 border-t border-dashed border-line pt-3">
        <span className="text-fg-faint">{current ? "Happening now" : now == null ? "Next up" : target ? "Next up" : "Wrapped"}</span>
        <span className="font-display text-xl font-normal leading-tight text-fg">
          {target ? target.what : now == null ? slots[0]?.what : "Winners announced. See you at the next one."}
          {target && !current && now != null && (
            <span className="ml-2 inline-block whitespace-nowrap align-middle font-mono text-xs font-medium text-accent">{timeLeft(new Date(target.start).getTime() - now)}</span>
          )}
        </span>
        {target && <span className="text-fg-faint">{formatPacific(target.start)} PT</span>}
      </div>
      <ul className="grid gap-2">
        {listed.map((m) => {
          const at = new Date(m.at).getTime();
          const done = now != null && now > at;
          return (
            <li key={m.label} className={`flex flex-wrap justify-between gap-3 ${done ? "text-fg-faint line-through" : ""}`}>
              <span>{m.label}</span>
              <span className={done ? "" : "text-fg"}>
                {shortPacific(m.at)}
                {now != null && !done && <span className="text-fg-muted"> · {timeLeft(at - now)}</span>}
              </span>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
