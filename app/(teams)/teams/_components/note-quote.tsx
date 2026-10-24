// A note someone attached to an application or invite (at most 50 words, shown as written).
export function NoteQuote({ from, note }: { from: string; note: string }) {
  return (
    <figure className="rounded-md border-l-2 border-accent bg-accent-soft/40 px-3 py-2 text-sm">
      <figcaption className="text-xs font-medium text-fg-muted">Note from {from}</figcaption>
      <blockquote className="mt-0.5 whitespace-pre-line">{note}</blockquote>
    </figure>
  );
}
