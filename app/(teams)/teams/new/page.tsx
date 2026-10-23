import Link from "next/link";
import { redirect } from "next/navigation";
import { DeadlineBanner } from "../_components/deadline-banner";
import { getViewer, IDEAL_MAX, IDEAL_MIN } from "../_lib/teams";
import { createTeam } from "../actions";
import { TeamForm } from "../_components/team-form";

export default async function NewTeamPage() {
  const viewer = await getViewer();
  if (!viewer.signedIn) redirect("/login");
  if (viewer.access === "blocked") redirect("/declined");
  if (viewer.access !== "full") redirect("/pending");
  // Teams need to know who you are: confirm the Luma-filled profile first (sign-in does this too).
  if (!viewer.profile.profile_confirmed) redirect("/profile");
  if (viewer.myTeamId) redirect(`/teams/${viewer.myTeamId}`);

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <Link href="/teams" className="text-sm text-fg-muted underline">
          ← All teams
        </Link>
        <h1 className="text-2xl font-semibold">Create a team</h1>
        <DeadlineBanner />
      </div>
      {viewer.joinBlockedReason ? (
        <p className="rounded border border-line px-3 py-2">{viewer.joinBlockedReason}</p>
      ) : (
        <>
          <p className="text-sm text-fg-muted">
            You&apos;ll lead the team and accept people who apply. Teams should be {IDEAL_MIN}–{IDEAL_MAX} people and
            balanced: a business owner or founder, an experienced professional, a student or recent grad, and someone
            technical.
          </p>
          <TeamForm action={createTeam} submitLabel="Create team" pendingLabel="Creating…" />
        </>
      )}
    </div>
  );
}
