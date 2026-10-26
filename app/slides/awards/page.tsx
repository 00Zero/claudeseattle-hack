import type { Metadata } from "next";
import Link from "next/link";
import QRCode from "qrcode";
import { countWord } from "@/app/(judge)/_lib/scoring";
import { SkylineBand } from "@/components/home/skyline-band";
import { ThinkingDots } from "@/components/site/thinking-dots";
import { requireSuperAdminPage } from "@/lib/admin";
import { eventName, prizes, venue } from "@/lib/event";
import { getOrigin } from "@/lib/site-url";
import { createAdminClient } from "@/lib/supabase/admin";
import { Deck, type Slide } from "../deck";
import { Eyebrow, Sig } from "../parts";
import styles from "../slides.module.css";
import { AutoRefresh } from "./auto-refresh";
import { DemoTimer } from "./demo-timer";
import { PublishButton } from "./publish-button";
import { VotingButton } from "./voting-button";

// No title of its own: anyone else gets a 404, and the tab shouldn't hint at what is here.
export const metadata: Metadata = { robots: { index: false } };

// The awards deck, super admins only (the trophy in the header opens it in full screen).
// Part 1 reveals the finalists one click at a time and ends with "Publish finalists"; then a
// timer slide per finalist demo. Part 2 waits for every judge's final scores, reveals 3rd, 2nd,
// and 1st, and ends with "Publish winners". It reads judge_entry_results (service role, after the
// super-admin check), so the reveal can happen before anything is public. Never shows scores.
// ?test=1 rehearses with the test world's entries and judges; publishing is off there.
// ?force=1 reveals places before every judge has scored every finalist.
// After the demos, "Audience vote" shows a QR code to /vote and opens voting; after the prizes,
// "Audience choice" closes it and reveals the most points (audience_vote_results). Both slides
// appear only while audience voting is turned on in /admin/settings. Opening and closing voting
// is off in rehearsal, since it is one switch for everyone.

type AudienceResult = { entry_id: string; points: number; ballots: number; place: number };
type Finalist = { entryId: string; team: string; title: string; tagline: string | null; members: string[]; votes: number; place: number | null };

const ordinal = (n: number) => `${n}${n === 1 ? "st" : n === 2 ? "nd" : n === 3 ? "rd" : "th"}`;
const placeLabel = (place: number, tied: boolean) => (place === 1 ? (tied ? "Tied winners" : "The winner") : `${tied ? "Tied for " : ""}${ordinal(place)} place`);

async function loadFinalists(test: boolean) {
  const admin = createAdminClient();
  const [results, judges, settings, audience, ballots] = await Promise.all([
    admin.from("judge_entry_results").select("entry_id, team_id, team_name, title, final_votes, place").eq("is_test", test).eq("is_finalist", true),
    admin.from("profiles").select("id", { count: "exact", head: true }).eq("platform_role", "judge").eq("is_test", test),
    admin.from("event_settings").select("publish_finalists, publish_winners, audience_voting_enabled, audience_voting").eq("id", 1).single(),
    admin.from("audience_vote_results").select("entry_id, points, ballots, place").eq("is_test", test),
    admin.from("audience_votes").select("voter_id", { count: "exact", head: true }).eq("is_test", test),
  ]);
  if (results.error) throw new Error(`Couldn't read results: ${results.error.message}`);
  const rows = results.data as { entry_id: string; team_id: string | null; team_name: string; title: string; final_votes: number; place: number | null }[];
  const entryIds = rows.map((r) => r.entry_id);
  const teamIds = rows.map((r) => r.team_id).filter((id): id is string => Boolean(id));
  const [entries, members] = await Promise.all([
    entryIds.length ? admin.from("judge_entries").select("id, tagline").in("id", entryIds) : Promise.resolve({ data: [] }),
    teamIds.length ? admin.from("team_members").select("team_id, profiles!inner(first_name)").eq("status", "member").in("team_id", teamIds) : Promise.resolve({ data: [] }),
  ]);
  const taglines = new Map(((entries.data ?? []) as { id: string; tagline: string | null }[]).map((e) => [e.id, e.tagline]));
  const names = new Map<string, string[]>();
  for (const m of (members.data ?? []) as unknown as { team_id: string; profiles: { first_name: string | null } }[]) {
    if (m.profiles.first_name) names.set(m.team_id, [...(names.get(m.team_id) ?? []), m.profiles.first_name]);
  }
  const finalists: Finalist[] = rows
    .map((r) => ({
      entryId: r.entry_id,
      team: r.team_name,
      title: r.title,
      tagline: taglines.get(r.entry_id) ?? null,
      members: (r.team_id ? names.get(r.team_id) : null) ?? [],
      votes: Number(r.final_votes) || 0,
      place: r.place,
    }))
    .sort((a, b) => a.team.localeCompare(b.team));
  return { finalists, judgeCount: judges.count ?? 0, settings: settings.data, audience: (audience.data ?? []) as AudienceResult[], ballotCount: ballots.count ?? 0 };
}

