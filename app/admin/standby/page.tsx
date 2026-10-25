import { requireAdminPage } from "@/lib/admin";
import { locationVerdict, ON_SITE_METERS, STANDBY_TICKET, type StandbyCheckin } from "@/lib/standby";
import { createAdminClient } from "@/lib/supabase/admin";
import { SubmitButton } from "../submit-button";
import { setStandbyCanSeeTeams } from "./actions";
import { StandbyCopyList } from "./copy-list";
import { StandbyTable, type StandbyRow } from "./standby-table";

const BUCKET: Record<string, string> = { owner: "Business owner", professional: "Professional", student: "Student / recent grad" };
const button = "rounded bg-foreground px-3 py-1.5 text-sm text-background";

type Guest = {
  guest_id: string;
  first_name: string | null;
  last_name: string | null;
  email: string;
  approval_status: string;
  professional_role: string | null;
  job_title: string | null;
  company: string | null;
};
type Profile = {
  id: string;
  luma_guest_id: string | null;
  first_name: string;
  last_name: string;
  role_bucket: string | null;
  job_title: string | null;
  company: string | null;
  technical_level: number | null;
  profile_confirmed: boolean;
  luma_status: string | null;
};

function locationOf(c: StandbyCheckin, venueIps: Set<string>): NonNullable<StandbyRow["location"]> {
  const verdict = locationVerdict(c);
  const detail =
    c.venue_distance_m != null
      ? `${c.venue_distance_m < 1000 ? `${Math.round(c.venue_distance_m)} m` : `${(c.venue_distance_m / 1000).toFixed(1)} km`} from venue` +
        (c.gps_accuracy_m != null ? ` (±${Math.round(c.gps_accuracy_m)} m)` : "")
      : c.gps_error === "denied"
        ? "Location blocked"
        : "No location";
  const ipPlace = [c.ip_city, c.ip_region].filter(Boolean).join(", ");
  const ipDetail = c.ip ? `IP ${c.ip}${ipPlace ? ` (${ipPlace})` : ""}` : null;
  return { verdict, detail, ipDetail, venueIp: !!c.ip && venueIps.has(c.ip) };
}

export default async function StandbyPage() {
  await requireAdminPage();
  const admin = createAdminClient();
  const [{ data: guestRows }, { data: profileRows }, { data: checkinRows }, { data: settings }] = await Promise.all([
    admin
      .from("luma_guests")
      .select("guest_id, first_name, last_name, email, approval_status, professional_role, job_title, company")
      .eq("ticket_name", STANDBY_TICKET),
    admin
      .from("profiles")
      .select("id, luma_guest_id, first_name, last_name, role_bucket, job_title, company, technical_level, profile_confirmed, luma_status")
      .eq("ticket_name", STANDBY_TICKET),
    admin.from("standby_checkins").select("*").order("checked_in_at"),
    admin.from("event_settings").select("standby_can_see_teams").eq("id", 1).maybeSingle(),
  ]);
  const guests = (guestRows ?? []) as Guest[];
  const profiles = new Map(((profileRows ?? []) as Profile[]).map((p) => [p.luma_guest_id, p]));
  const checkins = (checkinRows ?? []) as StandbyCheckin[];
  const checkinOf = new Map(checkins.map((c) => [c.profile_id, c]));
  const order = new Map(checkins.map((c, i) => [c.profile_id, i + 1]));
  // The venue Wi-Fi's public IP, as seen on check-ins whose GPS puts them on site.
  const venueIps = new Set(checkins.filter((c) => c.ip && locationVerdict(c) === "on_site").map((c) => c.ip!));

  const rows: StandbyRow[] = guests.map((g) => {
    const p = profiles.get(g.guest_id) ?? null;
    const c = p ? checkinOf.get(p.id) : undefined;
    const title = p?.job_title ?? g.job_title;
    const company = p?.company ?? g.company;
    return {
      guestId: g.guest_id,
      profileId: p?.id ?? null,
      name: (p ? `${p.first_name} ${p.last_name}` : `${g.first_name ?? ""} ${g.last_name ?? ""}`).trim() || g.email,
      email: g.email,
      role: (p?.role_bucket && BUCKET[p.role_bucket]) || g.professional_role,
      work: [title, company].filter(Boolean).join(" at ") || null,
      technicalLevel: p?.technical_level ?? null,
      profileConfirmed: p?.profile_confirmed ?? false,
      order: p ? (order.get(p.id) ?? null) : null,
      checkedInAt: c?.checked_in_at ?? null,
      location: c ? locationOf(c, venueIps) : null,
      approvedHere: p?.luma_status === "approved",
      lumaStatus: g.approval_status,
    };
  });
  // Check-in order first, then everyone else by name.
  rows.sort((a, b) => (a.order ?? Infinity) - (b.order ?? Infinity) || a.name.localeCompare(b.name));

  const signedIn = rows.filter((r) => r.profileId).length;
  const checkedIn = rows.filter((r) => r.checkedInAt).length;
  const onSite = rows.filter((r) => r.location?.verdict === "on_site").length;
  const approved = rows.filter((r) => r.approvedHere);
  const lumaToDo = approved.filter((r) => r.lumaStatus !== "approved");
  const teamsOn = settings?.standby_can_see_teams === true;

  return (
    <div className="space-y-10">
      <section className="space-y-3">
        <h1 className="text-2xl font-semibold">Standby</h1>
        <p className="text-sm text-foreground/70">
          Guests with a Luma &ldquo;{STANDBY_TICKET}&rdquo; ticket. They sign in, check in at /check-in, and fill in
          their profile; until you approve them they can&apos;t join a team or print a name tag. Approving here gives
          full access at once; Luma doesn&apos;t need to catch up first. &ldquo;On site&rdquo; means their phone&apos;s
          location is within {ON_SITE_METERS} m of the venue (allowing for its accuracy). IP location is only
          city-level and most will be on cell data, so it&apos;s a weak signal; it&apos;s recorded anyway.
        </p>
        <dl className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
          {[
            ["On the list", guests.length],
            ["Signed in", signedIn],
            ["Checked in", checkedIn],
            ["On site", onSite],
            ["Approved here", approved.length],
          ].map(([label, n]) => (
            <div key={label}>
              <dt className="inline text-foreground/70">{label}: </dt>
              <dd className="inline font-medium">{n}</dd>
            </div>
          ))}
        </dl>
        {guests.length === 0 && (
          <p className="rounded border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
            No Standby guests imported yet. Import the latest Luma CSV first.
          </p>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Approved here, still pending on Luma ({lumaToDo.length})</h2>
        <p className="text-sm text-foreground/70">
          They already have full access here. Copy the emails, paste them into Luma&apos;s bulk update and set them to
          approved (Luma emails them). After the next CSV import they drop off this list.
        </p>
        {lumaToDo.length ? <StandbyCopyList people={lumaToDo.map((r) => ({ name: r.name, email: r.email }))} /> : <p className="text-sm">Nobody.</p>}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Pick people off standby</h2>
        <StandbyTable rows={rows} />
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Let standby see teams</h2>
        <p className="text-sm text-foreground/70">
          {teamsOn
            ? "On: checked-in standby guests see the team list (names, ideas, sizes) on their check-in page. They still can't join."
            : "Off: standby guests see only their own profile and check-in page."}
        </p>
        <form action={setStandbyCanSeeTeams}>
          <input type="hidden" name="enabled" value={teamsOn ? "false" : "true"} />
          <SubmitButton className={button} pendingText="Saving…">
            {teamsOn ? "Turn off" : "Turn on"}
          </SubmitButton>
        </form>
      </section>
    </div>
  );
}
