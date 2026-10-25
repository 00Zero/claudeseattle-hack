"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { castVote } from "./actions";
import styles from "./vote.module.css";

export type Finalist = { entryId: string; team: string; title: string; tagline: string | null; ownTeam: boolean };
export type BallotData = { state: "not_open" | "open" | "closed"; eligible: boolean; finalists: Finalist[]; ranking: string[] };

const PLACES = [
  { label: "1st", points: 3 },
  { label: "2nd", points: 2 },
  { label: "3rd", points: 1 },
];
const CONFETTI = ["#d97757", "#e8a33d", "#6a9bcc", "#788c5d", "#c46686", "#141413"];

// Re-reads the ballot every few seconds, so the page opens and closes with the voting.
function useRefresh(every: number | null) {
  const router = useRouter();
  useEffect(() => {
    if (!every) return;
    const timer = setInterval(() => router.refresh(), every);
    return () => clearInterval(timer);
  }, [every, router]);
}

function Header({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <p className="eyebrow text-accent">Audience choice</p>
      <h1 className="font-display text-4xl font-light leading-[1.05]">{title}</h1>
      {children && <div className="text-fg-muted">{children}</div>}
    </div>
  );
}

function LiveNote({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex items-center gap-2 font-mono text-xs text-fg-faint">
      <span className={styles.pulse} aria-hidden="true" />
      {children}
    </p>
  );
}

function Confetti() {
  return (
    <div className={styles.confetti} aria-hidden="true">
      {Array.from({ length: 36 }, (_, i) => (
        <span
          key={i}
          style={{
            left: `${(i * 37) % 100}%`,
            background: CONFETTI[i % CONFETTI.length],
            animationDelay: `${(i % 9) * 0.07}s`,
            animationDuration: `${1.6 + (i % 5) * 0.25}s`,
            transform: `rotate(${i * 29}deg)`,
          }}
        />
      ))}
    </div>
  );
}

