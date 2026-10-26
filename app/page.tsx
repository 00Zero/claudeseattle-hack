import Link from "next/link";
import Image from "next/image";
import { audience, eventDate, eventCloseAt, eventName, eventOpenAt, ambassadors, hosts, judges, lumaCalendarUrl as defaultLumaUrl, openSourceNote, partners, prizes, sponsors, rubric, sundaySchedule, saturdaySchedule, theme, venue as defaultVenue, type Entry } from "@/lib/event";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/supabase/profile";
import { getEnabledCriteria } from "@/app/(judge)/_lib/criteria";
import { countWord } from "@/app/(judge)/_lib/scoring";
import { Agenda } from "@/components/home/agenda";
import { ContextWindow } from "@/components/home/context-window";
import { SkylineBand } from "@/components/home/skyline-band";
import { Wifi } from "@/components/home/wifi";
import { WinnersCard, type Winner } from "@/components/home/winners-card";

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
            ) : entry.photo ? (
              <Image src={entry.photo} alt={entry.name} width={192} height={192} className="h-24 w-24 shrink-0 rounded-full border border-line object-cover" />
            ) : (
              <span aria-hidden="true" className="grid h-24 w-24 shrink-0 place-items-center rounded-full border border-line bg-accent-soft font-display text-3xl font-light">
                {entry.name
                  .split(" ")
                  .map((part) => part[0])
                  .slice(0, 2)
                  .join("")}
              </span>
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

// One section per non-empty list.
function Groups({ groups }: { groups: { id: string; call: string; title: string; entries: Entry[] }[] }) {
  return groups
    .filter((group) => group.entries.length > 0)
    .map((group) => (
      <section key={group.id} className="grid gap-6 border-b border-line py-12" id={group.id}>
        <Sig call={group.call} title={group.title} />
        <Entries entries={group.entries} />
      </section>
    ));
}

const PLACES = ["1st place", "2nd place", "3rd place"];

// The top three from the published results, then the audience choice once voting has closed.
// audience_vote_results is service-role only; only the winning title leaves the server.
async function getWinners(withAudience: boolean): Promise<Winner[]> {
  const [{ data: placed }, { data: audienceTop }] = await Promise.all([
    (await createClient()).from("public_judge_results").select("entry_id, title, team_name, place").gte("place", 1).lte("place", 3).order("place"),
    withAudience
      ? createAdminClient().from("audience_vote_results").select("entry_id, title, team_name").eq("place", 1).eq("is_test", false).gt("points", 0)
      : Promise.resolve({ data: [] as { entry_id: string; title: string | null; team_name: string }[] }),
  ]);
  return [
    ...(placed ?? []).map((r) => ({ prize: PLACES[r.place - 1], entryId: r.entry_id, title: r.title || r.team_name })),
    ...(audienceTop ?? []).map((r) => ({ prize: "Audience choice", entryId: r.entry_id, title: r.title || r.team_name })),
  ];
}

export default async function Home() {
  const supabase = await createClient();
  const [{ data: settings }, profile, { criteria }] = await Promise.all([
    supabase
      .from("event_settings")
      .select(
        "team_formation_closes_at, submissions_close_at, event_starts_at, event_ends_at, venue_name, venue_address, venue_neighborhood, venue_lat, venue_lon, luma_calendar_url, wifi_network, wifi_password, audience_voting_enabled, audience_voting, publish_winners",
      )
      .eq("id", 1)
      .single(),
    getCurrentProfile(),
    // The criteria admins enabled for judging (event_settings.judging_criteria).
    getEnabledCriteria(supabase),
  ]);

  // Deadlines come from event_settings; the schedule in lib/event.ts is the fallback.
  const teamFormationClosesAt = settings?.team_formation_closes_at ?? "2026-10-25T10:30:00-07:00";
  const submissionsCloseAt = settings?.submissions_close_at ?? "2026-10-25T17:30:00-07:00";
  // Venue, Luma link, and event bounds too, per column, so a NULL keeps the lib/event.ts value.
  const openAt = settings?.event_starts_at ?? eventOpenAt;
  const closeAt = settings?.event_ends_at ?? eventCloseAt;
  const lumaCalendarUrl = settings?.luma_calendar_url ?? defaultLumaUrl;
  // Only whether Wi-Fi is set reaches the page; the values themselves load when someone clicks to reveal them.
  const hasWifi = Boolean(settings?.wifi_network && settings?.wifi_password);
  const venue = {
    name: settings?.venue_name ?? defaultVenue.name,
    address: settings?.venue_address ?? defaultVenue.address,
    neighborhood: settings?.venue_neighborhood ?? defaultVenue.neighborhood,
    lat: settings?.venue_lat ?? defaultVenue.lat,
    lon: settings?.venue_lon ?? defaultVenue.lon,
  };
  const slots = [...saturdaySchedule, ...sundaySchedule]
    .filter((item): item is typeof item & { start: string; end: string } => Boolean(item.start && item.end))
    .map((item) => ({ what: item.what, short: item.short ?? item.what, start: item.start, end: item.end }));
  const winners = settings?.publish_winners ? await getWinners(settings.audience_voting_enabled && settings.audience_voting === "closed") : [];
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
                {/* Switched on in Settings, opened there or from the awards deck; /vote checks who may vote. */}
                {settings?.audience_voting_enabled && settings.audience_voting === "open" && (
                  <Link href="/vote" className="btn">
                    Vote for the audience choice
                  </Link>
                )}
                <Link href="/teams" className="btn">
                  Browse teams
                </Link>
                <Link href="/resources" className="btn btn-ghost">
                  Credits &amp; resources
                </Link>
                <a href={lumaCalendarUrl} target="_blank" rel="noopener noreferrer" className="btn btn-ghost">
                  Upcoming events
                </a>
                <Link href="/resources#upload-media" className="btn">
                  Upload media
                </Link>
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
          {hasWifi && <Wifi openAt={openAt} closeAt={closeAt} />}
          {/* Everyone sees it; signed out goes through sign-in first (/login?next=), and /resources checks approval. */}
          <section aria-label="Share your photos and videos" className="snake-border grid gap-3 rounded-lg p-4 font-mono text-xs text-fg-muted">
            <span className="text-sm text-fg">Share your photos and videos from the event</span>
            <Link href={profile ? "/resources#upload-media" : "/login?next=/resources%23upload-media"} className="btn pulse-ring justify-self-start font-sans">
              Upload media
            </Link>
          </section>
          {winners.length > 0 && <WinnersCard winners={winners} />}
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
              { k: "Who's in the room", v: "Owners/founders, professionals, students/grads, builders", p: "A balanced team has at least one of each and someone hands-on with code." },
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
            {prizes.topThree.map((prize) => (
              <div key={prize} className="grid items-baseline gap-4 border-t border-line py-4 last:border-b sm:grid-cols-[1fr_auto]">
                <span className="font-display text-2xl font-light leading-snug">{prize}</span>
                <span className="eyebrow sm:text-right">Top 3 teams</span>
              </div>
            ))}
            <p className="text-sm text-fg-muted">{prizes.winnersValue}</p>
          </div>
        </section>

        <section className="grid gap-6 border-b border-line py-12" id="judging">
          <Sig call="Review(entry, rubric)" title="Judging criteria" />
          <p className="max-w-[60ch] text-fg-muted">
            {countWord(criteria.length).replace(/^./, (c) => c.toUpperCase())} criteri{criteria.length === 1 ? "on" : "a"}, equal weight, each scored 1 to 8 with no middle. An entry&apos;s score is the mean across criteria, to one decimal. Five judges each score about four entries over dinner and send one to the final; all five score the finalists on stage.
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
                {criteria.map((criterion) => (
                  <tr key={criterion.key} className="border-b border-line">
                    <td className="py-3 pr-3 font-medium">
                      {criterion.name}
                      {criterion.note && <span className="block text-xs font-normal text-fg-muted">{criterion.note}</span>}
                    </td>
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

        <Groups
          groups={[
            { id: "hosts", call: "Agent(hosts)", title: "Hosts", entries: hosts },
            { id: "judges", call: "Agent(judges)", title: "Judges", entries: judges },
            { id: "sponsors", call: "Grant(credits)", title: "Credit sponsors", entries: sponsors },
            { id: "partners", call: "WebFetch(partners)", title: "Partners", entries: partners },
            { id: "ambassadors", call: "Agent(ambassadors)", title: "Ambassadors", entries: ambassadors },
          ]}
        />

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
          </p>
        </section>
      </div>

      <div className="full-bleed flannel" aria-hidden="true" />
      <footer className="mx-auto flex max-w-3xl flex-wrap justify-between gap-4 pt-6 font-mono text-xs text-fg-faint">
        <span>
          <a href={lumaCalendarUrl} target="_blank" rel="noopener noreferrer" className="underline-offset-2 hover:text-accent hover:underline">
            Seattle Claude Community
          </a>{" "}
          · hack.claudeseattle.org ·{" "}
          <a href="mailto:support@claudeseattle.org" className="underline-offset-2 hover:text-accent hover:underline">
            support@claudeseattle.org
          </a>
        </span>
        <span>Co-authored by Clawd</span>
      </footer>
    </div>
  );
}
