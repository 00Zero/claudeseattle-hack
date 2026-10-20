import { formatPacific } from "@/lib/time";
import { getFormationDeadline } from "../_lib/teams";

// Shown on every teams page. After the deadline pages keep working but say so.
export async function DeadlineBanner() {
  const { closesAt, isPast } = await getFormationDeadline();
  if (!closesAt) return null;

  return isPast ? (
    <p className="rounded border border-accent bg-accent-soft px-3 py-2 text-sm" role="status">
      <strong>Past deadline.</strong> Team formation closed {formatPacific(closesAt)}. You can still make changes, but
      they&apos;re after the deadline.
    </p>
  ) : (
    <p className="rounded border border-line px-3 py-2 text-sm text-fg-muted">
      Team formation closes <strong className="text-fg">{formatPacific(closesAt)}</strong>.
    </p>
  );
}
