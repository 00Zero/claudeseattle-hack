import "server-only";
import { getCurrentAccess, type Access } from "@/lib/access";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/supabase/profile";
import type { Checklist } from "./checklist";
import { entryValues } from "./merge";

// docs/REQUIREMENTS.md, "Judging app": the entry form's fields and their limits.
export const LIMITS = {
  title: 80,
  tagline: 140,
  description_short: 500,
  description_long: 5000,
  url: 500,
  linkLabel: 60,
  links: 5,
};

export type EntryLink = { label: string; url: string };

export type EntryValues = {
  title: string;
  tagline: string;
  description_short: string;
  description_long: string;
  video_url: string;
  repo_url: string;
  links: EntryLink[];
};

export type Entry = EntryValues & {
  id: string;
  checklist: Checklist | null;
  last_saved_at: string | null;
  last_saved_by_name: string | null;
};

export type LateSave = { saved_at: string; decision: "pending" | "accepted" | "rejected" };

export type SubmitContext =
  | { kind: "signed_out" }
  | { kind: "no_access"; access: Access | null }
  | { kind: "blocked"; reason: string }
  | {
      kind: "ready";
      team: { id: string; name: string; concept: string | null };
      entry: Entry | null;
      lateSave: LateSave | null;
      closesAt: string;
      isPast: boolean;
    };

function blockedReason(role: string) {
  if (role === "mentor") return "Mentors help teams but don't submit. Your team's participants submit the entry.";
  if (role === "judge") return "Judges score entries, so they don't submit one.";
  if (role === "volunteer") return "Volunteers help run the event, so they don't submit an entry.";
  return null;
}

// The submissions deadline from event_settings (readable by anyone).
export async function getSubmissionDeadline() {
  const supabase = await createClient();
  const { data } = await supabase.from("event_settings").select("submissions_close_at").eq("id", 1).maybeSingle();
  const closesAt: string = data?.submissions_close_at;
  return { closesAt, isPast: Date.now() >= new Date(closesAt).getTime() };
}

// Everything /submit and its save action need about the caller. Reads run as the user, so RLS
// decides what comes back: team members see their team's entry and late saves.
export async function getSubmitContext(): Promise<SubmitContext> {
  const profile = await getCurrentProfile();
  if (!profile) return { kind: "signed_out" };

  const access = await getCurrentAccess();
  if (access !== "full") return { kind: "no_access", access };
  const reason = blockedReason(profile.platform_role);
  if (reason) return { kind: "blocked", reason };

  const supabase = await createClient();
  const { data: membership } = await supabase
    .from("team_members")
    .select("teams(id, name, concept)")
    .eq("profile_id", profile.id)
    .eq("status", "member")
    .maybeSingle();
  const team = membership?.teams as unknown as { id: string; name: string; concept: string | null } | null;
  if (!team) return { kind: "blocked", reason: "Join or create a team first; each team submits one entry." };

  const [{ closesAt, isPast }, { data: row }, { data: late }] = await Promise.all([
    getSubmissionDeadline(),
    supabase
      .from("judge_entries")
      .select("id, title, tagline, description_short, description_long, video_url, repo_url, links, checklist, last_saved_at, saver:profiles!judge_entries_last_saved_by_fkey(display_name)")
      .eq("team_id", team.id)
      .maybeSingle(),
    supabase
      .from("judge_late_saves")
      .select("saved_at, decision")
      .eq("team_id", team.id)
      .order("saved_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const entry: Entry | null = row
    ? {
        id: row.id,
        ...entryValues(row),
        checklist: Object.keys(row.checklist ?? {}).length ? (row.checklist as Checklist) : null,
        last_saved_at: row.last_saved_at,
        last_saved_by_name: (row.saver as unknown as { display_name: string } | null)?.display_name ?? null,
      }
    : null;

  return { kind: "ready", team, entry, lateSave: (late as LateSave | null) ?? null, closesAt, isPast };
}
