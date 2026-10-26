"use client";

import { useState } from "react";

// Final round for admins: finalists by place with their mean final score, and on request one
// column per judge (alphabetical) with that judge's mean and per-criterion ratings. Built from
// judge_entry_results and judge_scores on the server (page.tsx); nothing here is shown to judges.

export type FinalJudgeScore = { mean: number; ratings: string };
export type FinalRow = {
  entryId: string;
  team: string;
  title: string;
  place: number | null;
  finalScore: string | null;
  votes: number;
  byJudge: Record<string, FinalJudgeScore>;
};

const th = "px-2 py-2 font-medium";
const td = "px-2 py-2 align-top";
const button = "rounded border border-foreground/20 px-2 py-0.5 text-xs hover:bg-foreground/5";

const fmt = (value: number | string | null) => (value === null || value === "" ? "—" : Number(value).toFixed(1));

export function FinalStandings({ rows, judges, legend }: { rows: FinalRow[]; judges: { id: string; name: string }[]; legend: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={() => setOpen(!open)} className={button} aria-expanded={open}>
          {open ? "Hide judges' scores" : `Show each judge (${judges.length})`}
        </button>
        {open && <span className="text-xs text-foreground/60">Each judge&apos;s mean, then {legend}.</span>}
      </div>
      <div className="overflow-x-auto rounded border border-foreground/15">
        <table className="w-full text-left text-sm">
          <thead className="bg-foreground/5 text-foreground/70">
            <tr>
              <th className={`${th} sticky left-0 bg-background pl-3`}>Place</th>
              <th className={th}>Team</th>
              <th className={th}>Final mean</th>
              <th className={th}>Judges</th>
              {open &&
                judges.map((j) => (
                  <th key={j.id} className={`${th} whitespace-nowrap border-l border-foreground/10`}>
                    {j.name}
                  </th>
                ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.entryId} className="border-t border-foreground/10">
                <td className={`${td} sticky left-0 bg-background pl-3 text-lg font-semibold`}>{r.place ?? "—"}</td>
                <td className={`${td} min-w-48`}>
                  <span className="font-medium">{r.team}</span>
                  {r.title && r.title !== r.team && <span className="block text-xs text-foreground/60">{r.title}</span>}
                </td>
                <td className={`${td} text-lg font-semibold`}>{fmt(r.finalScore)}</td>
                <td className={td}>
                  {r.votes}/{judges.length}
                </td>
                {open &&
                  judges.map((j) => {
                    const s = r.byJudge[j.id];
                    return (
                      <td key={j.id} className={`${td} whitespace-nowrap border-l border-foreground/10`}>
                        {s ? (
                          <>
                            <span className="font-medium">{fmt(s.mean)}</span>
                            <span className="block font-mono text-xs text-foreground/60">{s.ratings}</span>
                          </>
                        ) : (
                          <span className="text-foreground/50">not scored</span>
                        )}
                      </td>
                    );
                  })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
