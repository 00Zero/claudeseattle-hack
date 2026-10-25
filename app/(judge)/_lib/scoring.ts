// Rubric math shared by the judge views. docs/REQUIREMENTS.md, "Rubric": each enabled criterion
// is scored 1–8; the entry score is the mean of the criteria the judge scored, shown to one
// decimal. Admins choose the enabled criteria (event_settings.judging_criteria); every score
// records the keys it covers (judge_scores.criteria). Safe in client code.
import { rubric, type Criterion, type CriterionKey } from "@/lib/event";

export type { Criterion, CriterionKey };

export const SCORE_MIN = 1;
export const SCORE_MAX = 8;
export const ALL_CRITERIA = rubric.criteria;
export const DEFAULT_CRITERIA = rubric.defaultCriteria;

const KNOWN = new Set<string>(ALL_CRITERIA.map((c) => c.key));

// Stored keys (null = the default four) as known keys in rubric order, without duplicates.
export function criteriaKeys(stored: readonly string[] | null | undefined): CriterionKey[] {
  const keys = new Set((stored ?? DEFAULT_CRITERIA).filter((k) => KNOWN.has(k)));
  const ordered = ALL_CRITERIA.map((c) => c.key).filter((k) => keys.has(k));
  return ordered.length ? ordered : [...DEFAULT_CRITERIA];
}

// The enabled criteria for a stored setting, in rubric order.
export function enabledCriteria(stored: readonly string[] | null | undefined): Criterion[] {
  const keys = new Set(criteriaKeys(stored));
  return ALL_CRITERIA.filter((c) => keys.has(c.key));
}

export function sameCriteria(a: readonly string[] | null | undefined, b: readonly string[] | null | undefined) {
  return (a ?? DEFAULT_CRITERIA).join() === (b ?? DEFAULT_CRITERIA).join();
}

// "one", "two", … for page copy ("Score each entry on four criteria").
export function countWord(n: number) {
  return ["no", "one", "two", "three", "four", "five", "six", "seven", "eight"][n] ?? String(n);
}

export function mean(scores: number[]) {
  return scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null;
}

export function formatScore(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === "") return "—";
  return Number(value).toFixed(1);
}

// The anchor text for a score: anchors are written per pair (1–2, 3–4, 5–6, 7–8).
export function anchorFor(criterion: Criterion, score: number) {
  return criterion.anchors[Math.min(3, Math.floor((score - 1) / 2))] ?? "";
}

// A stored score as { key: value }, using its own criteria (null = the default four).
export function scoresByKey(score: { scores: number[]; criteria: string[] | null }) {
  const keys = score.criteria ?? DEFAULT_CRITERIA;
  return new Map(keys.map((k, i) => [k, score.scores[i]] as const));
}

// The score form's field name for a criterion.
export const fieldName = (criterion: Criterion) => `c_${criterion.key}`;

// Parses a score form's fields for these criteria; null if any is missing or out of range.
export function parseScores(criteria: Criterion[], formData: FormData) {
  const scores = criteria.map((c) => {
    const v = formData.get(fieldName(c));
    return typeof v === "string" ? Number(v) : NaN;
  });
  return scores.length > 0 && scores.every((s) => Number.isInteger(s) && s >= SCORE_MIN && s <= SCORE_MAX) ? scores : null;
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
