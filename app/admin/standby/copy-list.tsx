"use client";

import { useState } from "react";

const small = "rounded border border-foreground/20 px-2 py-1 text-sm hover:bg-foreground/5";

// Names and Luma emails, with a button that copies the emails one per line.
export function StandbyCopyList({ people }: { people: { name: string; email: string }[] }) {
  const [copied, setCopied] = useState(false);
  const emails = people.map((p) => p.email).join("\n");
  return (
    <div className="space-y-2">
      <ul className="rounded border border-foreground/15 text-sm">
        {people.map((p) => (
          <li key={p.email} className="flex flex-wrap justify-between gap-2 border-b border-foreground/10 px-3 py-1.5 last:border-0">
            <span>{p.name}</span>
            <span className="break-all text-foreground/70">{p.email}</span>
          </li>
        ))}
      </ul>
      <button
        type="button"
        className={small}
        onClick={async () => {
          await navigator.clipboard.writeText(emails);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
      >
        {copied ? "Copied" : `Copy ${people.length} emails`}
      </button>
    </div>
  );
}
