import Link from "next/link";
import { requireAdminPage } from "@/lib/admin";
import { accessFromRules, type AccessRule } from "@/lib/access";
import type { Offer, OfferClick, OfferCode, OfferLinkRow } from "@/lib/offers";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatPacific } from "@/lib/time";
import { SubmitButton } from "../submit-button";
import { addOffer, deleteOfferLink, saveOffer, saveOfferLink, setOfferFlag } from "./actions";

const input = "rounded border border-foreground/20 bg-background px-2 py-1";
const button = "rounded bg-foreground px-3 py-1.5 text-sm text-background";
const th = "py-1 pr-3 font-normal";
const td = "py-1.5 pr-3";

type Person = {
  id: string;
  first_name: string;
  last_name: string;
  ticket_name: string | null;
  luma_status: string | null;
  platform_role: string;
  checked_in_at: string | null;
  is_test: boolean | null;
};

// People who clicked, and how many clicks, from a list of clicks.
function tally(clicks: OfferClick[]) {
  return { people: new Set(clicks.map((c) => c.profile_id)).size, clicks: clicks.length };
}

const pct = (part: number, whole: number) => (whole > 0 ? `${Math.round((part / whole) * 100)}%` : "–");

// Sponsor offers on /resources: who can see each one, who clicked what, and the switches and
// links behind them. Stats leave out test accounts; the per-person list tags them.
// Checked in = Luma check-in (profiles.checked_in_at) or an approved standby check-in, as in
// is_checked_in() (*_shared_offers.sql). Admins count as checked in.
export default async function OffersAdminPage({ searchParams }: PageProps<"/admin/offers">) {
  await requireAdminPage();
  const { offer: offerParam } = await searchParams;
  const admin = createAdminClient();
  const [
    { data: offerRows },
    { data: linkRows },
    { data: clickRows },
    { data: peopleRows },
    { data: rules },
    { data: standby },
    { data: emails },
    { data: codeRows },
  ] = await Promise.all([
    admin
      .from("offers")
      .select("slug, provider, headline, about, details, steps, sort_order, enabled, requires_checkin, personal_link_label, show_code")
      .order("sort_order"),
    admin.from("offer_links").select("id, offer_slug, label, url, code, sort_order").order("sort_order").order("label"),
    admin.from("offer_clicks").select("profile_id, offer_slug, link_id, link_label, kind, clicked_at").order("clicked_at"),
    admin.from("profiles").select("id, first_name, last_name, ticket_name, luma_status, platform_role, checked_in_at, is_test"),
    admin.from("access_rules").select("ticket_name, approval_status, access, default_role"),
    admin.from("standby_checkins").select("profile_id").not("approved_at", "is", null),
    admin.from("profile_emails").select("profile_id, email").eq("is_default", true),
    admin.from("offer_codes").select("code, offer_slug, profile_id, assigned_at"),
  ]);
  const offers = (offerRows ?? []) as Offer[];
  const links = (linkRows ?? []) as OfferLinkRow[];
  const clicks = (clickRows ?? []) as OfferClick[];
  const people = (peopleRows ?? []) as Person[];
  const codes = (codeRows ?? []) as OfferCode[];
  const personOf = new Map(people.map((p) => [p.id, p]));
  const emailOf = new Map((emails ?? []).map((e) => [e.profile_id as string, e.email as string]));
  const standbyApproved = new Set((standby ?? []).map((s) => s.profile_id as string));

  const isAdmin = (p: Person) => p.platform_role === "admin";
  const isTest = (id: string) => personOf.get(id)?.is_test === true;
  const real = people.filter((p) => !p.is_test);
  const approved = real.filter((p) => isAdmin(p) || accessFromRules((rules ?? []) as AccessRule[], p.ticket_name, p.luma_status) === "full");
  const checkedIn = approved.filter((p) => isAdmin(p) || p.checked_in_at || standbyApproved.has(p.id));
  const realClicks = clicks.filter((c) => !isTest(c.profile_id));

  const summary = offers.map((o) => {
    const mine = realClicks.filter((c) => c.offer_slug === o.slug);
    const canSee = !o.enabled ? 0 : o.requires_checkin ? checkedIn.length : approved.length;
    const linkClicks = mine.filter((c) => c.kind === "link");
    return {
      offer: o,
      canSee,
      any: tally(mine),
      link: tally(linkClicks),
      code: tally(mine.filter((c) => c.kind === "code")),
      hasCode: o.personal_link_label != null || links.some((l) => l.offer_slug === o.slug && l.code),
      codes:
        o.personal_link_label == null
          ? null
          : {
              assigned: codes.filter((c) => c.offer_slug === o.slug && c.assigned_at).length,
              total: codes.filter((c) => c.offer_slug === o.slug).length,
            },
      // By link id, so a renamed link keeps its count; deleted links fall back to the saved label.
      byLink: [...Map.groupBy(linkClicks, (c) => c.link_id ?? `label:${c.link_label}`)].map(([key, list]) => ({
        key,
        label: links.find((l) => l.id === key)?.label ?? list.at(-1)?.link_label ?? "(deleted link)",
        ...tally(list),
      })),
    };
  });

  // One row per person and offer, most recent first.
  const filtered = offerParam ? clicks.filter((c) => c.offer_slug === offerParam) : clicks;
  const rows = [...Map.groupBy(filtered, (c) => `${c.profile_id}|${c.offer_slug}`).values()]
    .map((list) => {
      const p = personOf.get(list[0].profile_id);
      const linkCounts = new Map<string, number>();
      for (const c of list.filter((c) => c.kind === "link")) {
        const label = links.find((l) => l.id === c.link_id)?.label ?? c.link_label ?? "(deleted link)";
        linkCounts.set(label, (linkCounts.get(label) ?? 0) + 1);
      }
      return {
        key: `${list[0].profile_id}|${list[0].offer_slug}`,
        name: p ? `${p.first_name} ${p.last_name}`.trim() || "(no name)" : "(deleted profile)",
        email: emailOf.get(list[0].profile_id) ?? null,
        test: p?.is_test === true,
        offer: offers.find((o) => o.slug === list[0].offer_slug)?.provider ?? list[0].offer_slug,
        links: [...linkCounts],
        codeCopies: list.filter((c) => c.kind === "code").length,
        first: list[0].clicked_at,
        last: list.at(-1)!.clicked_at,
      };
    })
    .sort((a, b) => b.last.localeCompare(a.last));

  return (
    <div className="space-y-10">
      <section className="space-y-3">
        <h1 className="text-2xl font-semibold">Offers</h1>
        <p className="text-sm text-foreground/70">
          Sponsor credits and promo codes at the top of the Resources page. A click is logged when someone opens a
          redemption link or copies a promo code. Opening a link that has a code copies the code too, but counts only as a
          link click. Numbers leave out test accounts. Luma check-ins reach the site when you re-import the Luma CSV
          (Import tab).
        </p>
        <dl className="flex flex-wrap gap-3 text-sm">
          {[
            ["Approved attendees", approved.length],
            ["Checked in", checkedIn.length],
            ["Clicked any offer", tally(realClicks).people],
            ["Clicks", realClicks.length],
          ].map(([label, value]) => (
            <div key={label} className="rounded border border-foreground/20 px-3 py-2">
              <dt className="text-foreground/60">{label}</dt>
              <dd className="text-xl font-semibold tabular-nums">{value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">By offer</h2>
        {offers.length === 0 ? (
          <p className="text-sm text-foreground/70">No offers yet: the offers migration hasn&apos;t run.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-foreground/60">
                <tr>
                  <th className={th}>Offer</th>
                  <th className={th}>Can see the links</th>
                  <th className={th}>Clicked a link</th>
                  <th className={th}>Copied the code</th>
                  <th className={th}>Clicked anything</th>
                  <th className={th}>Clicks</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-foreground/10 tabular-nums">
                {summary.map((s) => (
                  <tr key={s.offer.slug} className="align-top">
                    <td className={td}>
                      <Link href={`/admin/offers?offer=${s.offer.slug}#people`} className="font-medium">
                        {s.offer.provider}
                      </Link>
                      {!s.offer.enabled && <span className="ml-2 rounded bg-foreground/10 px-1.5 text-xs">Off</span>}
                      {s.codes && (
                        <span className="block text-xs text-foreground/60">
                          Personal codes: {s.codes.assigned} assigned, {s.codes.total - s.codes.assigned} left
                        </span>
                      )}
                      {s.byLink.length > 0 && (
                        <ul className="mt-1 text-xs text-foreground/60">
                          {s.byLink.map((l) => (
                            <li key={l.key}>
                              {l.label}: {l.people} {l.people === 1 ? "person" : "people"}, {l.clicks} {l.clicks === 1 ? "click" : "clicks"}
                            </li>
                          ))}
                        </ul>
                      )}
                    </td>
                    <td className={td}>
                      {s.canSee}
                      <span className="block text-xs text-foreground/60">
                        {!s.offer.enabled ? "turned off" : s.offer.requires_checkin ? "checked in" : "all approved"}
                      </span>
                    </td>
                    <td className={td}>
                      {s.link.people} <span className="text-foreground/60">({pct(s.link.people, s.canSee)})</span>
                    </td>
                    <td className={td}>{s.hasCode || s.code.people > 0 ? s.code.people : "–"}</td>
                    <td className={td}>{s.any.people}</td>
                    <td className={td}>{s.any.clicks}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section id="people" className="space-y-3">
        <h2 className="text-lg font-semibold">Who clicked</h2>
        <nav className="flex flex-wrap gap-2 text-sm">
          {[{ slug: "", provider: "All offers" }, ...offers].map((o) => {
            const active = (offerParam ?? "") === o.slug;
            return (
              <Link
                key={o.slug || "all"}
                href={o.slug ? `/admin/offers?offer=${o.slug}#people` : "/admin/offers#people"}
                className={`rounded border px-2.5 py-1 no-underline ${active ? "border-foreground bg-foreground text-background" : "border-foreground/20"}`}
              >
                {o.provider}
              </Link>
            );
          })}
        </nav>
        {rows.length === 0 ? (
          <p className="text-sm text-foreground/70">No clicks yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-foreground/60">
                <tr>
                  <th className={th}>Person</th>
                  <th className={th}>Offer</th>
                  <th className={th}>Links clicked</th>
                  <th className={th}>Code copied</th>
                  <th className={th}>First click</th>
                  <th className={th}>Last click</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-foreground/10">
                {rows.map((r) => (
                  <tr key={r.key} className="align-top">
                    <td className={td}>
                      {r.name}
                      {r.test && <span className="ml-2 rounded bg-foreground/10 px-1.5 text-xs">test</span>}
                      {r.email && <span className="block text-xs text-foreground/60">{r.email}</span>}
                    </td>
                    <td className={td}>{r.offer}</td>
                    <td className={td}>
                      {r.links.length === 0
                        ? "–"
                        : r.links.map(([label, n]) => (
                            <span key={label} className="block">
                              {label}
                              {n > 1 && <span className="text-foreground/60"> ×{n}</span>}
                            </span>
                          ))}
                    </td>
                    <td className={td}>{r.codeCopies === 0 ? "–" : r.codeCopies === 1 ? "Yes" : `Yes ×${r.codeCopies}`}</td>
                    <td className={`${td} whitespace-nowrap`}>{formatPacific(r.first)}</td>
                    <td className={`${td} whitespace-nowrap`}>{formatPacific(r.last)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Offers, switches and links</h2>
        <p className="text-sm text-foreground/70">
          Turn each offer on or off, and choose whether people must be checked in to see its links (until then they see
          the offer, locked). Admins always see the links. A link with a promo code copies it when an attendee clicks,
          shows &ldquo;Code copied&rdquo;, then opens the page. &ldquo;Hide promo codes&rdquo; only takes the code off
          the card (for links that apply it themselves); clicking still copies it. The first link is the main button. Edit an offer&apos;s text under &ldquo;Edit the text&rdquo;.
        </p>
        {offers.map((o) => {
          const offerLinks = links.filter((l) => l.offer_slug === o.slug);
          const hasCodes = o.personal_link_label != null || offerLinks.some((l) => l.code);
          const showCode = o.show_code !== false;
          return (
            <div key={o.slug} className="space-y-3 rounded border border-foreground/20 p-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-medium">{o.provider}</p>
                  <p className="text-sm text-foreground/70">{o.headline}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className={`rounded px-2 py-0.5 ${o.enabled ? "bg-green-600/15 text-green-700" : "bg-foreground/10"}`}>
                    {o.enabled ? "On" : "Off"}
                  </span>
                  <form action={setOfferFlag}>
                    <input type="hidden" name="slug" value={o.slug} />
                    <input type="hidden" name="flag" value="enabled" />
                    <input type="hidden" name="value" value={o.enabled ? "false" : "true"} />
                    <SubmitButton className={button}>{o.enabled ? "Turn off" : "Turn on"}</SubmitButton>
                  </form>
                  <span className={`ml-2 rounded px-2 py-0.5 ${o.requires_checkin ? "bg-amber-500/15 text-amber-600" : "bg-foreground/10"}`}>
                    {o.requires_checkin ? "Check-in required" : "No check-in needed"}
                  </span>
                  <form action={setOfferFlag}>
                    <input type="hidden" name="slug" value={o.slug} />
                    <input type="hidden" name="flag" value="requires_checkin" />
                    <input type="hidden" name="value" value={o.requires_checkin ? "false" : "true"} />
                    <SubmitButton className="rounded border border-foreground/20 px-3 py-1.5 text-sm">
                      {o.requires_checkin ? "Don't require check-in" : "Require check-in"}
                    </SubmitButton>
                  </form>
                  {hasCodes && (
                    <>
                      <span className={`ml-2 rounded px-2 py-0.5 ${showCode ? "bg-foreground/10" : "bg-sky-500/15 text-sky-700"}`}>
                        {showCode ? "Promo codes shown" : "Promo codes hidden"}
                      </span>
                      <form action={setOfferFlag}>
                        <input type="hidden" name="slug" value={o.slug} />
                        <input type="hidden" name="flag" value="show_code" />
                        <input type="hidden" name="value" value={showCode ? "false" : "true"} />
                        <SubmitButton className="rounded border border-foreground/20 px-3 py-1.5 text-sm">
                          {showCode ? "Hide promo codes" : "Show promo codes"}
                        </SubmitButton>
                      </form>
                    </>
                  )}
                </div>
              </div>
              <details className="rounded bg-foreground/5 p-2 text-sm">
                <summary className="cursor-pointer font-medium">Edit the text</summary>
                {/* Keyed by the saved values so the inputs show them after React resets the form. */}
                <form key={JSON.stringify(o)} action={saveOffer} className="mt-2 grid gap-2 sm:grid-cols-2">
                  <input type="hidden" name="slug" value={o.slug} />
                  <label className="space-y-1">
                    <span className="block text-foreground/70">Provider</span>
                    <input name="provider" required maxLength={60} defaultValue={o.provider} className={`${input} w-full`} />
                  </label>
                  <label className="space-y-1">
                    <span className="block text-foreground/70">Headline: what they get</span>
                    <input name="headline" required maxLength={120} defaultValue={o.headline} className={`${input} w-full`} />
                  </label>
                  <label className="space-y-1 sm:col-span-2">
                    <span className="block text-foreground/70">What the provider does</span>
                    <textarea name="about" required rows={2} defaultValue={o.about} className={`${input} w-full`} />
                  </label>
                  <label className="space-y-1">
                    <span className="block text-foreground/70">What you get (one per line)</span>
                    <textarea name="details" rows={4} defaultValue={o.details.join("\n")} className={`${input} w-full`} />
                  </label>
                  <label className="space-y-1">
                    <span className="block text-foreground/70">How to redeem (one step per line)</span>
                    <textarea name="steps" rows={4} defaultValue={o.steps.join("\n")} className={`${input} w-full`} />
                  </label>
                  {o.personal_link_label != null && (
                    <label className="space-y-1">
                      <span className="block text-foreground/70">Personal link button</span>
                      <input name="personal_link_label" required maxLength={80} defaultValue={o.personal_link_label} className={`${input} w-full`} />
                    </label>
                  )}
                  <label className="space-y-1">
                    <span className="block text-foreground/70">Order (lower comes first)</span>
                    <input name="sort_order" type="number" step="1" defaultValue={o.sort_order} className={`${input} w-24`} />
                  </label>
                  <SubmitButton className={`${button} sm:col-span-2 sm:w-fit`} pendingText="Saving…">
                    Save text
                  </SubmitButton>
                </form>
              </details>
              {o.personal_link_label != null && (
                <p className="text-sm text-foreground/70">
                  Personal codes: each checked-in attendee gets their own link, shown first as &ldquo;{o.personal_link_label}
                  &rdquo;. Codes are loaded with the service role (offer_codes); people who check in later get one when they
                  open the Resources page, while any are left. Links below are extra, the same for everyone.
                </p>
              )}
              {offerLinks.length === 0 && o.personal_link_label == null && (
                <p className="text-sm text-amber-700">No links yet: attendees see &ldquo;The link is on its way.&rdquo;</p>
              )}
              {offerLinks.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="text-foreground/60">
                      <tr>
                        <th className="py-1 pr-2">Button label</th>
                        <th className="py-1 pr-2">Link</th>
                        <th className="py-1 pr-2">Promo code</th>
                        <th className="py-1 pr-2">Order</th>
                        <th className="py-1" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-foreground/10">
                      {offerLinks.map((l) => {
                        const formId = `offer-link-${l.id}`;
                        return (
                          // Keyed by the saved values so the inputs show them after React resets the form.
                          <tr key={JSON.stringify(l)} className="align-top">
                            <td className="py-1.5 pr-2">
                              <form id={formId} action={saveOfferLink}>
                                <input type="hidden" name="id" value={l.id} />
                              </form>
                              <input form={formId} name="label" required defaultValue={l.label} className={`${input} w-48`} />
                            </td>
                            <td className="py-1.5 pr-2">
                              <input form={formId} name="url" type="url" required defaultValue={l.url} className={`${input} w-64`} />
                            </td>
                            <td className="py-1.5 pr-2">
                              <input form={formId} name="code" defaultValue={l.code ?? ""} autoComplete="off" className={`${input} w-36 font-mono`} />
                            </td>
                            <td className="py-1.5 pr-2">
                              <input form={formId} name="sort_order" type="number" step="1" defaultValue={l.sort_order} className={`${input} w-16`} />
                            </td>
                            <td className="flex gap-2 py-1.5">
                              <button form={formId} className={button}>
                                Save
                              </button>
                              <form action={deleteOfferLink}>
                                <input type="hidden" name="id" value={l.id} />
                                <SubmitButton className="rounded border border-foreground/20 px-3 py-1.5 text-sm" pendingText="Deleting…">
                                  Delete
                                </SubmitButton>
                              </form>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
              {/* Keyed by the count so the form clears after an add. */}
              <form key={offerLinks.length} action={saveOfferLink} className="flex flex-wrap items-center gap-2">
                <input type="hidden" name="offer_slug" value={o.slug} />
                <input name="label" required placeholder="Button label, e.g. Claim credits" className={`${input} w-48`} />
                <input name="url" type="url" required placeholder="https://…" className={`${input} w-64`} />
                <input name="code" placeholder="Promo code (optional)" autoComplete="off" className={`${input} w-44 font-mono`} />
                <input name="sort_order" type="number" step="1" defaultValue={offerLinks.length} aria-label="Order" className={`${input} w-16`} />
                <SubmitButton className={button} pendingText="Adding…">
                  Add link
                </SubmitButton>
              </form>
            </div>
          );
        })}
        {/* Keyed by the count so the form clears after an add. */}
        <form key={offers.length} action={addOffer} className="grid gap-2 rounded border border-dashed border-foreground/30 p-3 text-sm sm:grid-cols-2">
          <span className="font-medium sm:col-span-2">Add an offer</span>
          <p className="text-foreground/70 sm:col-span-2">
            It starts turned off, so you can add its links (and choose check-in and promo codes) before attendees see it.
            Personal one-per-person codes are loaded with the service role.
          </p>
          <input name="provider" required maxLength={60} placeholder="Provider, e.g. Vercel" className={input} />
          <input name="headline" required maxLength={120} placeholder="Headline, e.g. $50 in credits" className={input} />
          <textarea name="about" required rows={2} placeholder="What the provider does" className={`${input} sm:col-span-2`} />
          <textarea name="details" rows={3} placeholder="What you get, one per line" className={input} />
          <textarea name="steps" rows={3} placeholder="How to redeem, one step per line" className={input} />
          <SubmitButton className={`${button} sm:col-span-2 sm:w-fit`} pendingText="Adding…">
            Add offer
          </SubmitButton>
        </form>
      </section>
    </div>
  );
}
