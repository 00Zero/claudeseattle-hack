// Technical level 1–5 (docs/REQUIREMENTS.md, Teams nice-to-have 6): the scale the profile form
// shows and lib/technical-rating.ts gives the model. Safe for client components.

export const TECHNICAL_LEVELS = [
  { level: 1, label: "Barely uses Claude or GitHub" },
  { level: 2, label: "Uses Claude chat regularly; little or no code" },
  { level: 3, label: "Writes or edits code with AI help; has used GitHub on own projects" },
  { level: 4, label: "Builds working apps with Claude Code or similar; contributes to shared repos (branches, PRs)" },
  { level: 5, label: "Runs multi-agent workflows and maintains repos with several contributors" },
] as const;

// What others see instead of the number.
export function technicalBand(level: number | null): "none" | "some" | "builder" | null {
  if (level == null) return null;
  return level >= 4 ? "builder" : level === 3 ? "some" : "none";
}
