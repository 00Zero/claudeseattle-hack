import Link from "next/link";
import { redirect } from "next/navigation";
import { formatPacific } from "@/lib/time";
import { PageHeader } from "../_components/ui";
import { VIDEO_HOSTS_HINT } from "../_lib/video";
import { saveContributions, saveEntry, setTeammateGithub } from "./actions";
import { EntryForm } from "./_components/entry-form";
import type { CheckItem, Checklist } from "./_lib/checklist";
import { getSubmitContext, LIMITS, type Entry, type EntryValues, type LateSave } from "./_lib/entry";

// /submit: one entry per team, editable by any member who may submit until the deadline,
// then read-only. docs/REQUIREMENTS.md, "Judging app (Dev B)".
export default async function SubmitPage() {
  const ctx = await getSubmitContext();
  if (ctx.kind === "signed_out") redirect("/login");
  if (ctx.kind === "no_access") redirect(ctx.access === "blocked" ? "/declined" : "/pending");

  if (ctx.kind === "blocked") {
    return (
      <div className="space-y-6">
        <PageHeader eyebrow="Submission" title="Submit your" italic="project">
          <p>{ctx.reason}</p>
        </PageHeader>
        <Link href="/teams" className="btn btn-ghost">
          Go to teams
        </Link>
      </div>
    );
  }

  const { team, entry, lateSave, closesAt, isPast, teamwork, me, teammates } = ctx;
  // After the deadline, a pending late save is the team's latest version: start from it.
  const values: EntryValues = lateSave?.decision === "pending"
    ? lateSave.values
    : entry
    ? {
        title: entry.title,
        tagline: entry.tagline,
        description: entry.description,
        video_url: entry.video_url,
        repo_url: entry.repo_url,
        links: entry.links,
        contributions: entry.contributions,
      }
    : {
    title: team.name,
    tagline: "",
    description: team.concept ?? "",
    video_url: "",
    repo_url: "",
    links: [],
    contributions: "",
  };

  return (
    <div className="space-y-10">
      <div className="space-y-4">
        <PageHeader eyebrow={`Submission · ${team.name}`} title="Submit your" italic="project">
          <p>
            Entry for{" "}
            <Link href={`/teams/${team.id}`} className="text-fg underline">
              {team.name}
            </Link>
            . Anyone on the team can edit it. Judges review it without talking to you, so give them everything they need.
          </p>
        </PageHeader>
        <Deadline closesAt={closesAt} isPast={isPast} />
        <LastSaved entry={entry} />
        {lateSave && <LateSaveStatus lateSave={lateSave} />}
      </div>

      {entry?.checklist && <ChecklistView checklist={entry.checklist} />}

      <EntryForm
        action={saveEntry}
        partsAction={saveContributions}
        teamId={team.id}
        saved={{ values, savedAt: entry?.last_saved_at ?? null, savedBy: entry?.last_saved_by_name ?? null }}
        limits={LIMITS}
        videoHint={VIDEO_HOSTS_HINT}
        closesAt={closesAt}
        // Teamwork is a judging criterion: the team says what each person did.
        contributions={
          teamwork
            ? { teammates, me, legacy: entry?.contributions ?? "", limit: LIMITS.contribution, githubAction: setTeammateGithub }
            : null
        }
      />
    </div>
  );
}

function Deadline({ closesAt, isPast }: { closesAt: string; isPast: boolean }) {
  return isPast ? (
    <p className="rounded border border-accent bg-accent-soft px-3 py-2 text-sm" role="status">
      <strong>Submissions closed</strong> {formatPacific(closesAt)}. You can still save, but your project will be marked as submitted late. Who did what stays open too; sections saved now show as late.
    </p>
  ) : (
    <p className="rounded border border-line px-3 py-2 text-sm text-fg-muted">
      Submissions close <strong className="text-fg">{formatPacific(closesAt)}</strong>. Save as often as you like.
    </p>
  );
}

function LastSaved({ entry }: { entry: Entry | null }) {
  if (!entry?.last_saved_at) return <p className="text-sm text-fg-muted">Not saved yet.</p>;
  // Display names end in an initial ("Ada T."), so don't add a second period after one.
  const text = `Last saved ${formatPacific(entry.last_saved_at)}${entry.last_saved_by_name ? ` by ${entry.last_saved_by_name}` : ""}`;
  return <p className="text-sm text-fg-muted">{text.endsWith(".") ? text : `${text}.`}</p>;
}

function LateSaveStatus({ lateSave }: { lateSave: LateSave }) {
  const outcome = {
    pending: "An organizer will accept or reject it.",
    accepted: "It's marked as submitted late, and judges see that version.",
    rejected: "An organizer didn't accept it, so judges see the version saved before the deadline.",
  }[lateSave.decision];
  return (
    <p className="rounded border border-line px-3 py-2 text-sm">
      You saved changes after the deadline ({formatPacific(lateSave.saved_at)}). {outcome}
    </p>
  );
}

const statusIcon: Record<CheckItem["status"], { icon: string; label: string; className: string }> = {
  ok: { icon: "✓", label: "Done", className: "text-evergreen" },
  warn: { icon: "!", label: "Check", className: "text-clay" },
  fail: { icon: "✗", label: "Missing", className: "text-red-600" },
};

function ChecklistView({ checklist }: { checklist: Checklist }) {
  const open = checklist.items.filter((item) => item.required && item.status !== "ok").length;
  return (
    <section className="space-y-2 rounded-lg border border-line bg-bg-raised p-4 font-mono text-xs" aria-labelledby="checklist-heading">
      <h2 id="checklist-heading" className={open ? "text-accent" : "text-evergreen"}>
        ✻ {open ? `Before judging: ${open} required item${open === 1 ? "" : "s"} to fix` : "Ready for judges"}
      </h2>
      <ul className="grid gap-1 border-t border-dashed border-line pt-2 text-fg">
        {checklist.items.map((item) => {
          const s = statusIcon[item.status];
          return (
            <li key={item.key} className="flex gap-2">
              <span className={`w-4 shrink-0 font-semibold ${s.className}`} aria-label={s.label}>
                {s.icon}
              </span>
              <span>
                {item.label}
                {!item.required && <span className="text-fg-faint"> (recommended)</span>}
                {item.detail && <span className="block text-fg-muted">{item.detail}</span>}
              </span>
            </li>
          );
        })}
      </ul>
      <p className="border-t border-dashed border-line pt-2 text-fg-faint">checked {formatPacific(checklist.checkedAt)}, when the entry was last saved</p>
    </section>
  );
}
