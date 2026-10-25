"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { getCurrentAccess } from "@/lib/access";
import { distanceMeters, getStandbyCheckin, onStandby, venueCoords } from "@/lib/standby";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentProfile } from "@/lib/supabase/profile";

export type CheckInState = { status: "idle" | "ok" | "error"; message?: string };

const GPS_ERRORS = ["denied", "unavailable", "timeout", "unsupported"];

function number(formData: FormData, key: string) {
  const value = Number(formData.get(key));
  return formData.get(key) !== null && formData.get(key) !== "" && Number.isFinite(value) ? value : null;
}

// Vercel sets these on every request (https://vercel.com/docs/headers/request-headers).
// The city is URL-encoded. Locally they're missing, so only the IP (if any) is stored.
async function requestLocation() {
  const h = await headers();
  const decode = (v: string | null) => {
    if (!v) return null;
    try {
      return decodeURIComponent(v);
    } catch {
      return v;
    }
  };
  const coord = (v: string | null) => (v && Number.isFinite(Number(v)) ? Number(v) : null);
  return {
    ip: h.get("x-real-ip") ?? h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    user_agent: h.get("user-agent")?.slice(0, 500) ?? null,
    ip_city: decode(h.get("x-vercel-ip-city")),
    ip_region: h.get("x-vercel-ip-country-region"),
    ip_country: h.get("x-vercel-ip-country"),
    ip_lat: coord(h.get("x-vercel-ip-latitude")),
    ip_lon: coord(h.get("x-vercel-ip-longitude")),
  };
}

// Records a standby check-in. The first one sets their place in line; later tries only refresh
// the location (say they allowed location the second time).
export async function checkIn(_prev: CheckInState, formData: FormData): Promise<CheckInState> {
  const profile = await getCurrentProfile();
  if (!profile) return { status: "error", message: "Sign in first." };
  if (!onStandby(profile, await getCurrentAccess())) {
    return { status: "error", message: "Check-in here is for standby guests only." };
  }

  const lat = number(formData, "lat");
  const lon = number(formData, "lon");
  const gps = lat != null && lon != null && Math.abs(lat) <= 90 && Math.abs(lon) <= 180 ? { lat, lon } : null;
  const gpsError = formData.get("gps_error");
  const location = {
    ...(await requestLocation()),
    gps_lat: gps?.lat ?? null,
    gps_lon: gps?.lon ?? null,
    gps_accuracy_m: gps ? number(formData, "accuracy") : null,
    gps_error: gps ? null : typeof gpsError === "string" && GPS_ERRORS.includes(gpsError) ? gpsError : "unavailable",
    venue_distance_m: gps ? Math.round(distanceMeters(gps, await venueCoords())) : null,
    last_attempt_at: new Date().toISOString(),
  };

  const admin = createAdminClient();
  const existing = await getStandbyCheckin(profile.id);
  const { error } = existing
    ? await admin.from("standby_checkins").update(location).eq("profile_id", profile.id)
    : await admin.from("standby_checkins").insert({ profile_id: profile.id, ...location });
  if (error) {
    console.error("Standby check-in failed", error.message);
    return { status: "error", message: "Couldn't check you in. Try again, or find an organizer." };
  }
  revalidatePath("/check-in");
  revalidatePath("/admin/standby");
  return { status: "ok" };
}
