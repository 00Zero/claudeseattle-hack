// Shared look for the judging pages, built from the home page's pieces (app/page.tsx,
// app/globals.css): a clay eyebrow, a light display title with an italic second line, section
// headers styled as Claude Code tool calls, and terminal-style status panels.

export function PageHeader({
  eyebrow,
  title,
  italic,
  children,
}: {
  eyebrow: React.ReactNode;
  title: React.ReactNode;
  italic?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <header className="space-y-3">
      <p className="eyebrow text-accent">{eyebrow}</p>
      <h1 className="font-display text-[clamp(2.2rem,5vw,3.4rem)] font-light leading-[1.02] tracking-[-0.01em]">
        {title}
        {italic && (
          <>
            {" "}
            <em className="text-fg-muted">{italic}</em>
          </>
        )}
      </h1>
      {children && <div className="max-w-[60ch] space-y-2 text-fg-muted">{children}</div>}
    </header>
  );
}

// Section header styled as a Claude Code tool call, as on the home page.
export function Sig({ call, title, id }: { call: string; title: React.ReactNode; id?: string }) {
  return (
    <div>
      <p className="font-mono text-xs text-fg-faint">
        <span className="text-accent">⏺</span> {call}
      </p>
      <h2 id={id} className="mt-1 font-display text-3xl font-light leading-tight">
        {title}
      </h2>
    </div>
  );
}

// A terminal-style panel (the home page's context window): mono rows of key and value.
export function StatusPanel({ label, rows }: { label: string; rows: { k: string; v: React.ReactNode; tone?: "accent" | "ok" | "muted" }[] }) {
  const tone = { accent: "text-accent", ok: "text-evergreen", muted: "text-fg-faint" };
  return (
    <aside aria-label={label} className="grid gap-1.5 rounded-lg border border-line bg-bg-raised p-4 font-mono text-xs text-fg-muted">
      <p>
        <span className="text-accent">✻</span> {label}
      </p>
      <div className="grid gap-1 border-t border-dashed border-line pt-2">
        {rows.map((r) => (
          <p key={r.k} className="flex flex-wrap justify-between gap-x-4">
            <span>{r.k}</span>
            <span className={r.tone ? tone[r.tone] : "text-fg"}>{r.v}</span>
          </p>
        ))}
      </div>
    </aside>
  );
}

// A small clay square, the home page's marker for what matters (deadlines there, finalists here).
export function Mark({ label }: { label: string }) {
  return <span aria-label={label} title={label} className="inline-block h-2 w-2 shrink-0 bg-accent align-middle" />;
}
