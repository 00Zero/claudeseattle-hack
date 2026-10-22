import { normalizeGithubUsername, normalizeLinkedinUrl } from "../_lib/links";
import type { RoleBucket } from "../_lib/teams";
import { Pill } from "./badges";

// One person as the team page and the people list show them.
export type Person = {
  id: string | null; // null on the public page
  name: string;
  subtitle: string | null;
  linkedin: string | null;
  github: string | null;
  role_bucket: RoleBucket | null;
  is_technical: boolean | null;
  is_mentor: boolean;
  is_leader: boolean;
  approved: boolean | null; // null when not shown (public page)
  checked_in: boolean; // Luma check-in, from the admin's re-import on event day
  bio: string | null;
  looking_for: string | null;
};

// The profile columns a Person is built from (logged-in pages; RLS: can_browse).
export const PERSON_COLUMNS =
  "id, first_name, last_name, job_title, company, linkedin_url, github_username, role_bucket, is_technical, platform_role, luma_status, checked_in_at, bio, looking_for";

export type ProfileRow = {
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
  checked_in_at: string | null;
  bio: string | null;
  looking_for: string | null;
};

export const NO_NAME = "Name not set yet";

export const ROLE_LABEL: Record<RoleBucket, string> = { owner: "Owner", professional: "Professional", student: "Student" };

export function titleAtCompany(title: string | null, company: string | null) {
  if (title && company) return `${title} at ${company}`;
  return title || company || null;
}

// Links are shown only when they pass the checks in _lib/links.ts.
export function personFromProfile(p: ProfileRow, leaderId: string | null = null): Person {
  const github = normalizeGithubUsername(p.github_username);
  return {
    id: p.id,
    // Accounts approved without a Luma match start with no name until they fill in their profile.
    name: `${p.first_name} ${p.last_name}`.trim() || NO_NAME,
    subtitle: titleAtCompany(p.job_title, p.company),
    linkedin: normalizeLinkedinUrl(p.linkedin_url),
    github: github ? `https://github.com/${github}` : null,
    role_bucket: p.role_bucket,
    is_technical: p.is_technical,
    is_mentor: p.platform_role === "mentor",
    is_leader: p.id === leaderId,
    approved: p.luma_status === "approved",
    checked_in: Boolean(p.checked_in_at),
    bio: p.bio,
    looking_for: p.looking_for,
  };
}

export function PersonDetails({ person: p, showAbout = false }: { person: Person; showAbout?: boolean }) {
  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className={p.name === NO_NAME ? "font-medium italic text-fg-muted" : "font-medium"}>{p.name}</span>
        {p.is_leader && <Pill tone="accent">Leader</Pill>}
        {p.is_mentor && <Pill>Mentor</Pill>}
        {p.role_bucket && !p.is_mentor && <Pill>{ROLE_LABEL[p.role_bucket]}</Pill>}
        {p.is_technical && !p.is_mentor && <Pill>Technical</Pill>}
        {p.approved === false && <Pill tone="warn">Not yet approved</Pill>}
        {p.checked_in && <Pill tone="live">Checked in</Pill>}
      </div>
      {p.subtitle && <p className="text-sm text-fg-muted">{p.subtitle}</p>}
      {showAbout && p.bio && <p className="text-sm">{p.bio}</p>}
      {showAbout && p.looking_for && (
        <p className="text-sm">
          <span className="font-medium">Looking for:</span> <span className="text-fg-muted">{p.looking_for}</span>
        </p>
      )}
      {(p.linkedin || p.github) && (
        <p className="flex gap-4 text-sm">
          {p.linkedin && (
            <a href={p.linkedin} target="_blank" rel="noopener noreferrer" className="underline">
              LinkedIn
            </a>
          )}
          {p.github && (
            <a href={p.github} target="_blank" rel="noopener noreferrer" className="underline">
              GitHub
            </a>
          )}
        </p>
      )}
    </div>
  );
}
