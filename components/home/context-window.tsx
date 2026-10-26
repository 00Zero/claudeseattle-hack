"use client";

import { useEffect, useState } from "react";
import { useNow } from "./use-now";

export type Moment = { label: string; at: string };
export type AgendaSlot = { what: string; short: string; start: string; end: string };

// Claude Code's spinner frames.
const GLYPHS = ["·", "✢", "✳", "✶", "✻", "✽", "✻", "✶", "✳", "✢"];

// "Sat 4:30 pm" in Pacific time, for the card's compact rows.
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

// "Sat, Oct 24 · 4:30–6:30 pm" or "Sun, Oct 25 · 10:30 am–5:30 pm" in Pacific time
// (just the start when the slot is an instant).
function pacificSpan(start: string, end: string) {
  const zone = "America/Los_Angeles";
  const day = new Intl.DateTimeFormat("en-US", { timeZone: zone, weekday: "short", month: "short", day: "numeric" }).format(new Date(start));
  const time = (iso: string) =>
    new Intl.DateTimeFormat("en-US", { timeZone: zone, hour: "numeric", minute: "2-digit" }).format(new Date(iso)).replace(" AM", " am").replace(" PM", " pm");
  const from = time(start);
  if (!(Date.parse(end) > Date.parse(start))) return `${day} · ${from}`;
  const to = time(end);
  // Drop the first am/pm when both ends share it.
  return `${day} · ${from.slice(-2) === to.slice(-2) ? from.slice(0, -3) : from}–${to}`;
}

// The hero card: how much of the hackathon clock is left, what is happening now (in full) and up next
// (concise), both from the full agenda, then the major moments still ahead.
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

  // Before the clock is known (server render and hydration), show the first slot as up next.
  const current = now == null ? null : slots.find((s) => now >= new Date(s.start).getTime() && now <= new Date(s.end).getTime());
  const next = now == null ? slots[0] : slots.find((s) => now < new Date(s.start).getTime());
  // Major moments still ahead, minus any shown above (matched by time, since the names differ).
  const shown = new Set([current, next].filter((s) => s != null).map((s) => new Date(s.start).getTime()));
  const upcoming = moments.filter((m) => {
    const at = new Date(m.at).getTime();
    return !shown.has(at) && !(now != null && now > at);
  });

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
      {current && (
        <div className="grid gap-1 border-t border-dashed border-line pt-3">
          <span className="font-medium text-live">Happening now</span>
          <b className="font-semibold text-fg">{pacificSpan(current.start, current.end)}</b>
          <b className="font-semibold text-fg">{current.what}</b>
        </div>
      )}
      {next && (
        <div className={`grid gap-1 ${current ? "" : "border-t border-dashed border-line pt-3"}`}>
          <span className="font-medium text-accent">Up next{now != null && ` ${timeLeft(new Date(next.start).getTime() - now)}`}</span>
          <div className="grid grid-cols-[12ch_1fr] gap-3 font-semibold text-fg">
            <span>{shortPacific(next.start)}</span>
            <span>{next.short}</span>
          </div>
        </div>
      )}
      {!current && !next && (
        <div className="grid gap-1 border-t border-dashed border-line pt-3">
          <span className="text-fg-faint">Wrapped</span>
          <b className="font-semibold text-fg">Winners announced. See you at the next one!</b>
        </div>
      )}
      {upcoming.length > 0 && (
        <ul className="grid gap-2">
          {upcoming.map((m) => (
            <li key={m.label} className="grid grid-cols-[12ch_1fr] gap-3">
              <span>{shortPacific(m.at)}</span>
              <span className="text-fg">{m.label}</span>
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}
