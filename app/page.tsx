import Link from "next/link";
import Image from "next/image";
import { audience, eventDate, eventCloseAt, eventName, eventOpenAt, ambassadors, hosts, judges, lumaCalendarUrl as defaultLumaUrl, openSourceNote, partners, prizes, rubric, sundaySchedule, saturdaySchedule, theme, venue as defaultVenue, type Entry } from "@/lib/event";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/supabase/profile";
import { Agenda } from "@/components/home/agenda";
import { ContextWindow } from "@/components/home/context-window";
import { SkylineBand } from "@/components/home/skyline-band";
import { Wifi } from "@/components/home/wifi";

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

function LinkedInIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden="true">
      <path d="M20.45 20.45h-3.56v-5.57c0-1.33-.02-3.04-1.85-3.04-1.85 0-2.14 1.45-2.14 2.94v5.67H9.35V9h3.41v1.56h.05c.48-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.46v6.28zM5.34 7.43a2.06 2.06 0 1 1 0-4.13 2.06 2.06 0 0 1 0 4.13zM7.12 20.45H3.56V9h3.56v11.45zM22.22 0H1.77C.79 0 0 .77 0 1.73v20.54C0 23.23.79 24 1.77 24h20.45c.98 0 1.78-.77 1.78-1.73V1.73C24 .77 23.2 0 22.22 0z" />
    </svg>
  );
}

function ExternalLinkIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
    </svg>
  );
}

// People get a round photo, their title lines, and a LinkedIn link; companies get their logo on a
// white tile (most logos are drawn for white), a one-sentence description, and a website link.
function Entries({ entries }: { entries: Entry[] }) {
  return (
    <ul className="grid gap-6 sm:grid-cols-2">
      {entries.map((entry) => {
        const company = "website" in entry;
        const link = company ? entry.website : entry.linkedin;
        return (
          <li key={entry.name} className="flex items-center gap-4">
            {company ? (
              <Image src={entry.logo} alt={`${entry.name} logo`} width={192} height={192} className="h-24 w-24 shrink-0 rounded-lg border border-line bg-white object-contain p-2" />
            ) : (
              <Image src={entry.photo} alt={entry.name} width={192} height={192} className="h-24 w-24 shrink-0 rounded-full border border-line object-cover" />
            )}
            <div className="grid gap-0.5">
              <span className="flex items-center gap-2 font-display text-xl font-light leading-snug">
                {entry.name}
                {link && (
                  <a href={link} target="_blank" rel="noopener noreferrer" aria-label={company ? `${entry.name} website` : `${entry.name} on LinkedIn`} className="text-fg-muted hover:text-accent">
                    {company ? <ExternalLinkIcon /> : <LinkedInIcon />}
                  </a>
                )}
              </span>
              {(company ? [entry.description] : entry.lines).map((line) => (
                <span key={line} className="text-sm text-fg-muted">
                  {line}
                </span>
              ))}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export default async function Home() {
  const supabase = await createClient();
  const [{ data: settings }, profile] = await Promise.all([
    supabase
      .from("event_settings")
      .select(
        "team_formation_closes_at, submissions_close_at, event_starts_at, event_ends_at, venue_name, venue_address, venue_neighborhood, venue_lat, venue_lon, luma_calendar_url",
      )
      .eq("id", 1)
      .single(),
    getCurrentProfile(),
  ]);

  // Deadlines come from event_settings; the schedule in lib/event.ts is the fallback.
  const teamFormationClosesAt = settings?.team_formation_closes_at ?? "2026-10-25T10:30:00-07:00";
  const submissionsCloseAt = settings?.submissions_close_at ?? "2026-10-25T17:30:00-07:00";
  // Venue, Luma link, and event bounds too, per column, so a NULL keeps the lib/event.ts value.
  const openAt = settings?.event_starts_at ?? eventOpenAt;
  const closeAt = settings?.event_ends_at ?? eventCloseAt;
  const lumaCalendarUrl = settings?.luma_calendar_url ?? defaultLumaUrl;
  const venue = {
    name: settings?.venue_name ?? defaultVenue.name,
    address: settings?.venue_address ?? defaultVenue.address,
    neighborhood: settings?.venue_neighborhood ?? defaultVenue.neighborhood,
    lat: settings?.venue_lat ?? defaultVenue.lat,
    lon: settings?.venue_lon ?? defaultVenue.lon,
  };
  const slots = [...saturdaySchedule, ...sundaySchedule]
    .filter((item): item is typeof item & { start: string; end: string } => Boolean(item.start && item.end))
    .map((item) => ({ what: item.what, start: item.start, end: item.end }));
  const finals = sundaySchedule.find((item) => item.what.startsWith("Finals"));
  const moments = [
    { label: "Hackathon starts", at: sundaySchedule[0].start! },
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
              <>
                <Link href="/teams" className="btn">
                  Browse teams
                </Link>
                <a href={lumaCalendarUrl} target="_blank" rel="noopener noreferrer" className="btn btn-ghost">
                  Upcoming events
                </a>
              </>
            ) : (
              <>
                <Link href="/login" className="btn">
                  Log in with a magic link
                </Link>
                <Link href="/teams" className="btn btn-ghost">
                  Browse teams
                </Link>
                <a href={lumaCalendarUrl} target="_blank" rel="noopener noreferrer" className="btn btn-ghost">
                  Upcoming events
                </a>
              </>
            )}
          </div>
        </div>
        <div className="grid min-w-0 gap-3">
          <ContextWindow openAt={openAt} closeAt={closeAt} moments={moments} slots={slots} />
          <Wifi />
        </div>
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
          <p className="font-mono text-xs text-fg-faint">{openSourceNote}</p>
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

        {[
          { id: "hosts", call: "Agent(hosts)", title: "Hosts", entries: hosts },
          { id: "partners", call: "WebFetch(partners)", title: "Partners", entries: partners },
          { id: "judges", call: "Agent(judges)", title: "Judges", entries: judges },
          { id: "ambassadors", call: "Agent(ambassadors)", title: "Ambassadors", entries: ambassadors },
        ]
          .filter((group) => group.entries.length > 0)
          .map((group) => (
            <section key={group.id} className="grid gap-6 border-b border-line py-12" id={group.id}>
              <Sig call={group.call} title={group.title} />
              <Entries entries={group.entries} />
            </section>
          ))}

        <section className="grid gap-6 py-12" id="venue">
          <Sig call="Bash(open maps)" title="Venue" />
          <p className="font-display text-2xl font-light leading-snug">
            {venue.name}
            <br />
            {venue.address}
          </p>
          <p className="font-mono text-xs text-fg-muted">
            {venue.neighborhood} · {Math.abs(venue.lat).toFixed(4)}° {venue.lat < 0 ? "S" : "N"}, {Math.abs(venue.lon).toFixed(4)}°{" "}
            {venue.lon < 0 ? "W" : "E"}
            {venue.address === defaultVenue.address && " · a 12-minute walk from the Space Needle"}
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
