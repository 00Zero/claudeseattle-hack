import Link from "next/link";
import { requireAdminPage } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatPacific } from "@/lib/time";

// What small businesses asked the finder on /small-businesses (small_business_requests), newest
// first, and which projects it recommended most. The page tells businesses their answers aren't
// shared outside the organizers without their approval.

type Request = {
  id: string;
  created_at: string;
  visitor_id: string;
  profile_id: string | null;
  email: string | null;
  business_name: string | null;
  website: string | null;
  industry: string | null;
  team_size: string | null;
  tools: string | null;
  about: string | null;
  challenges: string | null;
  opportunities: string | null;
  follow_ups: { question: string; answer: string }[];
  matches: { id: string; title: string; fit: string; reason: string }[];
};

const LIMIT = 500;

function Text({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div>
      <dt className="text-foreground/70">{label}</dt>
      <dd className="whitespace-pre-wrap">{value}</dd>
    </div>
  );
}

export default async function SmallBusinessRequestsPage() {
  await requireAdminPage();
  const { data } = await createAdminClient().from("small_business_requests").select("*").order("created_at", { ascending: false }).limit(LIMIT);
  const requests = (data ?? []) as Request[];
  const visitors = new Set(requests.map((r) => r.visitor_id)).size;
  const emails = new Set(requests.map((r) => r.email).filter(Boolean)).size;

  // Times each project was recommended, and how often first.
  const counts = new Map<string, { title: string; shown: number; first: number }>();
  for (const r of requests) {
    r.matches.forEach((m, i) => {
      const c = counts.get(m.id) ?? { title: m.title, shown: 0, first: 0 };
      c.shown += 1;
      if (i === 0) c.first += 1;
      counts.set(m.id, c);
    });
  }
  const top = [...counts.values()].sort((a, b) => b.shown - a.shown || b.first - a.first);

  return (
    <div className="space-y-10">
      <section className="space-y-3">
        <h1 className="text-2xl font-semibold">Small businesses</h1>
        <p className="text-sm text-foreground/70">
          Searches from the finder on <Link href="/small-businesses">/small-businesses</Link>, newest first
          {requests.length === LIMIT ? ` (latest ${LIMIT})` : ""}. Businesses were told their answers aren&apos;t shared outside the organizers without their
          approval.
        </p>
        <dl className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
          {[
            ["Searches", requests.length],
            ["Visitors", visitors],
            ["With an email", emails],
          ].map(([label, n]) => (
            <div key={label}>
              <dt className="inline text-foreground/70">{label}: </dt>
              <dd className="inline font-medium">{n}</dd>
            </div>
          ))}
        </dl>
      </section>

      {top.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Most recommended</h2>
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-foreground/20">
                <th className="py-2 pr-3 font-medium">Project</th>
                <th className="py-2 pr-3 font-medium">Recommended</th>
                <th className="py-2 font-medium">Ranked first</th>
              </tr>
            </thead>
            <tbody>
              {top.map((c) => (
                <tr key={c.title} className="border-b border-foreground/10">
                  <td className="py-2 pr-3">{c.title}</td>
                  <td className="py-2 pr-3">{c.shown}</td>
                  <td className="py-2">{c.first}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Searches ({requests.length})</h2>
        {requests.length === 0 && <p className="text-sm text-foreground/70">None yet.</p>}
        <ul className="space-y-3">
          {requests.map((r) => (
            <li key={r.id}>
              <details className="rounded border border-foreground/15 p-3">
                <summary className="cursor-pointer text-sm">
                  <span className="font-medium">{r.business_name || r.industry || "Unnamed business"}</span>
                  <span className="text-foreground/70">
                    {" "}
                    · {formatPacific(r.created_at)}
                    {r.email && ` · ${r.email}`}
                    {r.profile_id && " · signed in"}
                    {r.matches[0] && ` · top match: ${r.matches[0].title}`}
                  </span>
                </summary>
                <dl className="mt-3 grid gap-3 text-sm">
                  <div className="flex flex-wrap gap-x-6 gap-y-1">
                    {[
                      ["Industry", r.industry],
                      ["People", r.team_size],
                      ["Website", r.website],
                      ["Tools", r.tools],
                    ]
                      .filter(([, v]) => v)
                      .map(([label, v]) => (
                        <div key={label}>
                          <dt className="inline text-foreground/70">{label}: </dt>
                          <dd className="inline">{v}</dd>
                        </div>
                      ))}
                  </div>
                  <Text label="About" value={r.about} />
                  <Text label="Challenges" value={r.challenges} />
                  <Text label="Where AI could help" value={r.opportunities} />
                  {r.follow_ups.length > 0 && (
                    <div>
                      <dt className="text-foreground/70">Follow-up answers</dt>
                      <dd>
                        <ul className="list-disc pl-5">
                          {r.follow_ups.map((f) => (
                            <li key={f.question}>
                              {f.question} <span className="font-medium">{f.answer}</span>
                            </li>
                          ))}
                        </ul>
                      </dd>
                    </div>
                  )}
                  <div>
                    <dt className="text-foreground/70">Recommended</dt>
                    <dd>
                      {r.matches.length === 0 ? (
                        "Nothing"
                      ) : (
                        <ol className="list-decimal pl-5">
                          {r.matches.map((m) => (
                            <li key={m.id}>
                              <span className="font-medium">{m.title}</span> ({m.fit}): {m.reason}
                            </li>
                          ))}
                        </ol>
                      )}
                    </dd>
                  </div>
                </dl>
              </details>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
