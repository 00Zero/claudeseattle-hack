"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getViewer } from "./_lib/teams";

export type FormState = { status: "idle" | "error"; message?: string };

function text(formData: FormData, key: string, max: number) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

// Creates a team led by the current user. RLS (teams_create) requires can_join_teams() and
// leader_id = auth.uid(); a trigger then adds the leader as a member, which fails if they're
// already on another team (one_team_per_person).
export async function createTeam(_prev: FormState, formData: FormData): Promise<FormState> {
  const viewer = await getViewer();
  if (!viewer.signedIn) return { status: "error", message: "Your session expired. Log in again." };
  if (viewer.joinBlockedReason) return { status: "error", message: viewer.joinBlockedReason };
  if (viewer.myTeamId) return { status: "error", message: "You're already on a team. Leave it first to start a new one." };

  const name = text(formData, "name", 60);
  if (name.length < 2) return { status: "error", message: "Give your team a name." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("teams")
    .insert({
      name,
      concept: text(formData, "concept", 1000) || null,
      looking_for: text(formData, "looking_for", 300) || null,
      leader_id: viewer.profile.id,
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505" && error.message.includes("one_team_per_person")) {
      return { status: "error", message: "You're already on a team. Leave it first to start a new one." };
    }
    if (error.code === "23505") return { status: "error", message: "A team with that name already exists. Pick another." };
    return { status: "error", message: "We couldn't create your team. Try again." };
  }

  revalidatePath("/teams");
  redirect(`/teams/${data.id}`);
}
