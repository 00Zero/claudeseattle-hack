import "server-only";
import type { Access } from "@/lib/access";
import { venue } from "@/lib/event";
import { createAdminClient } from "@/lib/supabase/admin";

// Standby check-in: see supabase/migrations/*_shared_standby_checkins.sql.

// The Luma ticket name, exactly as in the CSV.
export const STANDBY_TICKET = "Standby";

// Within this many meters of the venue (after allowing for the GPS accuracy) counts as on site.
export const ON_SITE_METERS = 500;

// Still on standby: a Standby ticket without full access yet. They can check in and fill in their
// profile, but can't print a name tag or join a team.
export function onStandby(profile: { ticket_name: string | null }, access: Access | null) {
  return profile.ticket_name === STANDBY_TICKET && access !== "full";
}

export type StandbyCheckin = {
  profile_id: string;
  checked_in_at: string;
  last_attempt_at: string;
  ip: string | null;
  user_agent: string | null;
  ip_city: string | null;
  ip_region: string | null;
  ip_country: string | null;
  ip_lat: number | null;
  ip_lon: number | null;
  gps_lat: number | null;
  gps_lon: number | null;
  gps_accuracy_m: number | null;
  gps_error: string | null;
  venue_distance_m: number | null;
  approved_at: string | null;
  approved_by: string | null;
};

export async function getStandbyCheckin(profileId: string) {
  const { data } = await createAdminClient()
    .from("standby_checkins")
    .select("*")
    .eq("profile_id", profileId)
    .maybeSingle();
  return data as StandbyCheckin | null;
}

export async function standbyCanSeeTeams() {
  const { data } = await createAdminClient()
    .from("event_settings")
    .select("standby_can_see_teams")
    .eq("id", 1)
    .maybeSingle();
  return data?.standby_can_see_teams === true;
}

// The venue's coordinates: the admin settings first, else the built-in ones.
export async function venueCoords() {
  const { data } = await createAdminClient().from("event_settings").select("venue_lat, venue_lon").eq("id", 1).maybeSingle();
  return data?.venue_lat != null && data?.venue_lon != null
    ? { lat: data.venue_lat as number, lon: data.venue_lon as number }
    : { lat: venue.lat, lon: venue.lon };
}

// Great-circle distance in meters.
export function distanceMeters(a: { lat: number; lon: number }, b: { lat: number; lon: number }) {
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.sqrt(h));
}

export type LocationVerdict = "on_site" | "near" | "far" | "unknown";

// From the browser position only; IP location is too coarse to tell a building apart.
export function locationVerdict(c: Pick<StandbyCheckin, "venue_distance_m" | "gps_accuracy_m">): LocationVerdict {
  if (c.venue_distance_m == null) return "unknown";
  const closest = Math.max(0, c.venue_distance_m - (c.gps_accuracy_m ?? 0));
  if (closest <= ON_SITE_METERS) return "on_site";
  if (closest <= 1000) return "near";
  return "far";
}
