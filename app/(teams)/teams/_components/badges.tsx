import type { Balance } from "../_lib/teams";

const LABELS: [keyof Balance, string][] = [
  ["owner", "Owner"],
  ["professional", "Professional"],
  ["student", "Student"],
  ["technical", "Technical"],
];

// The four balance roles, each shown as present or missing.
export function BalanceBadges({ balance }: { balance: Balance }) {
  return (
    <ul className="flex flex-wrap gap-1.5" aria-label="Team balance">
      {LABELS.map(([key, label]) =>
        balance[key] ? (
          <li key={key} className="rounded-full bg-accent-soft px-2.5 py-0.5 text-xs font-medium text-fg">
            ✓ {label}
          </li>
        ) : (
          <li key={key} className="rounded-full border border-dashed border-line-strong px-2.5 py-0.5 text-xs text-fg-muted">
            Needs {label.toLowerCase()}
          </li>
        ),
      )}
    </ul>
  );
}

export function Pill({
  children,
  tone = "plain",
}: {
  children: React.ReactNode;
  tone?: "plain" | "accent" | "warn" | "live";
}) {
  const tones = {
    plain: "bg-fg/10 text-fg",
    accent: "bg-accent text-accent-fg",
    warn: "border border-accent text-fg",
    live: "border border-live text-live",
  };
  return <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${tones[tone]}`}>{children}</span>;
}
