import Link from "next/link";

const TABS = [
  { key: "teams", href: "/teams", label: "Teams" },
  { key: "people", href: "/teams/people", label: "People without a team" },
] as const;

// Switches between browsing teams and browsing people. Same look as the admin tabs.
export function TeamsTabs({ active }: { active: (typeof TABS)[number]["key"] }) {
  return (
    <nav aria-label="Teams sections" className="flex gap-1 border-b border-line">
      {TABS.map((tab) => (
        <Link
          key={tab.key}
          href={tab.href}
          aria-current={tab.key === active ? "page" : undefined}
          className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium no-underline ${
            tab.key === active ? "border-accent text-fg" : "border-transparent text-fg-muted hover:text-fg"
          }`}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
