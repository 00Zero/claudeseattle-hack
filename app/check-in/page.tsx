import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentAccess } from "@/lib/access";
import { venue } from "@/lib/event";
import { formatPacific } from "@/lib/time";
import { getCurrentProfile } from "@/lib/supabase/profile";
import { getStandbyCheckin, onStandby, STANDBY_TICKET, standbyCanSeeTeams } from "@/lib/standby";
import { listTeams, sortTeams, TEAM_MAX } from "@/app/(teams)/teams/_lib/teams";
import { SignOutButton } from "@/app/auth/sign-out-button";
import { CheckInButton } from "./check-in-button";

// Check-in for Luma "Standby" guests, who stay pending on Luma so Luma can't check them in.
export default async function CheckInPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  const access = await getCurrentAccess();
  if (access === "blocked") redirect("/declined");

  if (!onStandby(profile, access)) {
    if (profile.ticket_name !== STANDBY_TICKET) redirect(access === "full" ? "/" : "/pending");
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold">You&apos;re off standby. Welcome!</h1>
        <p>A spot opened up and you&apos;re in. You can now join a team and print your name tag.</p>
        <div className="flex flex-wrap gap-3">
          <Link href="/teams" className="rounded bg-foreground px-4 py-2 text-background">
            Find a team
          </Link>
          <Link href="/profile" className="rounded border border-foreground/20 px-4 py-2">
            Your profile and name tag
          </Link>
        </div>
      </div>
    );
  }

  const checkin = await getStandbyCheckin(profile.id);
  const showTeams = checkin ? await standbyCanSeeTeams() : false;
  const teams = showTeams ? sortTeams(await listTeams(false)) : [];

  return (
    <div className="space-y-8">
      {!checkin ? (
        <section className="space-y-4">
          <h1 className="text-2xl font-semibold">Standby check-in</h1>
          <p className="font-medium">You&apos;re signed in but not checked in yet. Tap the button below.</p>
          <p>
            You&apos;re on the standby list. Check in here once you&apos;re at {venue.name} ({venue.address}). As spots
            open up, organizers let standby guests in, picking people so teams get the mix of roles they need.
          </p>
          <p className="rounded border border-foreground/20 p-3">
            <span className="font-medium">When your phone asks to use your location, tap Allow.</span> That&apos;s how we
            confirm you&apos;re at the venue, and a check-in without it may not count.
          </p>
          <p className="text-sm text-foreground/70">
            We record your location and IP address with your check-in. Only organizers see them, to manage standby;
            they&apos;re never shown to other guests.
          </p>
          <CheckInButton label={`I'm at ${venue.name}: check me in`} />
        </section>
      ) : (
        <section className="space-y-4">
          <h1 className="text-2xl font-semibold">You&apos;re checked in on standby</h1>
          <p>Checked in {formatPacific(checkin.checked_in_at)}.</p>
          <p>
            If a spot opens up, we&apos;ll approve you and this page will say so; Luma will email you too. Until then you
            can&apos;t join a team or print a name tag.
          </p>
          {checkin.gps_lat == null && (
            <div className="space-y-2 rounded border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
              <p>
                <span className="font-medium">Your check-in isn&apos;t confirmed yet:</span> we couldn&apos;t get your
                location{checkin.gps_error === "denied" ? " because location access is blocked for this site" : ""}.
                Allow location for this site (on iPhone: Settings → Privacy &amp; Security → Location Services → your
                browser → While Using), then tap below.
              </p>
              <CheckInButton label="Share my location" />
            </div>
          )}
        </section>
      )}

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Meanwhile, fill in your profile</h2>
        <p>
          {profile.profile_confirmed
            ? "Your profile is confirmed. Keep it current, so teams can see what you bring if you're let in."
            : "Teams see your profile once you're let in, so check it and confirm it now."}
        </p>
        <Link href="/profile" className="inline-block rounded border border-foreground/20 px-4 py-2">
          {profile.profile_confirmed ? "Edit your profile" : "Fill in your profile"}
        </Link>
      </section>

      {showTeams && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Teams so far ({teams.length})</h2>
          <p className="text-sm text-foreground/70">You can join a team once you&apos;re off standby.</p>
          <ul className="space-y-2">
            {teams.map((t) => (
              <li key={t.id} className="rounded border border-foreground/15 p-3">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="font-medium">{t.name}</span>
                  <span className="shrink-0 text-sm text-foreground/60">
                    {t.memberCount >= TEAM_MAX ? "Full" : `${t.memberCount} of ${TEAM_MAX}`}
                  </span>
                </div>
                {t.concept && <p className="mt-1 line-clamp-3 text-sm text-foreground/70">{t.concept}</p>}
              </li>
            ))}
          </ul>
        </section>
      )}

      <SignOutButton />
    </div>
  );
}
