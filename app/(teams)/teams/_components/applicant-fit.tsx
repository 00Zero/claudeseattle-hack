import "server-only";
import { getMatchingProfiles } from "@/lib/matching";
import { createClient } from "@/lib/supabase/server";
import { rankForTeam, type TeamContext } from "../_lib/ai";
import { balanceOf, type RoleBucket } from "../_lib/teams";

// "Is this applicant a fit?" for a team leader, on the team page and in the Inbox. One
// Claude call per team covers every applicant and weighs the current members (_lib/ai.ts,
// applicant mode); each card streams in its own line from the shared promise.

export type ApplicantFit = { label: "Strong fit" | "Some fit" | "Not an obvious fit"; reason: string | null };

const labelFor = (score: number): ApplicantFit["label"] => (score >= 70 ? "Strong fit" : score >= 40 ? "Some fit" : "Not an obvious fit");

async function loadTeamContext(teamId: string): Promise<TeamContext | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("teams")
    .select("id, name, concept, looking_for, team_members(status, profiles(role_bucket, is_technical, platform_role, job_title, company, bio))")
    .eq("id", teamId)
    .maybeSingle();
  if (!data) return null;
  const members = (
    data.team_members as unknown as {
      status: string;
      profiles: {
        role_bucket: RoleBucket | null;
        is_technical: boolean | null;
        platform_role: string;
        job_title: string | null;
        company: string | null;
        bio: string | null;
      } | null;
    }[]
  )
    .filter((m) => m.status === "member" && m.profiles)
    .map((m) => ({ ...m.profiles!, is_mentor: m.profiles!.platform_role === "mentor" }));
  return {
    id: data.id as string,
    name: data.name,
    concept: data.concept,
    looking_for: data.looking_for,
    balance: balanceOf(members),
    members: members.map((m) => ({
      role: m.is_mentor ? "mentor" : (m.role_bucket ?? "unknown"),
      technical: m.is_technical === true,
      title: [m.job_title, m.company].filter(Boolean).join(" at ") || null,
      bio: m.bio,
    })),
  };
}

// Start this without awaiting it, then hand the promise to each <ApplicantFitLine>. Never
// rejects: on any failure it resolves to an empty map and the lines render nothing.
export async function applicantFits(teamId: string, applicantIds: string[]): Promise<Map<string, ApplicantFit>> {
  const fits = new Map<string, ApplicantFit>();
  if (!applicantIds.length) return fits;
  try {
    const [team, signals] = await Promise.all([loadTeamContext(teamId), getMatchingProfiles(applicantIds.slice(0, 15))]);
    if (!team || !signals.length) return fits;
    const picks = await rankForTeam(team, signals, "applicants");
    for (const pick of picks ?? []) fits.set(pick.profileId, { label: labelFor(pick.score), reason: pick.reason });
  } catch (error) {
    console.error("Teams AI: applicant fit failed", error);
  }
  return fits;
}

export async function ApplicantFitLine({ fits, profileId }: { fits: Promise<Map<string, ApplicantFit>>; profileId: string }) {
  const fit = (await fits).get(profileId);
  if (!fit) return null;
  return (
    <p className="text-sm">
      <span className="font-medium">✦ {fit.label}</span>
      {fit.reason && <span className="text-fg-muted">: {fit.reason}</span>}
    </p>
  );
}

export function ApplicantFitLoading() {
  return (
    <p className="text-sm text-fg-muted" role="status">
      ✦ Claude is checking how they&apos;d fit your team…
    </p>
  );
}
