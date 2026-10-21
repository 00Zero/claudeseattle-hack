import { requireAdminPage } from "@/lib/admin";
import type { AccessRule } from "@/lib/access";
import { createAdminClient } from "@/lib/supabase/admin";
import { isoToPacificInput } from "@/lib/time";
import { SubmitButton } from "../submit-button";
import { addTicket, deleteTicket, saveEventSettings, saveTicketRules } from "./actions";
import { removeAdminEmail } from "./admin-email-actions";
import { AdminEmailForm } from "./admin-email-form";

const STATUSES = ["approved", "pending_approval", "waitlist", "declined"];
const ACCESS_LABELS: Record<string, string> = {
  full: "Can see profiles",
  profile_only: "Own profile only",
  blocked: "Blocked",
};
const ROLES = ["participant", "mentor", "volunteer", "judge", "admin"];
const TEXT_FIELDS: { name: string; label: string; type?: "url" | "number" }[] = [
  { name: "venue_name", label: "Venue name" },
  { name: "venue_address", label: "Venue address" },
  { name: "venue_neighborhood", label: "Venue neighborhood" },
  { name: "luma_calendar_url", label: "Luma calendar link", type: "url" },
  { name: "business_insights_url", label: "Small business data folder (public link)", type: "url" },
  { name: "venue_lat", label: "Venue latitude", type: "number" },
  { name: "venue_lon", label: "Venue longitude", type: "number" },
  { name: "wifi_network", label: "Wi-Fi network" },
  { name: "wifi_password", label: "Wi-Fi password" },
];
const input = "rounded border border-foreground/20 bg-background px-2 py-1";
const button = "rounded bg-foreground px-3 py-1.5 text-sm text-background";

