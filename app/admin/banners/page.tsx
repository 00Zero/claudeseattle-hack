import { requireAdminPage } from "@/lib/admin";
import { BANNER_COLUMNS, BANNER_MAX_LENGTH, type Banner } from "@/lib/banners";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatPacific, isoToPacificInput } from "@/lib/time";
import { SubmitButton } from "../submit-button";
import { deleteBanner, endBanner, saveBanner } from "./actions";

const input = "rounded border border-foreground/20 bg-background px-2 py-1";
const button = "rounded bg-foreground px-3 py-1.5 text-sm text-background";
const secondary = "rounded border border-foreground/20 px-3 py-1.5 text-sm";

const TONE_LABELS: Record<Banner["tone"], string> = {
  info: "Info (light, for routine notices)",
  urgent: "Urgent (dark, for changes people must not miss)",
};

// Message, style and time window; shared by the add form and each banner's edit form.
function BannerFields({ banner, startsAt, endsAt }: { banner?: Banner; startsAt: string; endsAt: string }) {
  return (
    <>
      <label className="grid gap-1 text-sm sm:col-span-2">
        Message
        <textarea
          name="message"
          required
          maxLength={BANNER_MAX_LENGTH}
          rows={2}
          defaultValue={banner?.message}
          placeholder="e.g. Lunch is served on the 2nd floor until 1:30 pm."
          className={input}
        />
      </label>
      <label className="grid gap-1 text-sm">
        Starts (Pacific)
        <input name="starts_at" type="datetime-local" required defaultValue={startsAt} className={input} />
      </label>
      <label className="grid gap-1 text-sm">
        Ends (Pacific)
        <input name="ends_at" type="datetime-local" required defaultValue={endsAt} className={input} />
      </label>
      <label className="grid gap-1 text-sm sm:col-span-2">
        Style
        <select name="tone" defaultValue={banner?.tone ?? "info"} className={input}>
          {Object.entries(TONE_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
    </>
  );
}

// How the banner looks on the site (components/site/site-banners.tsx).
function Preview({ banner }: { banner: Banner }) {
  return (
    <p
      className={`whitespace-pre-line rounded px-3 py-2 text-sm ${
        banner.tone === "urgent" ? "bg-clay-deep text-ivory" : "border border-line bg-accent-soft text-fg"
      }`}
    >
      {banner.message}
    </p>
  );
}

function BannerCard({ banner, status }: { banner: Banner; status: "live" | "scheduled" | "past" }) {
  return (
    <li className="space-y-2 rounded border border-foreground/20 p-3">
      <Preview banner={banner} />
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
        <span className="text-foreground/70">
          {formatPacific(banner.starts_at)} to {formatPacific(banner.ends_at)}
        </span>
        <div className="ml-auto flex gap-2">
          {status === "live" && (
            <form action={endBanner}>
              <input type="hidden" name="id" value={banner.id} />
              <SubmitButton className={secondary} pendingText="Ending…">
                End now
              </SubmitButton>
            </form>
          )}
          <form action={deleteBanner}>
            <input type="hidden" name="id" value={banner.id} />
            <SubmitButton className={secondary} pendingText="Deleting…">
              Delete
            </SubmitButton>
          </form>
        </div>
      </div>
      <details>
        <summary className="cursor-pointer text-sm text-foreground/70">Edit</summary>
        <form action={saveBanner} className="mt-2 grid gap-2 sm:grid-cols-2">
          <input type="hidden" name="id" value={banner.id} />
          <BannerFields
            banner={banner}
            startsAt={isoToPacificInput(banner.starts_at)}
            endsAt={isoToPacificInput(banner.ends_at)}
          />
          <div>
            <SubmitButton className={button}>Save</SubmitButton>
          </div>
        </form>
      </details>
    </li>
  );
}

// Live and scheduled soonest first, past most recent first (the list comes newest first).
// New banners default to starting now and running for an hour.
function byWindow(banners: Banner[]) {
  const now = Date.now();
  const starts = (b: Banner) => Date.parse(b.starts_at);
  const ends = (b: Banner) => Date.parse(b.ends_at);
  return {
    live: banners.filter((b) => starts(b) <= now && ends(b) > now).reverse(),
    scheduled: banners.filter((b) => starts(b) > now).reverse(),
    past: banners.filter((b) => ends(b) <= now),
    defaultStart: isoToPacificInput(new Date(now).toISOString()),
    defaultEnd: isoToPacificInput(new Date(now + 60 * 60_000).toISOString()),
  };
}

// Announcement banners shown below the site header on every page, to everyone (signed out too),
// while the current time is inside their window. Times are entered and shown in Pacific time.
export default async function BannersAdminPage() {
  await requireAdminPage();
  const { data, error } = await createAdminClient()
    .from("banners")
    .select(BANNER_COLUMNS)
    .order("starts_at", { ascending: false });
  // PGRST205: no banners table on this database yet.
  if (error?.code === "PGRST205") {
    return <p className="text-sm text-foreground/70">No banners yet: the banners migration hasn&apos;t run on this database.</p>;
  }
  if (error) throw new Error(error.message);
  const banners = (data ?? []) as Banner[];

  const { live, scheduled, past, defaultStart, defaultEnd } = byWindow(banners);

  const sections = [
    { title: "Live now", status: "live" as const, list: live, empty: "No banner is showing right now." },
    { title: "Scheduled", status: "scheduled" as const, list: scheduled, empty: "Nothing scheduled." },
    { title: "Past", status: "past" as const, list: past, empty: "No past banners." },
  ];

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <h1 className="text-2xl font-semibold">Banners</h1>
        <p className="text-sm text-foreground/70">
          Announcements shown below the header on every page, to everyone including signed-out visitors, from the start
          time until the end time (Pacific). Use them for lunch, deadlines and last-minute changes. Several live banners
          stack. Open pages pick up a new or ended banner within about a minute; links in the message become clickable.
        </p>
        {/* Keyed by the count so the form clears after an add. */}
        <form
          key={banners.length}
          action={saveBanner}
          className="grid gap-2 rounded border border-foreground/20 p-3 sm:grid-cols-2"
        >
          <span className="text-sm font-medium sm:col-span-2">New banner</span>
          <BannerFields startsAt={defaultStart} endsAt={defaultEnd} />
          <div>
            <SubmitButton className={button}>Add banner</SubmitButton>
          </div>
        </form>
      </section>

      {sections.map((section) => (
        <section key={section.status} className="space-y-3">
          <h2 className="text-lg font-semibold">
            {section.title} <span className="text-foreground/50">{section.list.length}</span>
          </h2>
          {section.list.length === 0 ? (
            <p className="text-sm text-foreground/70">{section.empty}</p>
          ) : (
            <ul className="space-y-3">
              {section.list.map((banner) => (
                <BannerCard key={banner.id} banner={banner} status={section.status} />
              ))}
            </ul>
          )}
        </section>
      ))}
    </div>
  );
}
