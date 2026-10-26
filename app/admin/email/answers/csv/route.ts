import { getAdminProfile } from "@/lib/admin";
import type { Answers } from "@/lib/followup/survey";
import { createAdminClient } from "@/lib/supabase/admin";

// /admin/email/answers/csv: every survey answer, one row per person, one column per question.
// Route handlers skip the admin layout, so this checks on its own.
export async function GET() {
  if (!(await getAdminProfile())) return new Response("Not found", { status: 404 });
  const { data, error } = await createAdminClient()
    .from("followup_responses")
    .select("answers, updated_at, followup_invites(first_name, email, grp, role)")
    .order("updated_at");
  if (error) return new Response(error.message, { status: 500 });

  type Row = { answers: Answers; updated_at: string; followup_invites: { first_name: string | null; email: string; grp: string; role: string } };
  const rows = (data ?? []) as unknown as Row[];
  const flat = rows.map((r) => {
    const out: Record<string, string> = {
      answered_at: r.updated_at,
      first_name: r.followup_invites.first_name ?? "",
      email: r.followup_invites.email,
      group: r.followup_invites.grp,
      role: r.followup_invites.role,
      track: r.answers.track,
      came: r.answers.came ?? "",
      said_more: r.answers.more ? "yes" : "no",
      additional: r.answers.additional ?? "",
    };
    for (const [k, v] of [...Object.entries(r.answers.quick), ...Object.entries(r.answers.detail)]) {
      if (typeof v === "string") out[k] = v;
      else if (Array.isArray(v)) out[k] = v.join("; ");
      else for (const [row, choice] of Object.entries(v)) out[`${k}: ${row}`] = choice;
    }
    return out;
  });
  const columns = [...new Set(flat.flatMap((r) => Object.keys(r)))];
  const cell = (v: string) => (/[",\n]/.test(v) ? `"${v.replaceAll('"', '""')}"` : v);
  const csv = [columns.map(cell).join(","), ...flat.map((r) => columns.map((c) => cell(r[c] ?? "")).join(","))].join("\n");
  return new Response(csv, {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="hackathon-feedback.csv"' },
  });
}
