import Link from "next/link";
import { requireAdminPage } from "@/lib/admin";
import { questionsFor, type Answers, type Question, type Role, type Track } from "@/lib/followup/survey";
import { createAdminClient } from "@/lib/supabase/admin";

const TRACK_LABELS: Record<Track, string> = {
  attended: "Participants",
  mentor: "Mentors",
  judge: "Judges",
  volunteer: "Volunteers and ambassadors",
  no_show: "Didn't come",
  late_cancel: "Cancelled on the day",
  standby_out: "Standby, not admitted",
};

type Row = { answers: Answers; updated_at: string; followup_invites: { first_name: string | null; email: string; role: Role } };

// Counts for a choice, multi or matrix question across these answers.
function Tally({ q, rows, from }: { q: Question; rows: Row[]; from: "quick" | "detail" }) {
  if (q.kind === "text") return null;
  const values = rows.map((r) => (from === "quick" ? r.answers.quick[q.id] : r.answers.detail[q.id])).filter((v) => v != null);
  if (!values.length) return null;
  if (q.kind === "matrix") {
    return (
      <div className="space-y-1">
        <p className="font-medium">{q.label}</p>
        <table className="text-sm">
          <tbody>
            {q.rows.map((row) => (
              <tr key={row}>
                <td className="pr-4 text-foreground/70">{row}</td>
                {q.options.map((o) => (
                  <td key={o} className="pr-3 tabular-nums">
                    {o}: {values.filter((v) => (v as Record<string, string>)[row] === o).length}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
  const flat = values.flatMap((v) => (Array.isArray(v) ? v : [v as string]));
  return (
    <div className="space-y-1">
      <p className="font-medium">
        {q.label} <span className="font-normal text-foreground/60">({values.length})</span>
      </p>
      <ul className="flex flex-wrap gap-x-4 text-sm">
        {q.options.map((o) => (
          <li key={o} className="tabular-nums">
            {o}: <strong>{flat.filter((v) => v === o).length}</strong>
          </li>
        ))}
      </ul>
    </div>
  );
}

// Admin -> Email -> Answers: counts per question, then every written answer with who wrote it.
export default async function AnswersPage() {
  await requireAdminPage();
  const { data } = await createAdminClient()
    .from("followup_responses")
    .select("answers, updated_at, followup_invites(first_name, email, role)")
    .order("updated_at", { ascending: false });
  const rows = (data ?? []) as unknown as Row[];
  const tracks = (Object.keys(TRACK_LABELS) as Track[]).filter((t) => rows.some((r) => r.answers.track === t));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold">Feedback answers</h1>
        <span className="text-sm text-foreground/70">{rows.length} so far</span>
        <a href="/admin/email/answers/csv" className="ml-auto text-sm">
          Download CSV
        </a>
        <Link href="/admin/email" className="text-sm">
          ← Email
        </Link>
      </div>
      {rows.length === 0 && <p className="text-foreground/70">No answers yet.</p>}
      {tracks.map((track) => {
        const these = rows.filter((r) => r.answers.track === track);
        const { quick, detail } = questionsFor(track, "standby");
        const texts = [...detail.filter((q) => q.kind === "text"), { id: "additional", kind: "text" as const, label: "Any additional feedback?" }];
        return (
          <section key={track} className="space-y-4 rounded border border-foreground/20 p-4">
            <h2 className="text-lg font-semibold">
              {TRACK_LABELS[track]} <span className="font-normal text-foreground/60">({these.length}, {these.filter((r) => r.answers.more).length} said more)</span>
            </h2>
            <div className="space-y-3">
              {quick.map((q) => (
                <Tally key={q.id} q={q} rows={these} from="quick" />
              ))}
            </div>
            <details>
              <summary className="cursor-pointer text-sm font-medium">Optional questions</summary>
              <div className="mt-3 space-y-3">
                {detail.map((q) => (
                  <Tally key={q.id} q={q} rows={these} from="detail" />
                ))}
              </div>
            </details>
            <div className="space-y-4">
              {texts.map((q) => {
                const written = these
                  .map((r) => ({ who: r.followup_invites, text: q.id === "additional" ? r.answers.additional : (r.answers.detail[q.id] as string | undefined) }))
                  .filter((w) => w.text);
                if (!written.length) return null;
                return (
                  <div key={q.id} className="space-y-1">
                    <p className="font-medium">{q.label}</p>
                    <ul className="space-y-2 text-sm">
                      {written.map((w, k) => (
                        <li key={k} className="whitespace-pre-line rounded bg-foreground/5 px-3 py-2">
                          {w.text}
                          <span className="mt-1 block text-xs text-foreground/60">
                            {w.who.first_name ?? ""} · {w.who.email}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
