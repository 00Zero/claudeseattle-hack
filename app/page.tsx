import Link from "next/link";
import { eventDate, eventName, openSourceNote, prizes, rubric, saturdaySchedule, sundaySchedule, theme, venue, type ScheduleItem } from "@/lib/event";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/supabase/profile";
import { formatPacific } from "@/lib/time";

function Schedule({ title, items }: { title: string; items: ScheduleItem[] }) {
  return (
    <div className="space-y-1">
      <h3 className="font-semibold">{title}</h3>
      <ul className="space-y-1">
        {items.map((item) => (
          <li key={item.time + item.what} className="flex gap-3">
            <span className="w-28 shrink-0 font-medium">{item.time}</span>
            <span>{item.what}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default async function Home() {
  const supabase = await createClient();
  const [{ data: settings }, profile] = await Promise.all([
    supabase.from("event_settings").select("team_formation_closes_at, submissions_close_at").eq("id", 1).single(),
    getCurrentProfile(),
  ]);

  return (
    <div className="space-y-10">
      <section className="space-y-3">
        <p className="text-sm font-medium text-foreground/60">
          {eventDate} · {venue.name}
        </p>
        <h1 className="text-3xl font-semibold">{eventName}</h1>
        <p className="text-lg">{theme}</p>
        <p className="text-sm text-foreground/70">{openSourceNote}</p>
        {!profile && (
          <Link href="/login" className="inline-block rounded bg-foreground px-4 py-2 text-background">
            Log in
          </Link>
        )}
      </section>

      {settings && (
        <section className="grid gap-3 sm:grid-cols-2">
          <div className="rounded border border-foreground/20 p-4">
            <p className="text-sm text-foreground/60">Team formation closes</p>
            <p className="text-lg font-semibold">{formatPacific(settings.team_formation_closes_at)}</p>
          </div>
          <div className="rounded border border-foreground/20 p-4">
            <p className="text-sm text-foreground/60">Submissions close</p>
            <p className="text-lg font-semibold">{formatPacific(settings.submissions_close_at)}</p>
          </div>
        </section>
      )}

      <section className="space-y-4">
        <h2 className="text-xl font-semibold">Schedule</h2>
        <Schedule title="Saturday, October 24" items={saturdaySchedule} />
        <Schedule title="Sunday, October 25" items={sundaySchedule} />
      </section>

      <section className="space-y-2">
        <h2 className="text-xl font-semibold">Prizes</h2>
        <p>{prizes.everyone}</p>
        <p>The winning team gets:</p>
        <ul className="list-disc pl-5">
          {prizes.winners.map((prize) => (
            <li key={prize}>{prize}</li>
          ))}
        </ul>
      </section>

      <section className="space-y-1">
        <h2 className="text-xl font-semibold">Venue</h2>
        <p>
          {venue.name}, {venue.address}
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-xl font-semibold">Judging criteria</h2>
        <p className="text-sm text-foreground/70">
          Four criteria, equal weight, each scored 1–8. An entry&apos;s score is the mean of the four.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead>
              <tr className="border-b border-foreground/20">
                <th className="py-2 pr-3">Criterion</th>
                {rubric.bands.map((band) => (
                  <th key={band} className="py-2 pr-3">
                    {band}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-foreground/10 align-top">
              {rubric.criteria.map((criterion) => (
                <tr key={criterion.name}>
                  <td className="py-2 pr-3 font-medium">{criterion.name}</td>
                  {criterion.anchors.map((anchor) => (
                    <td key={anchor} className="py-2 pr-3">
                      {anchor}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
