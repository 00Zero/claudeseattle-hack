"use client";

import type { ScheduleItem } from "@/lib/event";
import { useNow } from "./use-now";

// Single-column agenda. Past items fade, the current one is highlighted, the two deadlines carry a mark.
export function Agenda({ days }: { days: { title: string; items: ScheduleItem[] }[] }) {
  const now = useNow();

  return (
    <div>
      {days.map((day, i) => (
        <section key={day.title} className={i ? "pt-6" : ""}>
          <h3 className="pb-2 font-mono text-xs uppercase tracking-[0.1em] text-fg-faint">{day.title}</h3>
          <ul>
            {day.items.map((item) => {
              const start = item.start ? new Date(item.start).getTime() : null;
              const end = item.end ? new Date(item.end).getTime() : null;
              const past = now != null && end != null && now > end;
              const current = now != null && start != null && end != null && now >= start && now <= end && !past;
              return (
                <li
                  key={item.time + item.what}
                  className={`grid grid-cols-1 items-baseline gap-1 border-t border-line px-3 py-3 last:border-b sm:grid-cols-[8.5rem_1fr] sm:gap-4 ${current ? "rounded border-transparent bg-accent-soft" : ""} ${past ? "text-fg-faint" : ""}`}
                >
                  <span className={`font-mono text-sm tabular-nums ${past ? "text-fg-faint" : "text-fg-muted"}`}>
                    {current && <span className="text-accent">▶ </span>}
                    {item.time}
                  </span>
                  <span className={item.key ? "font-medium" : ""}>
                    {item.what}
                    {item.key && <span className="ml-2 inline-block h-2 w-2 bg-accent align-middle" aria-hidden="true" />}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
