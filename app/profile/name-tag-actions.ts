"use server";

import { getCurrentAccess } from "@/lib/access";
import { getNameTagSettings, nameTagRetryAt, nameTagRole, nameTagsStatus, NAME_TAG_COOLDOWN_MS } from "@/lib/name-tags";
import { onStandby } from "@/lib/standby";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentProfile } from "@/lib/supabase/profile";

export type NameTagState =
  | { status: "idle" }
  | { status: "printing"; retryAt: number }
  | { status: "wait"; retryAt: number }
  | { status: "error"; message: string };

// Queues a name tag with the caller's current profile details. The server enforces the switch,
// the event end and the 5-minute wait; the button's countdown is only a convenience.
export async function requestNameTag(): Promise<NameTagState> {
  const profile = await getCurrentProfile();
  if (!profile) return { status: "error", message: "Sign in to print your name tag." };
  const access = await getCurrentAccess();
  if (access === "blocked") return { status: "error", message: "Name tags aren't available for this account." };
  if (onStandby(profile, access)) return { status: "error", message: "You can print a name tag once you're off standby." };
  if (!profile.first_name?.trim()) return { status: "error", message: "Add your first name to your profile first." };

  // Admins can print any time, even with printing off or the event over, and reprint a bad tag at once.
  const isAdmin = profile.platform_role === "admin";
  if (!isAdmin && !nameTagsStatus(await getNameTagSettings()).open) {
    return { status: "error", message: "Name tag printing is turned off right now." };
  }
  const retryAt = isAdmin ? null : await nameTagRetryAt(profile.id);
  if (retryAt) return { status: "wait", retryAt };

  const { error } = await createAdminClient()
    .from("name_tag_prints")
    .insert({
      profile_id: profile.id,
      first_name: profile.first_name.trim(),
      last_name: (profile.last_name ?? "").trim(),
      job_title: profile.job_title?.trim() || null,
      company: profile.company?.trim() || null,
      role_label: await nameTagRole(profile),
    });
  if (error) {
    console.error("Name tag request failed", error.message);
    return { status: "error", message: "Couldn't send your name tag to the printer. Try again in a minute." };
  }
  return { status: "printing", retryAt: Date.now() + NAME_TAG_COOLDOWN_MS };
}