export default async function SettingsPage() {
  const viewer = await requireAdminPage();
  const admin = createAdminClient();
  const [{ data: settings }, { data: rules }, { data: unmapped }, { data: adminEmails }] = await Promise.all([
    admin.from("event_settings").select("*").eq("id", 1).single(),
    admin.from("access_rules").select("ticket_name, approval_status, access, default_role"),
    admin.from("unmapped_luma_tickets").select("ticket_name, approval_status, guests"),
    viewer.is_super_admin
      ? admin.from("admin_emails").select("email, note, created_at").order("created_at")
      : Promise.resolve({ data: null }),
  ]);

  const tickets = [...new Set(((rules ?? []) as AccessRule[]).map((r) => r.ticket_name))].sort((a, b) =>
    a === "" ? 1 : b === "" ? -1 : a.localeCompare(b),
  );
  const rule = (ticket: string, status: string) =>
    (rules as AccessRule[] | null)?.find((r) => r.ticket_name === ticket && r.approval_status === status);
  const roleFor = (ticket: string) => rule(ticket, "approved")?.default_role ?? "participant";

  return (
    <div className="space-y-10">
      <section className="space-y-3">
        <h1 className="text-2xl font-semibold">Settings</h1>
        <h2 className="text-lg font-semibold">Event</h2>
        {/* Keyed by the saved values so the inputs show them after React resets the form. */}
        <form key={JSON.stringify(settings)} action={saveEventSettings} className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block space-y-1">
              <span className="text-sm font-medium">Team formation closes (Pacific)</span>
              <input
                type="datetime-local"
                name="team_formation_closes_at"
                required
                defaultValue={settings ? isoToPacificInput(settings.team_formation_closes_at) : ""}
                className={`${input} w-full`}
              />
            </label>
            <label className="block space-y-1">
              <span className="text-sm font-medium">Submissions close (Pacific)</span>
              <input
                type="datetime-local"
                name="submissions_close_at"
                required
                defaultValue={settings ? isoToPacificInput(settings.submissions_close_at) : ""}
                className={`${input} w-full`}
              />
            </label>
          </div>
          <p className="text-sm text-foreground/70">
            Shown on the home page. Leave a field blank to use the default in lib/event.ts.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block space-y-1">
              <span className="text-sm font-medium">Event starts (Pacific)</span>
              <input
                type="datetime-local"
                name="event_starts_at"
                defaultValue={settings?.event_starts_at ? isoToPacificInput(settings.event_starts_at) : ""}
                className={`${input} w-full`}
              />
            </label>
            <label className="block space-y-1">
              <span className="text-sm font-medium">Event ends (Pacific)</span>
              <input
                type="datetime-local"
                name="event_ends_at"
                defaultValue={settings?.event_ends_at ? isoToPacificInput(settings.event_ends_at) : ""}
                className={`${input} w-full`}
              />
            </label>
            {TEXT_FIELDS.map(({ name, label, type }) => (
              <label key={name} className="block space-y-1">
                <span className="text-sm font-medium">{label}</span>
                <input
                  type={type ?? "text"}
                  name={name}
                  step={type === "number" ? "any" : undefined}
                  autoComplete="off"
                  defaultValue={settings?.[name] ?? ""}
                  className={`${input} w-full`}
                />
              </label>
            ))}
          </div>
          <label className="flex items-center gap-2">
            <input type="checkbox" name="publish_finalists" defaultChecked={settings?.publish_finalists} /> Publish finalists
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" name="publish_winners" defaultChecked={settings?.publish_winners} /> Publish winners
          </label>
          <SubmitButton className={button}>Save event settings</SubmitButton>
        </form>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Access rules</h2>
        <p className="text-sm text-foreground/70">
          What each Luma ticket gets at each approval status, and the role people with that ticket start with. Roles are
          set when someone&apos;s profile is linked to Luma; change individuals on the People tab. Ticket names must match
          Luma exactly. &ldquo;(no ticket)&rdquo; covers declined guests and people you approve who aren&apos;t in Luma.
        </p>

        {(unmapped ?? []).length > 0 && (
          <div className="rounded border border-amber-600/40 bg-amber-500/10 p-3 text-sm">
            <p className="font-medium">Luma tickets with no rule (treated as own profile only):</p>
            <ul className="list-disc pl-5">
              {unmapped!.map((u) => (
                <li key={u.ticket_name + u.approval_status}>
                  {u.ticket_name || "(no ticket)"} / {u.approval_status}: {u.guests} guest{u.guests === 1 ? "" : "s"}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-foreground/60">
              <tr>
                <th className="py-1 pr-3">Ticket</th>
                <th className="py-1 pr-3">Starting role</th>
                {STATUSES.map((s) => (
                  <th key={s} className="py-1 pr-3">
                    {s}
                  </th>
                ))}
                <th className="py-1" />
              </tr>
            </thead>
            <tbody className="divide-y divide-foreground/10">
              {tickets.map((ticket) => {
                const formId = `rules-${ticket || "none"}`;
                // Keyed by the saved rules too, so the selects show them after React resets the form.
                const saved = [roleFor(ticket), ...STATUSES.map((s) => rule(ticket, s)?.access)].join("|");
                return (
                  <tr key={`${ticket}|${saved}`}>
                    <td className="py-1.5 pr-3 font-medium">
                      {ticket || "(no ticket)"}
                      <form id={formId} action={saveTicketRules}>
                        <input type="hidden" name="ticket_name" value={ticket} />
                      </form>
                    </td>
                    <td className="py-1.5 pr-3">
                      <select form={formId} name="default_role" defaultValue={roleFor(ticket)} className={input}>
                        {ROLES.map((r) => (
                          <option key={r} value={r} disabled={r === "admin" && !viewer.is_super_admin}>
                            {r}
                          </option>
                        ))}
                      </select>
                    </td>
                    {STATUSES.map((status) => (
                      <td key={status} className="py-1.5 pr-3">
                        <select
                          form={formId}
                          name={`access_${status}`}
                          defaultValue={rule(ticket, status)?.access ?? (status === "declined" ? "blocked" : "profile_only")}
                          className={input}
                        >
                          {Object.entries(ACCESS_LABELS).map(([value, label]) => (
                            <option key={value} value={value}>
                              {label}
                            </option>
                          ))}
                        </select>
                      </td>
                    ))}
                    <td className="flex gap-2 py-1.5">
                      <button form={formId} className={button}>
                        Save
                      </button>
                      {ticket !== "" && (
                        <form action={deleteTicket}>
                          <input type="hidden" name="ticket_name" value={ticket} />
                          <SubmitButton className="text-sm underline" pendingText="Removing…">
                            Remove
                          </SubmitButton>
                        </form>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <form action={addTicket} className="flex flex-wrap items-end gap-2">
          <label className="block space-y-1">
            <span className="text-sm font-medium">Add a ticket name</span>
            <input name="ticket_name" required placeholder="Exactly as in Luma" className={input} />
          </label>
          <select name="default_role" defaultValue="participant" className={input}>
            {ROLES.map((r) => (
              <option key={r} value={r} disabled={r === "admin" && !viewer.is_super_admin}>
                            {r}
                          </option>
            ))}
          </select>
          <SubmitButton className={button} pendingText="Adding…">
            Add
          </SubmitButton>
        </form>
      </section>

      {viewer.is_super_admin && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Admin emails</h2>
          <p className="text-sm text-foreground/70">
            Anyone who signs in with, or verifies, one of these emails becomes an admin automatically. Adding an email
            for someone who already has an account promotes them now. Removing an email doesn&apos;t demote anyone;
            change their role on the People tab. Only super admins see this list.
          </p>
          {(adminEmails ?? []).length > 0 && (
            <ul className="divide-y divide-foreground/10 rounded border border-foreground/15">
              {adminEmails!.map((row) => (
                <li key={row.email} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
                  <span className="break-all">
                    {row.email}
                    {row.note && <span className="ml-2 text-foreground/50">{row.note}</span>}
                  </span>
                  <form action={removeAdminEmail}>
                    <input type="hidden" name="email" value={row.email} />
                    <SubmitButton className="text-sm underline" pendingText="Removing…">
                      Remove
                    </SubmitButton>
                  </form>
                </li>
              ))}
            </ul>
          )}
          <AdminEmailForm />
        </section>
      )}
    </div>
  );
}
