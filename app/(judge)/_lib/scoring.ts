// Rubric math shared by the judge views. docs/REQUIREMENTS.md, "Rubric": four criteria, each
// 1–8; the entry score is the mean of the four, shown to one decimal. Safe in client code.
import { rubric } from "@/lib/event";

export const SCORE_MIN = 1;
export const SCORE_MAX = 8;
export const CRITERIA = rubric.criteria;

export function mean(scores: number[]) {
  return scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null;
}

export function formatScore(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === "") return "—";
  return Number(value).toFixed(1);
}

// The anchor text for a score: anchors are written per pair (1–2, 3–4, 5–6, 7–8).
export function anchorFor(criterion: number, score: number) {
  return CRITERIA[criterion]?.anchors[Math.min(3, Math.floor((score - 1) / 2))] ?? "";
}

// Parses the four criterion fields of a score form; null if any is missing or out of range.
export function parseScores(values: (FormDataEntryValue | null)[]) {
  const scores = values.map((v) => (typeof v === "string" ? Number(v) : NaN));
  return scores.length === CRITERIA.length && scores.every((s) => Number.isInteger(s) && s >= SCORE_MIN && s <= SCORE_MAX)
    ? scores
    : null;
}

export type Ranked<T> = T & { score: number | null; rank: number | null; tied: boolean };

// Ranks items by score, highest first; unscored items go last without a rank. `tied` marks
// items sharing a score with another, which judges must break by adjusting scores.
export function rankByScore<T>(items: T[], scoreOf: (item: T) => number | null): Ranked<T>[] {
  const scored = items.map((item) => ({ ...item, score: scoreOf(item) }));
  scored.sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
  return scored.map((item) => {
    if (item.score === null) return { ...item, rank: null, tied: false };
    const rank = scored.findIndex((other) => other.score === item.score) + 1;
    const tied = scored.filter((other) => other.score === item.score).length > 1;
    return { ...item, rank, tied };
  });
}
