import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { BalanceBadges, Pill } from "../_components/badges";
import { DeadlineBanner } from "../_components/deadline-banner";
import { balanceOf, getViewer, IDEAL_MAX, IDEAL_MIN, type RoleBucket } from "../_lib/teams";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type RosterMember = {
  key: string;
  name: string;
  subtitle: string | null;
  linkedin: string | null;
  github: string | null;
  role_bucket: RoleBucket | null;
  is_technical: boolean | null;
  is_mentor: boolean;
  is_leader: boolean;
  approved: boolean | null; // null when not shown (public page)
};

type Team = { name: string; concept: string | null; looking_for: string | null; members: RosterMember[] };

const ROLE_LABEL: Record<RoleBucket, string> = { owner: "Owner", professional: "Professional", student: "Student" };

function titleAtCompany(title: string | null, company: string | null) {
  if (title && company) return `${title} at ${company}`;
  return title || company || null;
}

type ProfileRow = {
  id: string;
  first_name: string;
  last_name: string;
  job_title: string | null;
  company: string | null;
  linkedin_url: string | null;
  github_username: string | null;
  role_bucket: RoleBucket | null;
  is_technical: boolean | null;
  platform_role: string;
  luma_status: string | null;
};

// Logged-in with full access: the tables, with links and approval badges (RLS: can_browse).
async function loadFullTeam(id: string): Promise<Team | null> {
  const supabase = await createClient();
  const { data: team } = await supabase
    .from("teams")
    .select(
      "name, concept, looking_for, leader_id, team_members(status, profiles(id, first_name, last_name, job_title, company, linkedin_url, github_username, role_bucket, is_technical, platform_role, luma_status))",
    )
    .eq("id", id)
    .maybeSingle();
  if (!team) return null;

  const rows = team.team_members as unknown as { status: string; profiles: ProfileRow | null }[];
  const members = rows
    .filter((m) => m.status === "member" && m.profiles)
    .map(({ profiles: p }) => ({
      key: p!.id,
      name: `${p!.first_name} ${p!.last_name}`.trim(),
      subtitle: titleAtCompany(p!.job_title, p!.company),
      linkedin: p!.linkedin_url,
      github: p!.github_username ? `https://github.com/${p!.github_username}` : null,
      role_bucket: p!.role_bucket,
      is_technical: p!.is_technical,
      is_mentor: p!.platform_role === "mentor",
      is_leader: p!.id === team.leader_id,
      approved: p!.luma_status === "approved",
    }));
  return { name: team.name, concept: team.concept, looking_for: team.looking_for, members };
}

// Signed out: the anonymous-safe views. "First L." unless the member opted in; no links.
async function loadPublicTeam(id: string): Promise<Team | null> {
  const supabase = await createClient();
  const [{ data: team }, { data: members }] = await Promise.all([
    supabase.from("public_teams").select("name, concept").eq("id", id).maybeSingle(),
    supabase
      .from("public_team_members")
      .select("display_name, full_name, job_title, company, role_bucket, is_technical, is_mentor, is_leader")
      .eq("team_id", id),
  ]);
  if (!team) return null;

  return {
    name: team.name,
    concept: team.concept,
    looking_for: null,
    members: (members ?? []).map((m, i) => ({
      key: String(i),
      name: m.full_name ?? m.display_name,
      subtitle: titleAtCompany(m.job_title, m.company),
      linkedin: null,
      github: null,
      role_bucket: m.role_bucket,
      is_technical: m.is_technical,
      is_mentor: m.is_mentor,
      is_leader: m.is_leader,
      approved: null,
    })),
  };
}

export default async function TeamPage({ params }: PageProps<"/teams/[id]">) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();

  const viewer = await getViewer();
  if (viewer.signedIn && viewer.access === "blocked") redirect("/declined");
  if (viewer.signedIn && viewer.access !== "full") redirect("/pending");

  const team = viewer.signedIn ? await loadFullTeam(id) : await loadPublicTeam(id);
  if (!team) notFound();

  const members = [...team.members].sort((a, b) => Number(b.is_leader) - Number(a.is_leader) || a.name.localeCompare(b.name));
  const size = members.length;
  const sizeWarning = size < IDEAL_MIN || size > IDEAL_MAX;

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <Link href="/teams" className="text-sm text-fg-muted underline">
          ← All teams
        </Link>
        <h1 className="text-2xl font-semibold">{team.name}</h1>
        <DeadlineBanner />
      </div>

      {team.concept && <p className="whitespace-pre-line">{team.concept}</p>}
      {team.looking_for && (
        <p>
          <span className="font-medium">Looking for:</span> <span className="text-fg-muted">{team.looking_for}</span>
        </p>
      )}

      <section className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-semibold">
            Members <span className="font-normal text-fg-muted">({size})</span>
          </h2>
          {sizeWarning && (
            <span className="text-sm text-fg-muted">
              Teams should be {IDEAL_MIN}–{IDEAL_MAX}.
            </span>
          )}
        </div>
        <BalanceBadges balance={balanceOf(members)} />
        <ul className="divide-y divide-line rounded-lg border border-line bg-bg-raised">
          {members.map((m) => (
            <li key={m.key} className="space-y-1 px-4 py-3">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="font-medium">{m.name}</span>
                {m.is_leader && <Pill tone="accent">Leader</Pill>}
                {m.is_mentor && <Pill>Mentor</Pill>}
                {m.role_bucket && !m.is_mentor && <Pill>{ROLE_LABEL[m.role_bucket]}</Pill>}
                {m.is_technical && !m.is_mentor && <Pill>Technical</Pill>}
                {m.approved === false && <Pill tone="warn">Not yet approved</Pill>}
              </div>
              {m.subtitle && <p className="text-sm text-fg-muted">{m.subtitle}</p>}
              {(m.linkedin || m.github) && (
                <p className="flex gap-4 text-sm">
                  {m.linkedin && (
                    <a href={m.linkedin} target="_blank" rel="noopener noreferrer" className="underline">
                      LinkedIn
                    </a>
                  )}
                  {m.github && (
                    <a href={m.github} target="_blank" rel="noopener noreferrer" className="underline">
                      GitHub
                    </a>
                  )}
                </p>
              )}
            </li>
          ))}
        </ul>
      </section>

      {!viewer.signedIn && (
        <p className="text-sm">
          <Link href="/login" className="underline">
            Log in
          </Link>{" "}
          to apply to this team.
        </p>
      )}
    </div>
  );
}
