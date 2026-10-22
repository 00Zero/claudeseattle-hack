import { normalizeGithubUsername, normalizeLinkedinUrl } from "../_lib/links";
import { ROLE_SHORT } from "@/lib/roles";
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
        {p.role_bucket && !p.is_mentor && <Pill>{ROLE_SHORT[p.role_bucket]}</Pill>}
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
        <p className="-ml-1.5 flex gap-1">
          {p.linkedin && (
            <IconLink href={p.linkedin} label={`${p.name} on LinkedIn`}>
              <LinkedInIcon />
            </IconLink>
          )}
          {p.github && (
            <IconLink href={p.github} label={`${p.name} on GitHub`}>
              <GitHubIcon />
            </IconLink>
          )}
        </p>
      )}
    </div>
  );
}

// A 36px tap target around a 20px icon, so it's easy to hit on a phone.
function IconLink({ href, label, children }: { href: string; label: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={label}
      title={label}
      className="inline-flex size-9 items-center justify-center rounded-md text-fg-muted transition-colors hover:bg-fg/5 hover:text-fg"
    >
      {children}
    </a>
  );
}

function LinkedInIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" fill="currentColor" aria-hidden="true">
      <path d="M20.45 20.45h-3.56v-5.57c0-1.33-.02-3.04-1.85-3.04-1.85 0-2.14 1.45-2.14 2.94v5.67H9.35V9h3.41v1.56h.05c.48-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.46v6.28ZM5.34 7.43a2.06 2.06 0 1 1 0-4.13 2.06 2.06 0 0 1 0 4.13ZM7.12 20.45H3.56V9h3.56v11.45ZM22.22 0H1.77C.79 0 0 .77 0 1.73v20.54C0 23.23.79 24 1.77 24h20.45c.98 0 1.78-.77 1.78-1.73V1.73C24 .77 23.2 0 22.22 0Z" />
    </svg>
  );
}

function GitHubIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" fill="currentColor" aria-hidden="true">
      <path d="M12 .3a12 12 0 0 0-3.8 23.38c.6.12.83-.26.83-.57L9 21.07c-3.34.72-4.04-1.61-4.04-1.61-.55-1.39-1.34-1.76-1.34-1.76-1.08-.74.09-.73.09-.73 1.2.09 1.83 1.24 1.83 1.24 1.07 1.83 2.81 1.3 3.5 1 .1-.78.42-1.31.76-1.6-2.67-.3-5.47-1.33-5.47-5.93 0-1.31.47-2.38 1.24-3.22-.14-.3-.54-1.52.1-3.18 0 0 1-.32 3.3 1.23a11.5 11.5 0 0 1 6 0c2.28-1.55 3.29-1.23 3.29-1.23.64 1.66.24 2.88.12 3.18a4.65 4.65 0 0 1 1.23 3.22c0 4.61-2.8 5.63-5.48 5.92.42.36.81 1.1.81 2.22l-.01 3.29c0 .31.2.69.82.57A12 12 0 0 0 12 .3Z" />
    </svg>
  );
}
