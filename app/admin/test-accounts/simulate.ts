import "server-only";
import { fitFor, type FitPerson } from "@/app/(teams)/teams/_lib/fit";
import { balanceOf, type RoleBucket } from "@/app/(teams)/teams/_lib/teams";
import type { MatchingProfile } from "@/lib/matching";
import type { createAdminClient } from "@/lib/supabase/admin";

// Test data for rehearsing team formation and judging, for test accounts only
// (lib/test-accounts.ts). Writes with the service role after the caller's admin check.

type Admin = ReturnType<typeof createAdminClient>;
type Person = MatchingProfile & { first_name: string };

const TARGET_SIZE = 4;
const MAX_SIZE = 6;
const LEADER_ORDER: (RoleBucket | null)[] = ["owner", "professional", "student", null];

const traits = (p: Person) => ({
  role_bucket: p.role_bucket as RoleBucket | null,
  is_technical: p.is_technical,
  is_mentor: p.platform_role === "mentor",
});

// Forms teams from test participants who aren't on a team, the way the people page ranks
// them: leaders are business owners first (Impact Lab teams form around a business), then
// each team in turn takes the remaining person with the best fitFor() score, until everyone
// is placed. The team's concept for scoring is the leader's own matching signals, kept in
// memory; the stored concept is a plain test label, since Luma and survey answers are never
// shown. Returns how many teams it made.
export async function formTestTeams(admin: Admin): Promise<number> {
  const [{ data: signals, error }, { data: names }, { data: members }] = await Promise.all([
    admin.from("matching_profiles").select("*").eq("is_test", true).eq("access", "full").eq("platform_role", "participant"),
    admin.from("profiles").select("id, first_name").eq("is_test", true),
    admin.from("team_members").select("profile_id").eq("status", "member"),
  ]);
  if (error) throw new Error(`matching profiles: ${error.message}`);
  const onTeam = new Set((members ?? []).map((m) => m.profile_id));
  const firstName = new Map((names ?? []).map((n) => [n.id, n.first_name as string]));
  const pool: Person[] = ((signals ?? []) as MatchingProfile[])
    .filter((p) => !onTeam.has(p.profile_id))
    .map((p) => ({ ...p, first_name: firstName.get(p.profile_id) || "Test" }));
  if (pool.length < 2) throw new Error("Fewer than 2 test participants without a team. Create more test accounts first.");

  const teamCount = Math.max(1, Math.round(pool.length / TARGET_SIZE));
  pool.sort((a, b) => LEADER_ORDER.indexOf(a.role_bucket as RoleBucket) - LEADER_ORDER.indexOf(b.role_bucket as RoleBucket));
  const teams = pool.splice(0, teamCount).map((leader) => ({ leader, members: [leader] }));

  while (pool.length) {
    const open = teams.filter((t) => t.members.length < MAX_SIZE).sort((a, b) => a.members.length - b.members.length);
    if (!open.length) break;
    for (const team of open) {
      if (!pool.length) break;
      const leader = team.leader;
      const fitTeam = {
        concept: [leader.why_join, leader.features_interest, leader.linkedin_headline, leader.linkedin_summary].join(" "),
        looking_for: leader.looking_for,
        balance: balanceOf(team.members.map(traits)),
      };
      const scores = pool.map((p) => fitFor(fitTeam, p as FitPerson).score);
      const best = scores.indexOf(Math.max(...scores));
      team.members.push(...pool.splice(best, 1));
    }
  }

  const { count } = await admin.from("teams").select("id", { count: "exact", head: true }).like("name", "Test team %");
  let made = 0;
  for (const [i, team] of teams.entries()) {
    const { data: created, error: teamError } = await admin
      .from("teams")
      .insert({
        name: `Test team ${(count ?? 0) + i + 1} (${team.leader.first_name})`,
        concept: "A test team for rehearsing team formation and judging.",
        leader_id: team.leader.profile_id,
      })
      .select("id")
      .single();
    if (teamError) throw new Error(`Creating a test team: ${teamError.message}`);
    const rest = team.members.slice(1).map((m) => ({
      team_id: created.id,
      profile_id: m.profile_id,
      status: "member",
      joined_at: new Date().toISOString(),
    }));
    if (rest.length) {
      const { error: memberError } = await admin.from("team_members").insert(rest);
      if (memberError) throw new Error(`Adding test team members: ${memberError.message}`);
    }
    made++;
  }
  return made;
}

// A submitted entry for every test team that has none, saved by its leader. Repo and video
// stay empty: test participants can fill them in on /submit through "View as".
export async function createTestProjects(admin: Admin): Promise<number> {
  const [{ data: teams, error }, { data: entries }] = await Promise.all([
    admin.from("teams").select("id, name, concept, leader_id, leader:profiles!teams_leader_id_fkey!inner(is_test)").eq("leader.is_test", true),
    admin.from("judge_entries").select("team_id"),
  ]);
  if (error) throw new Error(`test teams: ${error.message}`);
  const hasEntry = new Set((entries ?? []).map((e) => e.team_id));
  const rows = (teams ?? [])
    .filter((t) => !hasEntry.has(t.id))
    .map((t) => ({
      team_id: t.id,
      title: `${t.name}: project`,
      tagline: "A test project for rehearsing judging.",
      description_short: t.concept,
      description_long: "Test entry. Edit it on /submit as one of the team's test accounts to try the form.",
      last_saved_at: new Date().toISOString(),
      last_saved_by: t.leader_id,
    }));
  if (rows.length) {
    const { error: insertError } = await admin.from("judge_entries").insert(rows);
    if (insertError) throw new Error(`Creating test projects: ${insertError.message}`);
  }
  return rows.length;
}
