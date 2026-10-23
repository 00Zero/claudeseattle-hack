import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { updateTeam } from "../../actions";
import { DeadlineBanner } from "../../_components/deadline-banner";
import { TeamForm } from "../../_components/team-form";
import { getViewer } from "../../_lib/teams";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function EditTeamPage({ params }: PageProps<"/teams/[id]/edit">) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();

  const viewer = await getViewer();
  if (!viewer.signedIn) redirect("/login");
  if (viewer.access === "blocked") redirect("/declined");
  if (viewer.access !== "full") redirect("/pending");
  // Teams need to know who you are: confirm the Luma-filled profile first (sign-in does this too).
  if (!viewer.profile.profile_confirmed) redirect("/profile");

  const supabase = await createClient();
  const { data: team } = await supabase
    .from("teams")
    .select("name, concept, looking_for, leader_id")
    .eq("id", id)
    .maybeSingle();
  if (!team) notFound();
  if (team.leader_id !== viewer.profile.id) redirect(`/teams/${id}`);

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <Link href={`/teams/${id}`} className="text-sm text-fg-muted underline">
          ← Back to {team.name}
        </Link>
        <h1 className="text-2xl font-semibold">Edit team</h1>
        <DeadlineBanner />
      </div>
      <TeamForm action={updateTeam} values={team} fields={{ team_id: id }} submitLabel="Save changes" pendingLabel="Saving…" />
    </div>
  );
}