// The saved picks as a little podium: 2nd, 1st, 3rd.
function Podium({ picks }: { picks: Finalist[] }) {
  const order = [1, 0, 2].filter((i) => picks[i]);
  const heights = ["h-28", "h-20", "h-14"];
  return (
    <div className="flex items-end justify-center gap-2">
      {order.map((i) => (
        <div key={picks[i].entryId} className={`${styles.rise} flex w-1/3 max-w-40 flex-col items-center gap-2`} style={{ animationDelay: `${(2 - i) * 0.12}s` }}>
          <span className="line-clamp-2 text-center font-display text-lg font-light leading-tight">{picks[i].team}</span>
          <div className={`${heights[i]} flex w-full flex-col items-center justify-center rounded-t-lg ${i === 0 ? "bg-accent text-accent-fg" : "bg-accent-soft"}`}>
            <span className="font-display text-2xl font-light">{PLACES[i].label}</span>
            <span className="font-mono text-xs opacity-80">+{PLACES[i].points}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

export function Ballot({ data }: { data: BallotData }) {
  const router = useRouter();
  const [ranking, setRanking] = useState<string[]>(data.ranking);
  const [saved, setSaved] = useState<string[]>(data.ranking);
  const [editing, setEditing] = useState(data.ranking.length === 0);
  const [celebrate, setCelebrate] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  // Waiting for voting to open: check often. While open: now and then, to notice it closing.
  useRefresh(data.eligible && data.state === "not_open" ? 4_000 : data.eligible && data.state === "open" ? 20_000 : null);

  if (!data.eligible) {
    return (
      <div className="mx-auto max-w-xl space-y-6">
        <Header title="Voting is for checked-in guests">
          <p>Check in at the front desk, then come back to this page to pick your favorite finalists.</p>
        </Header>
      </div>
    );
  }

  if (data.state === "not_open") {
    return (
      <div className="mx-auto max-w-xl space-y-6">
        <Header title="Voting opens after the last demo">
          <p>Watch the finalists&apos; demos, then rank your top three right here. First place gets 3 points, second 2, third 1.</p>
        </Header>
        <LiveNote>Keep this page open. It updates by itself.</LiveNote>
      </div>
    );
  }

  const byId = new Map(data.finalists.map((f) => [f.entryId, f]));
  const savedPicks = saved.map((id) => byId.get(id)).filter((f): f is Finalist => Boolean(f));

  if (data.state === "closed") {
    return (
      <div className="mx-auto max-w-xl space-y-8">
        <Header title="Voting is closed">
          <p>Thanks for voting! The audience choice is announced on stage.</p>
        </Header>
        {savedPicks.length > 0 ? (
          <div className="space-y-3">
            <p className="font-mono text-xs text-fg-faint">Your picks</p>
            <Podium picks={savedPicks} />
          </div>
        ) : (
          <p className="text-fg-muted">You didn&apos;t vote this time.</p>
        )}
      </div>
    );
  }

  const options = data.finalists.filter((f) => !f.ownTeam);
  const needed = Math.min(3, options.length);

  if (needed === 0) {
    return (
      <div className="mx-auto max-w-xl space-y-6">
        <Header title="No finalists to vote for">
          <p>Check back in a moment.</p>
        </Header>
        <LiveNote>This page updates by itself.</LiveNote>
      </div>
    );
  }

  if (!editing && savedPicks.length > 0) {
    return (
      <div className="relative mx-auto max-w-xl space-y-8">
        {celebrate && <Confetti />}
        <Header title={celebrate ? "Your vote is in!" : "You've voted"}>
          <p>You can change your picks until voting closes.</p>
        </Header>
        <Podium picks={savedPicks} />
        <button
          type="button"
          className="btn btn-ghost w-full justify-center"
          onClick={() => {
            setCelebrate(false);
            setRanking(saved);
            setEditing(true);
          }}
        >
          Change my vote
        </button>
      </div>
    );
  }

  // Tap to add a finalist at the next place; tap again to take it off (the ones below move up).
  // With every place filled, a new tap replaces the last place.
  const toggle = (entryId: string) => {
    setError(null);
    setRanking((current) => {
      if (current.includes(entryId)) return current.filter((id) => id !== entryId);
      if (current.length < needed) return [...current, entryId];
      return [...current.slice(0, needed - 1), entryId];
    });
  };

  const submit = () => {
    setError(null);
    startTransition(async () => {
      const result = await castVote(ranking).catch(() => ({ ok: false as const, message: "Couldn't save your vote. Try again." }));
      if (!result.ok) {
        setError(result.message);
        router.refresh();
        return;
      }
      setSaved(ranking);
      setEditing(false);
      setCelebrate(true);
      navigator.vibrate?.(60);
    });
  };

  const complete = ranking.length === needed;

  return (
    <div className="mx-auto max-w-xl space-y-6 pb-40">
      <Header title={needed === 3 ? "Pick your top three" : `Pick your top ${needed === 2 ? "two" : "one"}`}>
        <p>Tap your favorite first, then your next {needed - 1 === 1 ? "pick" : "picks"}. Tap again to undo.</p>
      </Header>

      <ul className="space-y-3">
        {data.finalists.map((f) => {
          const place = ranking.indexOf(f.entryId);
          const picked = place >= 0;
          return (
            <li key={f.entryId}>
              <button
                type="button"
                disabled={f.ownTeam}
                aria-pressed={picked}
                onClick={() => toggle(f.entryId)}
                className={`flex w-full items-center gap-4 rounded-xl border p-4 text-left transition-[transform,background-color,border-color] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-55 ${
                  picked ? "border-accent bg-accent-soft" : "border-line bg-bg-raised hover:border-line-strong"
                }`}
              >
                <span
                  key={picked ? `p${place}` : "empty"}
                  className={`grid h-12 w-12 shrink-0 place-items-center rounded-full font-display text-lg ${
                    picked ? `${styles.pop} ${place === 0 ? "bg-accent text-accent-fg" : "bg-fg text-bg"}` : "border-2 border-dashed border-line"
                  }`}
                >
                  {picked ? PLACES[place].label : ""}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-display text-2xl font-light leading-tight">{f.team}</span>
                  {f.title && f.title !== f.team && <span className="block font-medium leading-snug">{f.title}</span>}
                  {f.tagline && <span className="mt-0.5 line-clamp-2 block text-sm text-fg-muted">{f.tagline}</span>}
                  {f.ownTeam && <span className="mt-1 block font-mono text-xs text-fg-faint">Your team. Cheer them on!</span>}
                </span>
                {picked && <span className={`${styles.pop} shrink-0 font-mono text-sm text-accent`}>+{PLACES[place].points}</span>}
              </button>
            </li>
          );
        })}
      </ul>

      {/* The picks so far and the vote button, pinned to the bottom of the screen. */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-bg/95 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur">
        <div className="mx-auto max-w-xl space-y-3">
          <ol className="grid gap-2" style={{ gridTemplateColumns: `repeat(${needed}, minmax(0, 1fr))` }}>
            {PLACES.slice(0, needed).map((p, i) => {
              const pick = ranking[i] ? byId.get(ranking[i]) : null;
              return (
                <li key={p.label} className={`min-w-0 rounded-lg border px-2 py-1.5 ${pick ? "border-accent" : "border-dashed border-line"}`}>
                  <span className="block font-mono text-[11px] text-fg-faint">
                    {p.label} · +{p.points}
                  </span>
                  <span className={`block truncate text-sm ${pick ? "font-medium" : "text-fg-faint"}`}>{pick ? pick.team : "Tap a team"}</span>
                </li>
              );
            })}
          </ol>
          {error && <p className="text-sm text-[#b3261e]">{error}</p>}
          {/* Leaves room for the /feedback button, fixed to the bottom right below lg. */}
          <button type="button" disabled={!complete || pending} onClick={submit} className="btn w-[calc(100%-7.5rem)] justify-center disabled:opacity-40 lg:w-full">
            {pending ? "Saving…" : complete ? (saved.length ? "Save my new picks" : "Cast my vote") : `Pick ${needed - ranking.length} more`}
          </button>
        </div>
      </div>
    </div>
  );
}
