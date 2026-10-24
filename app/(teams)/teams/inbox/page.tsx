import Link from "next/link";
import { redirect } from "next/navigation";
import { acceptApplicant, acceptInvite, cancelInvite, declineApplicant, declineInvite, leaveTeam } from "../actions";
import { ActionButton } from "../_components/action-button";
import { BalanceBadges } from "../_components/badges";
import { DeadlineBanner } from "../_components/deadline-banner";
import { PersonDetails, personFromProfile } from "../_components/person";
import { TeamsTabs } from "../_components/teams-tabs";
import { inboxCount, loadInbox, type InviteToMe, type MyApplication } from "../_lib/inbox";
import { getViewer, MAX_APPLICATIONS, TEAM_MAX } from "../_lib/teams";

const card = "rounded-lg border border-line bg-bg-raised";

export default async function InboxPage() {
  const viewer = await getViewer();
  if (!viewer.signedIn) redirect("/login");
  if (viewer.access === "blocked") redirect("/declined");
  if (viewer.access !== "full") redirect("/pending");
  if (!viewer.profile.profile_confirmed) redirect("/profile");

  const [inbox, count] = await Promise.all([loadInbox(viewer), inboxCount(viewer)]);
  const onTeam = Boolean(inbox.myTeam);
  const openInvites = inbox.invitesToMe.filter((i) => i.status === "pending");
  const pastInvites = inbox.invitesToMe.filter((i) => i.status !== "pending");
  const openApplications = inbox.myApplications.filter((a) => a.status === "applied");
  const pastApplications = inbox.myApplications.filter((a) => a.status !== "applied");
  const nothing =
    !openInvites.length &&
    !inbox.applicationsToMyTeam.length &&
    !openApplications.length &&
    !inbox.invitesISent.length &&
    !pastInvites.length &&
    !pastApplications.length;

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <h1 className="text-2xl font-semibold">Teams</h1>
        <DeadlineBanner />
      </div>
      <TeamsTabs active="inbox" inboxCount={count} />

      {inbox.myTeam && (
        <p className="text-sm">
          You&apos;re on{" "}
          <Link href={`/teams/${inbox.myTeam.id}`} className="font-semibold underline">
            {inbox.myTeam.name}
          </Link>
          {inbox.myTeam.iLead ? " (you lead it)" : ""}. Joining a team closes your other invites and applications.
        </p>
      )}

      {nothing && <p className="text-fg-muted">Nothing here yet. Invites and applications show up in this tab.</p>}

      {inbox.applicationsToMyTeam.length > 0 && inbox.myTeam && (
        <Section title="People who want to join your team" count={inbox.applicationsToMyTeam.length}>
          <ul className={`divide-y divide-line ${card}`}>
            {inbox.applicationsToMyTeam.map((p) => (
              <li key={p.id} className="space-y-2 px-4 py-3">
                <PersonDetails person={personFromProfile(p)} showAbout />
                <div className="flex flex-wrap items-start gap-2">
                  <ActionButton
                    action={acceptApplicant}
                    fields={{ team_id: inbox.myTeam!.id, profile_id: p.id }}
                    label="Accept"
                    pendingLabel="Accepting…"
                  />
                  <ActionButton
                    action={declineApplicant}
                    fields={{ team_id: inbox.myTeam!.id, profile_id: p.id }}
                    label="Decline"
                    pendingLabel="Declining…"
                    variant="ghost"
                  />
                </div>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {openInvites.length > 0 && (
        <Section title="Teams that invited you" count={openInvites.length}>
          <p className="text-sm text-fg-muted">You can join one team. Accepting closes your other invites and applications.</p>
          <ul className={`divide-y divide-line ${card}`}>
            {openInvites.map((invite) => (
              <li key={invite.teamId} className="space-y-2 px-4 py-3">
                <InviteSummary invite={invite} />
                {onTeam ? (
                  <p className="text-sm text-fg-muted">You&apos;re already on a team, so you can&apos;t accept this.</p>
                ) : (
                  <div className="flex flex-wrap items-start gap-2">
                    <ActionButton action={acceptInvite} fields={{ team_id: invite.teamId }} label="Accept" pendingLabel="Joining…" />
                    <ActionButton
                      action={declineInvite}
                      fields={{ team_id: invite.teamId }}
                      label="Decline"
                      pendingLabel="Declining…"
                      variant="ghost"
                    />
                    <Link href={`/teams/${invite.teamId}`} className="btn btn-ghost">
                      View team
                    </Link>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {openApplications.length > 0 && (
        <Section title={`Your applications (${openApplications.length} of ${MAX_APPLICATIONS})`}>
          <ul className={`divide-y divide-line ${card}`}>
            {openApplications.map((a) => (
              <li key={a.teamId} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                <span className="text-sm">
                  <Link href={`/teams/${a.teamId}`} className="font-medium underline">
                    {a.teamName}
                  </Link>{" "}
                  <span className="text-fg-muted">· waiting for the leader</span>
                </span>
                <ActionButton action={leaveTeam} fields={{ team_id: a.teamId }} label="Withdraw" pendingLabel="Withdrawing…" variant="link" />
              </li>
            ))}
          </ul>
        </Section>
      )}

      {inbox.invitesISent.length > 0 && inbox.myTeam && (
        <Section title="Invites you sent" count={inbox.invitesISent.length}>
          <ul className={`divide-y divide-line ${card}`}>
            {inbox.invitesISent.map((invite) => (
              <li key={invite.profileId} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                <span className="text-sm">
                  <span className="font-medium">{invite.name}</span> <span className="text-fg-muted">· hasn&apos;t answered yet</span>
                </span>
                <ActionButton
                  action={cancelInvite}
                  fields={{ team_id: inbox.myTeam!.id, profile_id: invite.profileId }}
                  label="Cancel"
                  pendingLabel="Cancelling…"
                  variant="link"
                />
              </li>
            ))}
          </ul>
        </Section>
      )}

      {(pastInvites.length > 0 || pastApplications.length > 0) && (
        <Section title="Closed">
          <ul className={`divide-y divide-line ${card}`}>
            {pastInvites.map((invite) => (
              <li key={`i-${invite.teamId}`} className="px-4 py-2 text-sm">
                <Link href={`/teams/${invite.teamId}`} className="underline">
                  {invite.teamName}
                </Link>{" "}
                <span className="text-fg-muted">· invite {inviteOutcome(invite, onTeam)}</span>
              </li>
            ))}
            {pastApplications.map((a) => (
              <li key={`a-${a.teamId}`} className="px-4 py-2 text-sm">
                <Link href={`/teams/${a.teamId}`} className="underline">
                  {a.teamName}
                </Link>{" "}
                <span className="text-fg-muted">· application {applicationOutcome(a, onTeam)}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}

function Section({ title, count, children }: { title: string; count?: number; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">
        {title} {count !== undefined && <span className="font-normal text-fg-muted">({count})</span>}
      </h2>
      {children}
    </section>
  );
}

// Enough to judge the team without leaving the inbox; "View team" opens the full roster.
function InviteSummary({ invite }: { invite: InviteToMe }) {
  return (
    <div className="space-y-2">
      <p className="text-sm">
        <Link href={`/teams/${invite.teamId}`} className="font-semibold underline">
          {invite.teamName}
        </Link>{" "}
        <span className="text-fg-muted">
          · invited by {invite.invitedBy} · {invite.size} of {TEAM_MAX} members
        </span>
      </p>
      {invite.concept && <p className="line-clamp-2 text-sm text-fg-muted">{invite.concept}</p>}
      <BalanceBadges balance={invite.balance} />
      {invite.lookingFor && (
        <p className="text-sm">
          <span className="font-medium">Looking for:</span> <span className="text-fg-muted">{invite.lookingFor}</span>
        </p>
      )}
    </div>
  );
}

function inviteOutcome(invite: InviteToMe, onTeam: boolean) {
  switch (invite.status) {
    case "accepted":
      return "accepted";
    case "declined":
      return "declined";
    case "cancelled":
      return "cancelled by the leader";
    case "expired":
      return onTeam ? "expired when you joined a team" : "expired";
    default:
      return invite.status;
  }
}

function applicationOutcome(a: MyApplication, onTeam: boolean) {
  if (a.status === "rejected") return "declined by the leader";
  return onTeam ? "withdrawn (you joined a team)" : "withdrawn";
}
