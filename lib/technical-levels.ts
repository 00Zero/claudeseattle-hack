// Technical level 1–5 (docs/REQUIREMENTS.md, Teams nice-to-have 6): the scale the profile form
// shows, without the numbers, and lib/technical-rating.ts gives the model. Safe for client components.

export const TECHNICAL_LEVELS = [
  { level: 1, label: "I mostly chat with Claude or other AI tools" },
  { level: 2, label: "I use Claude to run workflows for my work, but I don't generate code" },
  { level: 3, label: "I write or edit code with AI and have used GitHub" },
  { level: 4, label: "I build complete apps with Claude Code or similar, and work in shared repos with branches and PRs" },
  { level: 5, label: "I run multi-agent workflows and maintain repos with several contributors" },
] as const;

// What others see instead of the number.
export function technicalBand(level: number | null): "none" | "some" | "builder" | null {
  if (level == null) return null;
  return level >= 4 ? "builder" : level === 3 ? "some" : "none";
}
