import Link from "next/link";
import { redirect } from "next/navigation";
import { formatPacific } from "@/lib/time";
import { VIDEO_HOSTS_HINT } from "../_lib/video";
import { saveEntry } from "./actions";
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
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold">Submit your project</h1>
        <p className="rounded border border-line px-3 py-2 text-sm text-fg-muted">{ctx.reason}</p>
        <Link href="/teams" className="text-sm underline">
          Go to teams
        </Link>
      </div>
    );
  }

  const { team, entry, lateSave, closesAt, isPast } = ctx;
  const values: EntryValues = entry
    ? {
        title: entry.title,
        tagline: entry.tagline,
        description_short: entry.description_short,
        description_long: entry.description_long,
        video_url: entry.video_url,
        repo_url: entry.repo_url,
        links: entry.links,
      }
    : {
    title: team.name,
    tagline: "",
    description_short: team.concept ?? "",
    description_long: "",
    video_url: "",
    repo_url: "",
    links: [],
  };

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <h1 className="text-2xl font-semibold">Submit your project</h1>
        <p className="text-sm text-fg-muted">
          Entry for{" "}
          <Link href={`/teams/${team.id}`} className="font-semibold text-fg underline">
            {team.name}
          </Link>
          . Anyone on the team can edit it. Judges review it without talking to you, so give them everything they need.
        </p>
        <Deadline closesAt={closesAt} isPast={isPast} />
        <LastSaved entry={entry} />
        {lateSave && <LateSaveStatus lateSave={lateSave} />}
      </div>

      {entry?.checklist && <ChecklistView checklist={entry.checklist} />}

      {isPast ? (
        entry ? (
          <ReadOnlyEntry entry={entry} />
        ) : (
          <p className="text-fg-muted">Your team didn&apos;t submit an entry before the deadline. Find an organizer.</p>
        )
      ) : (
        <EntryForm action={saveEntry} values={values} limits={LIMITS} videoHint={VIDEO_HOSTS_HINT} />
      )}
    </div>
  );
}

function Deadline({ closesAt, isPast }: { closesAt: string; isPast: boolean }) {
  return isPast ? (
    <p className="rounded border border-accent bg-accent-soft px-3 py-2 text-sm" role="status">
      <strong>Submissions closed</strong> {formatPacific(closesAt)}. Your entry is read-only now.
    </p>
  ) : (
    <p className="rounded border border-line px-3 py-2 text-sm text-fg-muted">
      Submissions close <strong className="text-fg">{formatPacific(closesAt)}</strong>. Save as often as you like.
    </p>
  );
}

function LastSaved({ entry }: { entry: Entry | null }) {
  if (!entry?.last_saved_at) return <p className="text-sm text-fg-muted">Not saved yet.</p>;
  return (
    <p className="text-sm text-fg-muted">
      Last saved {formatPacific(entry.last_saved_at)}
      {entry.last_saved_by_name ? ` by ${entry.last_saved_by_name}` : ""}.
    </p>
  );
}

function LateSaveStatus({ lateSave }: { lateSave: LateSave }) {
  const outcome = {
    pending: "An organizer will accept or reject it.",
    accepted: "An organizer accepted it, so judges see that version.",
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
    <section className="space-y-2 rounded border border-line p-4" aria-labelledby="checklist-heading">
      <h2 id="checklist-heading" className="font-semibold">
        {open ? `Before judging: ${open} required item${open === 1 ? "" : "s"} to fix` : "Ready for judges"}
      </h2>
      <ul className="space-y-1 text-sm">
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
      <p className="text-xs text-fg-faint">Checked {formatPacific(checklist.checkedAt)}, when the entry was last saved.</p>
    </section>
  );
}

function ReadOnlyEntry({ entry }: { entry: Entry }) {
  const rows: [string, React.ReactNode][] = [
    ["Title", entry.title],
    ["Tagline", entry.tagline],
    ["Short description", entry.description_short],
    ["Long description", entry.description_long],
    ["Demo video", entry.video_url && <ExternalLink href={entry.video_url} />],
    ["GitHub repo", entry.repo_url && <ExternalLink href={entry.repo_url} />],
  ];
  return (
    <dl className="space-y-4">
      {rows.map(([label, value]) => (
        <div key={label}>
          <dt className="text-sm font-medium">{label}</dt>
          <dd className="whitespace-pre-wrap text-fg-muted">{value || "—"}</dd>
        </div>
      ))}
      {entry.links.length > 0 && (
        <div>
          <dt className="text-sm font-medium">Other links</dt>
          <dd>
            <ul className="space-y-1">
              {entry.links.map((link) => (
                <li key={link.url}>
                  <ExternalLink href={link.url} label={link.label} />
                </li>
              ))}
            </ul>
          </dd>
        </div>
      )}
    </dl>
  );
}

function ExternalLink({ href, label }: { href: string; label?: string }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer nofollow" className="break-all underline">
      {label ?? href}
    </a>
  );
}
