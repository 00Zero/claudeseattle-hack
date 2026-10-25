import type { ReactNode } from "react";

// Pieces shared by the kickoff deck (/slides) and the awards deck (/slides/awards).

// Section header styled as a Claude Code tool call, like the home page's.
export function Sig({ call, title }: { call: string; title: ReactNode }) {
  return (
    <div>
      <p className="font-mono text-[22px] text-fg-faint">
        <span className="text-accent">⏺</span> {call}
      </p>
      <h2 className="mt-3 font-display text-[68px] font-light leading-[1.02] tracking-[-0.01em]">{title}</h2>
    </div>
  );
}

export function Eyebrow({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <p className={`font-sans text-[18px] font-semibold uppercase tracking-[0.16em] text-fg-muted ${className}`}>{children}</p>;
}

export function Check() {
  return (
    <svg viewBox="0 0 24 24" className="h-7 w-7 shrink-0 text-accent" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 12.5l5 5L20 6.5" />
    </svg>
  );
}