// compact: the fixed-height card for the reveal grid, so five fit on one screen; long names and
// taglines are cut with an ellipsis. big: one team at a time on the place slides.
function FinalistCard({ finalist, big = false, compact = false, fresh = false }: { finalist: Finalist; big?: boolean; compact?: boolean; fresh?: boolean }) {
  const showTitle = finalist.title && finalist.title !== finalist.team;
  if (compact) {
    return (
      <div className={`${fresh ? styles.enter : ""} flex h-full flex-col gap-2 overflow-hidden rounded-2xl border border-line bg-bg-raised px-6 py-5`}>
        <span className="line-clamp-2 font-display text-[32px] font-light leading-[1.12]">{finalist.team}</span>
        {showTitle && <span className="line-clamp-1 text-[20px] font-semibold leading-snug">{finalist.title}</span>}
        {finalist.tagline && <span className="line-clamp-2 text-[18px] leading-snug text-fg-muted">{finalist.tagline}</span>}
        {finalist.members.length > 0 && <span className="mt-auto line-clamp-1 font-mono text-[15px] text-fg-faint">{finalist.members.join(" · ")}</span>}
      </div>
    );
  }
  return (
    <div className={`${fresh ? styles.enter : ""} flex flex-col gap-3 rounded-2xl border border-line bg-bg-raised p-7`}>
      <span className={`font-display font-light leading-tight ${big ? "text-[64px]" : "text-[40px]"}`}>{finalist.team}</span>
      {showTitle && <span className={`font-semibold leading-snug ${big ? "text-[32px]" : "text-[23px]"}`}>{finalist.title}</span>}
      {finalist.tagline && <span className={`leading-snug text-fg-muted ${big ? "text-[26px]" : "text-[20px]"}`}>{finalist.tagline}</span>}
      {finalist.members.length > 0 && <span className={`font-mono text-fg-faint ${big ? "text-[22px]" : "text-[17px]"}`}>{finalist.members.join(" · ")}</span>}
    </div>
  );
}

