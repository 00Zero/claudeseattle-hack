import "server-only";
import { getCurrentAccess, type Access } from "@/lib/access";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/supabase/profile";
import { ROLE_SHORT, type RoleBucket } from "@/lib/roles";
import { normalizeGithubUsername } from "@/app/(teams)/teams/_lib/links";
import { getEnabledCriteria } from "../../_lib/criteria";
import type { Checklist } from "./checklist";
import { entryValues } from "./merge";
import { EMPTY_PART, loadParts, type Part } from "./parts";

// docs/REQUIREMENTS.md, "Judging app": the entry form's fields and their limits.
export const LIMITS = {
  title: 80,
  tagline: 140,
  // Room for an older entry's short and long descriptions read together.
  description: 6000,
  url: 500,
  linkLabel: 60,
  links: 5,
  contributions: 1000,
  contribution: 2000,
};

export type EntryLink = { label: string; url: string };

export type EntryValues = {
  title: string;
  tagline: string;
  description: string;
  video_url: string;
  repo_url: string;
  links: EntryLink[];
  // The team's shared "who did what" from before each teammate wrote their own part
  // (judge_contributions). The form keeps it as it is.
  contributions: string;
};

export type Entry = EntryValues & {
  id: string;
  checklist: Checklist | null;
  last_saved_at: string | null;
  last_saved_by_name: string | null;
};

// A teammate's "who did what" section on /submit. Anyone on the team can write any teammate's
// part and add a missing GitHub username.
export type Teammate = {
  id: string;
  name: string;
  role: string | null;
  isLeader: boolean;
  github: string | null;
  // github was added by a teammate (judge_contributions), not set by them on /profile.
  githubByTeam: boolean;
  part: Part;
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
      teamwork: boolean;
      me: string;
      teammates: Teammate[];
    };

type MemberProfile = {
  id: string;
  display_name: string;
  first_name: string | null;
  last_name: string | null;
  github_username: string | null;
  role_bucket: RoleBucket | null;
  platform_role: string;
};

const STAFF_ROLE: Record<string, string> = { mentor: "Mentor", judge: "Judge", volunteer: "Volunteer", admin: "Organizer" };

function memberRole(p: MemberProfile) {
  return STAFF_ROLE[p.platform_role] ?? (p.role_bucket ? ROLE_SHORT[p.role_bucket] : null);
}

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
    .select("teams(id, name, concept, leader_id)")
    .eq("profile_id", profile.id)
    .eq("status", "member")
    .maybeSingle();
  const joined = membership?.teams as unknown as { id: string; name: string; concept: string | null; leader_id: string | null } | null;
  if (!joined) return { kind: "blocked", reason: "Join or create a team first; each team submits one entry." };
  const { leader_id: leaderId, ...team } = joined;

  const [{ closesAt, isPast }, { data: row }, { data: late }, { keys }, { data: members }, parts] = await Promise.all([
    getSubmissionDeadline(),
    supabase
      .from("judge_entries")
      .select("id, title, tagline, description_short, description_long, video_url, repo_url, links, contributions, checklist, last_saved_at, saver:profiles!judge_entries_last_saved_by_fkey(display_name)")
      .eq("team_id", team.id)
      .maybeSingle(),
    supabase
      .from("judge_late_saves")
      .select("saved_at, decision")
      .eq("team_id", team.id)
      .order("saved_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    getEnabledCriteria(supabase),
    supabase
      .from("team_members")
      .select("joined_at, profiles(id, display_name, first_name, last_name, github_username, role_bucket, platform_role)")
      .eq("team_id", team.id)
      .eq("status", "member")
      .order("joined_at"),
    loadParts(supabase, team.id),
  ]);

  const teammates: Teammate[] = ((members ?? []) as unknown as { profiles: MemberProfile | null }[])
    .map((m) => m.profiles)
    .filter((p): p is MemberProfile => Boolean(p))
    .map((p) => ({
      id: p.id,
      name: [p.first_name, p.last_name].filter(Boolean).join(" ") || p.display_name,
      role: memberRole(p),
      isLeader: p.id === leaderId,
      github: normalizeGithubUsername(p.github_username) ?? parts.get(p.id)?.github ?? null,
      githubByTeam: !normalizeGithubUsername(p.github_username) && Boolean(parts.get(p.id)?.github),
      part: parts.get(p.id) ?? EMPTY_PART,
    }))
    // The leader first, then the order people joined.
    .sort((a, b) => Number(b.isLeader) - Number(a.isLeader));

  const entry: Entry | null = row
    ? {
        id: row.id,
        ...entryValues(row),
        checklist: Object.keys(row.checklist ?? {}).length ? (row.checklist as Checklist) : null,
        last_saved_at: row.last_saved_at,
        last_saved_by_name: (row.saver as unknown as { display_name: string } | null)?.display_name ?? null,
      }
    : null;

  return { kind: "ready", team, entry, lateSave: (late as LateSave | null) ?? null, closesAt, isPast, teamwork: keys.includes("teamwork"), me: profile.id, teammates };
}
