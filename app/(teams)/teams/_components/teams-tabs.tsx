import Link from "next/link";
import { Suspense } from "react";

const TABS = [
  { key: "teams", href: "/teams", label: "Teams" },
  { key: "people", href: "/teams/people", label: "People without a team" },
  { key: "inbox", href: "/teams/inbox", label: "Inbox" },
] as const;

// Switches between teams, people, and the inbox (invites and applications). Same look as the
// admin tabs. inboxCount is how many inbox items wait on the viewer; pass the promise unawaited
// and the badge streams in, so the page doesn't wait on it.
export function TeamsTabs({
  active,
  inboxCount = 0,
}: {
  active: (typeof TABS)[number]["key"];
  inboxCount?: number | Promise<number>;
}) {
  return (
    <nav aria-label="Teams sections" className="flex gap-1 overflow-x-auto border-b border-line [scrollbar-width:none]">
      {TABS.map((tab) => (
        <Link
          key={tab.key}
          href={tab.href}
          aria-current={tab.key === active ? "page" : undefined}
          className={`-mb-px shrink-0 border-b-2 px-3 py-2 text-sm font-medium no-underline ${
            tab.key === active ? "border-accent text-fg" : "border-transparent text-fg-muted hover:text-fg"
          }`}
        >
          {tab.label}
          {tab.key === "inbox" && (
            <Suspense>
              <InboxBadge count={inboxCount} />
            </Suspense>
          )}
        </Link>
      ))}
    </nav>
  );
}

async function InboxBadge({ count }: { count: number | Promise<number> }) {
  const waiting = await count;
  if (waiting <= 0) return null;
  return (
    <span className="ml-1.5 inline-block min-w-5 rounded-full bg-accent px-1.5 text-center text-xs text-accent-fg">
      {waiting}
      <span className="sr-only"> waiting</span>
    </span>
  );
}

// "N things need your answer" on /teams, streamed like the badge.
export async function InboxNotice({ count }: { count: Promise<number> }) {
  const waiting = await count;
  if (waiting <= 0) return null;
  return (
    <p className="rounded-lg border border-accent bg-accent-soft px-4 py-3 text-sm">
      <strong>
        {waiting} {waiting === 1 ? "thing needs" : "things need"} your answer.
      </strong>{" "}
      <Link href="/teams/inbox" className="underline">
        Open your inbox
      </Link>
    </p>
  );
}
