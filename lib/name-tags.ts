import "server-only";
import { eventCloseAt } from "@/lib/event";
import { createAdminClient } from "@/lib/supabase/admin";

// "Print my name tag" on /profile. Requests land in name_tag_prints; the name tag printer polls
// /api/name-tags/feed for them. See supabase/migrations/*_shared_name_tags.sql.

// One print per person per 5 minutes. If a tag doesn't come out, they can try again after that.
export const NAME_TAG_COOLDOWN_MS = 5 * 60 * 1000;

type Settings = { name_tags_enabled: boolean | null; event_ends_at: string | null };

// Printing is on when an admin switched it on and the event hasn't ended.
export function nameTagsStatus(settings: Settings | null, now = Date.now()) {
  const endsAt = settings?.event_ends_at ?? eventCloseAt;
  const ended = now >= Date.parse(endsAt);
  const switchedOn = settings?.name_tags_enabled === true;
  return { open: switchedOn && !ended, switchedOn, ended, endsAt };
}

export async function getNameTagSettings() {
  const { data } = await createAdminClient()
    .from("event_settings")
    .select("name_tags_enabled, event_ends_at")
    .eq("id", 1)
    .maybeSingle();
  return data as Settings | null;
}

// The badge line at the bottom of the tag: event role first, else what describes them.
type ProfileForTag = { platform_role: string; role_bucket: string | null };
const PLATFORM_ROLE_LABEL: Record<string, string> = { judge: "Judge", mentor: "Mentor", volunteer: "Volunteer" };
const BUCKET_LABEL: Record<string, string> = {
  owner: "Business owner",
  student: "Student / recent grad",
  professional: "Professional",
};
function roleFromProfile(profile: ProfileForTag) {
  return PLATFORM_ROLE_LABEL[profile.platform_role] ?? (profile.role_bucket ? BUCKET_LABEL[profile.role_bucket] : null) ?? null;
}

// Event hosts get "Host" whatever their profile says. Their emails live in NAME_TAG_HOST_EMAILS
// (comma-separated, Vercel env) to keep them out of this public repo, and only a verified email
// on the profile counts, so adding someone else's address doesn't make you a host.
function hostEmails() {
  return (process.env.NAME_TAG_HOST_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export async function nameTagRole(profile: ProfileForTag & { id: string }) {
  const hosts = hostEmails();
  if (hosts.length) {
    const { data } = await createAdminClient()
      .from("profile_emails")
      .select("email")
      .eq("profile_id", profile.id)
      .eq("verified", true);
    if (data?.some((row) => hosts.includes(row.email.toLowerCase()))) return "Host";
  }
  return roleFromProfile(profile);
}

// When this person may print again (ms since epoch), or null if they may print now.
export async function nameTagRetryAt(profileId: string, now = Date.now()) {
  const { data } = await createAdminClient()
    .from("name_tag_prints")
    .select("requested_at")
    .eq("profile_id", profileId)
    .order("requested_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  const retryAt = Date.parse(data.requested_at) + NAME_TAG_COOLDOWN_MS;
  return retryAt > now ? retryAt : null;
}
