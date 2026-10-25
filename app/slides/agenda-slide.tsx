"use client";

import { useNow } from "@/components/home/use-now";

export type AgendaItem = { time: string; what: string; start: string; end: string; key?: boolean };

// The day on one slide: past items fade, the current one is marked "now", deadlines get a clay square.
export function AgendaSlide({ items }: { items: AgendaItem[] }) {
  const now = useNow();
  return (
    <ol className="grid">
      {items.map((item) => {
        const start = new Date(item.start).getTime();
        const end = new Date(item.end).getTime();
        const past = now != null && now > end;
        const current = now != null && now >= start && now <= end;
        return (
          <li
            key={item.time + item.what}
            className={`grid grid-cols-[230px_1fr_auto] items-baseline gap-8 border-t border-line px-5 py-[18px] last:border-b ${current ? "rounded-lg border-transparent bg-accent-soft" : ""} ${past ? "opacity-45" : ""}`}
          >
            <span className="font-mono text-[28px] tabular-nums text-fg-muted">{item.time}</span>
            <span className={`font-display text-[40px] font-light leading-tight ${item.key ? "text-fg" : ""}`}>
              {item.what}
              {item.key && <span className="ml-4 inline-block h-3.5 w-3.5 bg-accent align-middle" aria-hidden="true" />}
            </span>
            <span className="font-mono text-xl uppercase tracking-[0.14em] text-accent">{current ? "▶ now" : ""}</span>
          </li>
        );
      })}
    </ol>
  );
}