export default async function AwardsPage({ searchParams }: PageProps<"/slides/awards">) {
  await requireSuperAdminPage();
  const params = await searchParams;
  const test = params.test === "1";
  const force = params.force === "1";
  const { finalists, judgeCount, settings, audience, ballotCount } = await loadFinalists(test);
  const audienceOn = settings?.audience_voting_enabled === true;
  const voting = (settings?.audience_voting ?? null) as "open" | "closed" | null;
  const voteUrl = `${await getOrigin()}/vote`;
  // SVG markup generated by the qrcode library from our own URL, not from user input.
  const voteQr = await QRCode.toString(voteUrl, { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark: "#141413", light: "#ffffff" } });
  const voteHost = voteUrl.replace(/^https?:\/\//, "");
  const voteTestNote = test ? "Rehearsal: voting is one switch for everyone, so it's off here." : undefined;
  const ballotsLabel = `${ballotCount} ${ballotCount === 1 ? "vote" : "votes"} in`;
  const audienceWinners = audience
    .filter((a) => a.place === 1 && a.points > 0)
    .map((a) => ({ ...a, finalist: finalists.find((f) => f.entryId === a.entry_id) }))
    .filter((a): a is typeof a & { finalist: Finalist } => Boolean(a.finalist));
  const n = finalists.length;

  const expected = n * judgeCount;
  const scored = finalists.reduce((sum, f) => sum + Math.min(f.votes, judgeCount), 0);
  const allScored = n > 0 && judgeCount > 0 && scored >= expected;
  const ready = n > 0 && (allScored || force);
  // Places 1 to 3, revealed from 3rd up; teams with the same place are revealed together.
  const podium = [3, 2, 1]
    .map((place) => ({ place, teams: finalists.filter((f) => f.place === place) }))
    .filter((group) => group.teams.length > 0);
  const testNote = test ? "Rehearsal with test data: publishing is off." : undefined;
  const forceHref = `/slides/awards?${test ? "test=1&" : ""}force=1`;

  const revealSteps: Slide[] =
    n === 0
      ? [
          {
            title: "Finalists",
            tone: "light",
            content: (
              <div className="flex h-full flex-col justify-center gap-6">
                <AutoRefresh />
                <Sig call="Read(finalists.md)" title="Finalists aren't in yet" />
                <p className="text-[28px] text-fg-muted">Judges are still scoring prelims. This slide updates by itself.</p>
              </div>
            ),
          },
        ]
      : finalists.map((_, step) => ({
          title: `Finalist ${step + 1} of ${n}`,
          tone: "light" as const,
          still: true,
          content: (
            <div className="flex h-full flex-col gap-8">
              <div className="flex items-end justify-between gap-10">
                <Sig call="Read(finalists.md)" title={n === 1 ? "Your finalist" : `Your ${countWord(n)} finalists`} />
                {step === n - 1 && <PublishButton field="publish_finalists" published={Boolean(settings?.publish_finalists)} disabledReason={testNote} label="Publish finalists to the website" />}
              </div>
              <div className="flex flex-wrap content-start justify-center gap-6">
                {finalists.map((f, i) => (
                  <div key={i <= step ? f.entryId : `hidden-${i}`} className="h-[250px] w-[440px]">
                    {i <= step ? (
                      <FinalistCard finalist={f} compact fresh={i === step} />
                    ) : (
                      <div className="flex h-full items-center justify-center rounded-2xl border-2 border-dashed border-line font-display text-[80px] font-light text-fg-faint">?</div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ),
        }));

  const demoSlides: Slide[] = finalists.map((f, i) => ({
    title: `Demo ${i + 1} of ${n}`,
    tone: "light",
    content: (
      <div className="grid h-full grid-cols-[1fr_560px] items-center gap-14">
        <div className="flex flex-col gap-6">
          <Eyebrow className="text-[22px] text-accent">
            Finalist {i + 1} of {n} · up next
          </Eyebrow>
          <h2 className={`line-clamp-3 font-display font-light leading-[0.95] ${f.team.length > 28 ? "text-[76px]" : "text-[110px]"}`}>{f.team}</h2>
          {f.title && f.title !== f.team && <p className="text-[38px] font-semibold leading-snug">{f.title}</p>}
          {f.tagline && <p className="text-[28px] leading-snug text-fg-muted">{f.tagline}</p>}
          {f.members.length > 0 && <p className="font-mono text-[24px] text-fg-faint">{f.members.join(" · ")}</p>}
        </div>
        <DemoTimer />
      </div>
    ),
  }));

  const winnerSlides: Slide[] = ready
    ? podium.map((group) => ({
        title: placeLabel(group.place, group.teams.length > 1),
        tone: group.place === 1 ? "dark" : "light",
        content: (
          <div className="flex h-full flex-col items-center justify-center gap-10 text-center">
            <p className={`font-display font-light italic leading-none ${group.place === 1 ? "text-[150px] text-accent" : "text-[110px]"}`}>{placeLabel(group.place, group.teams.length > 1)}</p>
            <div className={`${styles.stagger} flex flex-wrap justify-center gap-6 text-left`}>
              {group.teams.map((f) => (
                <div key={f.entryId} className="w-[620px]">
                  <FinalistCard finalist={f} big />
                </div>
              ))}
            </div>
          </div>
        ),
      }))
    : [
        {
          title: "Waiting on scores",
          tone: "light",
          content: (
            <div className="flex h-full flex-col items-center justify-center gap-6 text-center">
              <AutoRefresh />
              <p className="font-display text-[80px] font-light">Waiting on judges&apos; scores</p>
              <p className="text-[28px] text-fg-muted">This slide updates by itself once every judge has scored every finalist.</p>
            </div>
          ),
        },
      ];

  const slides: Slide[] = [
    {
      title: "Finals",
      tone: "dark",
      content: (
        <div className="flex h-full flex-col justify-between">
          <div className="flex items-center gap-10">
            <span className="inline-block origin-left scale-[2.6]">
              <ThinkingDots />
            </span>
            <Eyebrow className="text-[22px] text-accent">{eventName} · Finals</Eyebrow>
          </div>
          <h1 className="font-display text-[150px] font-light leading-[0.95]">
            And the finalists <em className="italic text-fg-muted">are&hellip;</em>
          </h1>
          <p className="font-mono text-[24px] text-fg-muted">{test ? "Rehearsal · test data" : "One finalist from each judge's group"}</p>
        </div>
      ),
    },
    ...revealSteps,
    {
      title: "How finals work",
      tone: "dark",
      content: (
        <div className="flex h-full flex-col gap-10">
          <Sig call="Review(finalists, rubric)" title="How finals work" />
          <div className={`${styles.stagger} grid grid-cols-3 gap-6`}>
            {[
              { k: "5 minutes", p: "A live demo. Slides are optional; the demo is the point." },
              { k: "2 minutes", p: "Questions from the judges." },
              { k: "Every judge", p: "Scores every finalist on the same criteria. The mean decides." },
            ].map((cell) => (
              <div key={cell.k} className="rounded-2xl border border-line p-8">
                <p className="font-display text-[56px] font-light text-accent">{cell.k}</p>
                <p className="mt-3 text-[25px] leading-snug text-fg-muted">{cell.p}</p>
              </div>
            ))}
          </div>
          {n > 0 && <p className="font-mono text-[22px] text-fg-faint">Order: {finalists.map((f) => f.team).join(" → ")}</p>}
        </div>
      ),
    },
    ...demoSlides,
    ...(audienceOn ? ([{
      title: "Audience vote",
      tone: "light",
      content: (
        <div className="grid h-full grid-cols-[1fr_520px] items-center gap-14">
          {voting === "open" && <AutoRefresh every={4_000} />}
          <div className="flex flex-col gap-10">
            <Sig call="AskUserQuestion(audience)" title="Your turn: pick your top three" />
            <ol className={`${styles.stagger} grid gap-5`}>
              {[
                { k: "1", p: `Scan the code, or go to ${voteHost}` },
                { k: "2", p: "Tap your favorite finalist, then your second and third" },
                { k: "3", p: "1st gets 3 points, 2nd gets 2, 3rd gets 1. Checked-in guests only." },
              ].map((step) => (
                <li key={step.k} className="flex items-baseline gap-6">
                  <span className="font-display text-[56px] font-light leading-none text-accent">{step.k}</span>
                  <span className="text-[30px] leading-snug">{step.p}</span>
                </li>
              ))}
            </ol>
            <div className="flex flex-wrap items-center gap-8">
              {voting === "open" ? (
                <>
                  <p className="font-mono text-[30px] text-fg-muted">
                    <span className="text-accent">●</span> Voting is open · {ballotsLabel}
                  </p>
                  <VotingButton to="closed" label="Close voting" disabledReason={voteTestNote} />
                </>
              ) : (
                <VotingButton
                  to="open"
                  label={voting === "closed" ? "Reopen voting" : "Open voting"}
                  disabledReason={voteTestNote ?? (n === 0 ? "Available once there are finalists." : undefined)}
                />
              )}
              {voting === "closed" && <p className="font-mono text-[24px] text-fg-faint">Closed · {ballotsLabel}</p>}
            </div>
          </div>
          <div className="flex flex-col items-center gap-4">
            <div className="w-full rounded-2xl bg-white p-5" role="img" aria-label="QR code for the voting page" dangerouslySetInnerHTML={{ __html: voteQr }} />
            <p className="font-mono text-[24px] text-fg-muted">{voteHost}</p>
          </div>
        </div>
      ),
    }] satisfies Slide[]) : []),
    {
      title: "Judges are scoring",
      tone: "dark",
      content: (
        <div className="flex h-full flex-col items-center justify-center gap-8 text-center">
          {!allScored && <AutoRefresh />}
          <p className="font-display text-[110px] font-light italic leading-none">{allScored ? "The scores are in." : "The judges are scoring"}</p>
          <p className="font-mono text-[30px] text-fg-muted">
            {scored} of {expected} final scores in
          </p>
          {!allScored && n > 0 && !force && (
            <Link href={forceHref} className="text-[19px] text-fg-faint underline-offset-4 hover:underline">
              Reveal with the scores so far
            </Link>
          )}
        </div>
      ),
    },
    {
      title: "Prizes",
      tone: "dark",
      content: (
        <div className="flex h-full flex-col gap-8">
          <Sig call="Grant(credits, max)" title="Prizes" />
          <div className="flex items-baseline justify-between rounded-xl bg-accent-soft px-8 py-7">
            <span className="font-display text-[64px] font-light leading-none">{prizes.everyone.replace("Every participant gets ", "").replace(".", "")}</span>
            <Eyebrow className="text-fg">Every participant</Eyebrow>
          </div>
          <div className={styles.stagger}>
            {[...prizes.winners.map((p) => ({ p, who: "Winning team" })), ...prizes.topThree.map((p) => ({ p, who: "Top 3 teams" }))].map((row) => (
              <div key={row.p} className="flex items-baseline justify-between gap-10 border-t border-line py-4 last:border-b">
                <span className="font-display text-[32px] font-light leading-snug">{row.p}</span>
                <Eyebrow className="shrink-0">{row.who}</Eyebrow>
              </div>
            ))}
          </div>
        </div>
      ),
    },
    ...(audienceOn ? ([{
      title: "Audience choice",
      tone: "light",
      content:
        voting === "closed" && audienceWinners.length > 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-10 text-center">
            <Eyebrow className="text-[22px] text-accent">Audience choice · {ballotCount} {ballotCount === 1 ? "vote" : "votes"}</Eyebrow>
            <p className="font-display text-[110px] font-light italic leading-none">{audienceWinners.length > 1 ? "Your favorites" : "Your favorite"}</p>
            <div className={`${styles.stagger} flex flex-wrap justify-center gap-6 text-left`}>
              {audienceWinners.map((a) => (
                <div key={a.entry_id} className="flex w-[620px] flex-col gap-3">
                  <FinalistCard finalist={a.finalist} big />
                  <p className="text-center font-mono text-[24px] text-fg-muted">
                    {a.points} points · on {a.ballots} {a.ballots === 1 ? "ballot" : "ballots"}
                  </p>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-8 text-center">
            {voting === "open" && <AutoRefresh every={4_000} />}
            <p className="font-display text-[100px] font-light italic leading-none">Audience choice</p>
            <p className="font-mono text-[30px] text-fg-muted">
              {voting === "open" ? `Voting is open · ${ballotsLabel}` : voting === "closed" ? "No votes were cast." : "Audience voting hasn't opened."}
            </p>
            {voting === "open" && <VotingButton to="closed" label="Close voting and reveal" disabledReason={voteTestNote} />}
          </div>
        ),
    }] satisfies Slide[]) : []),
    ...winnerSlides,
    {
      title: "Winners",
      tone: "light",
      strip: <SkylineBand venueName={venue.name} />,
      content: (
        <div className="flex h-full flex-col gap-6 pb-[110px]">
          <div className="flex items-center gap-10">
            <span className="inline-block origin-left scale-[2.4]">
              <ThinkingDots />
            </span>
            <Eyebrow className="text-[20px] text-accent">Claude Community Seattle · Seattle AI Week</Eyebrow>
          </div>
          <div>
            <h2 className="font-display text-[100px] font-light leading-[0.95] tracking-[-0.01em]">Congratulations</h2>
            <p className="mt-2 font-display text-[40px] font-light italic text-fg-muted">{eventName} · Seattle</p>
          </div>
          {ready && podium.length > 0 ? (
            <ol className={`${styles.stagger} grid`}>
              {[...podium].reverse().map((group) => (
                <li key={group.place} className="grid grid-cols-[300px_1fr] items-baseline gap-8 border-t border-line py-3 last:border-b">
                  <span className={`font-display text-[36px] font-light italic ${group.place === 1 ? "text-accent" : "text-fg-muted"}`}>{placeLabel(group.place, group.teams.length > 1)}</span>
                  <span className="font-display text-[40px] font-light leading-tight">{group.teams.map((f) => f.team).join(" & ")}</span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-[28px] text-fg-muted">The winners show here once the judges&apos; scores are in.</p>
          )}
          <div className="mt-auto flex items-end justify-between gap-10">
            <PublishButton
              field="publish_winners"
              published={Boolean(settings?.publish_winners)}
              disabledReason={testNote ?? (ready && podium.length > 0 ? undefined : "Available once the scores are in.")}
              label="Publish winners to the website"
            />
            <p className="shrink-0 text-right font-mono text-[18px] leading-relaxed text-fg-faint">
              Thank you to every team
              <br />
              {venue.name} · October 25, 2026
            </p>
          </div>
        </div>
      ),
    },
  ];

  return <Deck slides={slides} storageKey={test ? "slides:awards:test" : "slides:awards"} label="Finalists and winners" />;
}
