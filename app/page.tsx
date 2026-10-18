import Link from "next/link";
import { audience, eventDate, eventName, eventOpenAt, openSourceNote, prizes, rubric, saturdaySchedule, sundaySchedule, theme, venue } from "@/lib/event";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/supabase/profile";
import { Agenda } from "@/components/home/agenda";
import { ContextWindow } from "@/components/home/context-window";
import { SkylineBand } from "@/components/home/skyline-band";

// Section header styled as a Claude Code tool call.
function Sig({ call, title }: { call: string; title: string }) {
  return (
    <div>
      <p className="font-mono text-xs text-fg-faint">
        <span className="text-accent">⏺</span> {call}
      </p>
      <h2 className="mt-2 font-display text-4xl font-light leading-[1.05]">{title}</h2>
    </div>
  );
}

export default async function Home() {
  const supabase = await createClient();
  const [{ data: settings }, profile] = await Promise.all([
    supabase.from("event_settings").select("team_formation_closes_at, submissions_close_at").eq("id", 1).single(),
    getCurrentProfile(),
  ]);

  // Deadlines come from event_settings; the schedule in lib/event.ts is the fallback.
  const teamFormationClosesAt = settings?.team_formation_closes_at ?? "2026-10-25T10:30:00-07:00";
  const submissionsCloseAt = settings?.submissions_close_at ?? "2026-10-25T17:30:00-07:00";
  const slots = [...saturdaySchedule, ...sundaySchedule]
    .filter((item): item is typeof item & { start: string; end: string } => Boolean(item.start && item.end))
    .map((item) => ({ what: item.what, start: item.start, end: item.end }));
  const finals = sundaySchedule.find((item) => item.what.startsWith("Finals"));
  const moments = [
    { label: "Team formation happy hour", at: saturdaySchedule[0].start! },
    { label: "Team formation closes", at: teamFormationClosesAt },
    { label: "Submissions close", at: submissionsCloseAt },
    ...(finals?.start ? [{ label: "Finals on stage", at: finals.start }] : []),
  ];

  return (
    <div>
      {/* Hero */}
      <section className="grid items-start gap-8 pb-8 pt-4 md:grid-cols-[1.15fr_0.85fr]">
        <div>
          <p className="eyebrow text-accent">
            Claude Community Seattle · {eventDate}
          </p>
          <h1 className="mt-3 font-display text-[clamp(2.8rem,6.4vw,5rem)] font-light leading-[0.98] tracking-[-0.01em]">
            {eventName.replace("Claude ", "").replace(" Hackathon", "")} <em className="italic text-fg-muted">Hackathon</em>
          </h1>
          <p className="mt-6 max-w-[30ch] font-display text-2xl font-light leading-snug">{theme}</p>
          <p className="mt-4 max-w-[52ch] text-fg-muted">
            One day at {venue.name}. {audience}
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            {profile ? (
              <Link href="/teams" className="btn">
                Browse teams
              </Link>
            ) : (
              <>
                <Link href="/login" className="btn">
                  Log in with a magic link
                </Link>
                <Link href="/teams" className="btn btn-ghost">
                  Browse teams
                </Link>
              </>
            )}
          </div>
          <p className="mt-4 font-mono text-xs text-fg-faint">{openSourceNote}</p>
        </div>
        <ContextWindow openAt={eventOpenAt} closeAt={submissionsCloseAt} moments={moments} slots={slots} />
      </section>

      <SkylineBand venueName={venue.name} />

      <div className="mx-auto max-w-3xl">
        <section className="grid gap-6 border-b border-line py-12">
          <Sig call="Read(theme.md)" title="What you'll build" />
          <p className="max-w-[60ch] text-fg-muted">
            The theme is practical: AI tools, workflows, and playbooks a small business can adopt without hiring a developer. Judges ask whether it works, whether an owner could set it up from the README, whether it changes how the business runs, and whether it is something they had not seen before.
          </p>
          <div className="grid gap-4 sm:grid-cols-3">
            {[
              { k: "Who's in the room", v: "Owners, professionals, students, builders", p: "A balanced team has at least one of each and someone hands-on with code." },
              { k: "What ships", v: "A working tool with a README", p: "Plus a repo and a demo video. Slides are optional; the demo is the point." },
              { k: "Where it goes", v: "Open source, on GitHub", p: "Every entry is public after the deadline, so a business can find it later." },
            ].map((cell) => (
              <div key={cell.k} className="grid content-start gap-1 border-t-2 border-fg pt-3">
                <span className="eyebrow">{cell.k}</span>
                <span className="font-display text-xl font-light leading-snug">{cell.v}</span>
                <p className="text-sm text-fg-muted">{cell.p}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="grid gap-6 border-b border-line py-12" id="agenda">
          <Sig call="Read(schedule.md)" title="Agenda" />
          <Agenda
            days={[
              { title: "Saturday, October 24", items: saturdaySchedule },
              { title: "Sunday, October 25", items: sundaySchedule },
            ]}
          />
        </section>

        <section className="grid gap-6 border-b border-line py-12" id="prizes">
          <Sig call="Grant(credits, max)" title="Prizes" />
          <div className="grid gap-3">
            <div className="grid items-baseline gap-4 rounded-lg bg-accent-soft px-4 py-5 sm:grid-cols-[1fr_auto]">
              <span className="font-display text-4xl font-light leading-tight">{prizes.everyone.replace("Every participant gets ", "").replace(".", "")}</span>
              <span className="eyebrow text-fg sm:text-right">Every participant</span>
            </div>
            {prizes.winners.map((prize) => (
              <div key={prize} className="grid items-baseline gap-4 border-t border-line py-4 last:border-b sm:grid-cols-[1fr_auto]">
                <span className="font-display text-2xl font-light leading-snug">{prize}</span>
                <span className="eyebrow sm:text-right">Winning team</span>
              </div>
            ))}
          </div>
        </section>

        <section className="grid gap-6 border-b border-line py-12" id="judging">
          <Sig call="Review(entry, rubric)" title="Judging criteria" />
          <p className="max-w-[60ch] text-fg-muted">
            Four criteria, equal weight, each scored 1 to 8 with no middle. An entry&apos;s score is the mean of the four, to one decimal. Five judges each score about four entries over dinner and send one to the final; all five score the finalists on stage.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px] text-left text-sm">
              <thead>
                <tr className="border-b border-fg">
                  <th className="eyebrow pb-3 pr-3 font-semibold">Criterion</th>
                  {rubric.bands.map((band) => (
                    <th key={band} className="eyebrow pb-3 pr-3 font-mono font-semibold">
                      {band}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="align-top">
                {rubric.criteria.map((criterion) => (
                  <tr key={criterion.name} className="border-b border-line">
                    <td className="py-3 pr-3 font-medium">{criterion.name}</td>
                    {criterion.anchors.map((anchor, i) => (
                      <td key={anchor} className={`py-3 pr-3 ${i === criterion.anchors.length - 1 ? "text-fg" : "text-fg-muted"}`}>
                        {anchor}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="grid gap-6 py-12" id="venue">
          <Sig call="Bash(open maps)" title="Venue" />
          <p className="font-display text-2xl font-light leading-snug">
            {venue.name}
            <br />
            {venue.address}
          </p>
          <p className="font-mono text-xs text-fg-muted">
            {venue.neighborhood} · {venue.lat.toFixed(4)}° N, {Math.abs(venue.lon).toFixed(4)}° W · a 12-minute walk from the Space Needle
          </p>
        </section>
      </div>

      <div className="full-bleed flannel" aria-hidden="true" />
      <footer className="mx-auto flex max-w-3xl flex-wrap justify-between gap-4 pt-6 font-mono text-xs text-fg-faint">
        <span>Claude Community Seattle · hack.claudeseattle.org</span>
        <span>Co-Authored-By: Clawd</span>
      </footer>
    </div>
  );
}
