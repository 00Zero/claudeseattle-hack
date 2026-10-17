import { accessFromRules, type AccessRule } from "@/lib/access";
import { requireAdminPage } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { approvePerson, clearOverride, declinePerson, setPlatformRole } from "./actions";

const ROLES = ["participant", "mentor", "volunteer", "judge", "admin"];
const small = "rounded border border-foreground/20 px-2 py-0.5 text-xs hover:bg-foreground/5";

type Person = {
  id: string;
  first_name: string;
  last_name: string;
  luma_guest_id: string | null;
  luma_status: string | null;
  status_override: string | null;
  ticket_name: string | null;
  platform_role: string;
  profile_confirmed: boolean;
  created_at: string;
};

async function loadAuthEmails() {
  const admin = createAdminClient();
  const emails = new Map<string, string>();
  for (let page = 1; ; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) break;
    data.users.forEach((u) => emails.set(u.id, u.email ?? ""));
    if (data.users.length < 1000) break;
  }
  return emails;
}

function ApprovalButtons({ person }: { person: Person }) {
  return (
    <div className="flex flex-wrap gap-1">
      <form action={approvePerson}>
        <input type="hidden" name="profile_id" value={person.id} />
        <button className={small}>Approve</button>
      </form>
      <form action={declinePerson}>
        <input type="hidden" name="profile_id" value={person.id} />
        <button className={small}>Decline</button>
      </form>
      {person.status_override && (
        <form action={clearOverride}>
          <input type="hidden" name="profile_id" value={person.id} />
          <button className={small}>Clear override</button>
        </form>
      )}
    </div>
  );
}

function RoleForm({ person }: { person: Person }) {
  return (
    <form action={setPlatformRole} className="flex gap-1">
      <input type="hidden" name="profile_id" value={person.id} />
      <select name="platform_role" defaultValue={person.platform_role} className="rounded border border-foreground/20 bg-background text-xs">
        {ROLES.map((r) => (
          <option key={r}>{r}</option>
        ))}
      </select>
      <button className={small}>Set</button>
    </form>
  );
}

export default async function PeoplePage({ searchParams }: PageProps<"/admin/people">) {
  await requireAdminPage();
  const { q } = await searchParams;
  const query = typeof q === "string" ? q.trim().toLowerCase() : "";

  const admin = createAdminClient();
  const [{ data: profiles }, { data: defaults }, { data: rules }, authEmails] = await Promise.all([
    admin
      .from("profiles")
      .select("id, first_name, last_name, luma_guest_id, luma_status, status_override, ticket_name, platform_role, profile_confirmed, created_at")
      .order("last_name"),
    admin.from("profile_emails").select("profile_id, email").eq("is_default", true),
    admin.from("access_rules").select("ticket_name, approval_status, access, default_role"),
    loadAuthEmails(),
  ]);

  const defaultEmail = new Map((defaults ?? []).map((d) => [d.profile_id, d.email]));
  const people = ((profiles ?? []) as Person[]).filter((p) => {
    if (!query) return true;
    const haystack = `${p.first_name} ${p.last_name} ${defaultEmail.get(p.id) ?? ""} ${authEmails.get(p.id) ?? ""}`.toLowerCase();
    return haystack.includes(query);
  });
  const queue = people
    .filter((p) => !p.luma_guest_id)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  const access = (p: Person) => accessFromRules((rules ?? []) as AccessRule[], p.ticket_name, p.luma_status);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-2xl font-semibold">People</h1>
        <form className="flex gap-2">
          <input
            name="q"
            defaultValue={query}
            placeholder="Search name or email"
            className="rounded border border-foreground/20 bg-background px-3 py-1.5 text-sm"
          />
          <button className="rounded border border-foreground/20 px-3 py-1.5 text-sm">Search</button>
        </form>
      </div>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Queue: signed up but not in Luma ({queue.length})</h2>
        <p className="text-sm text-foreground/70">
          They signed in with an email that matches no Luma guest. Approve them here, or they&apos;re linked automatically if a
          later import has a guest with one of their verified emails.
        </p>
        {queue.length === 0 ? (
          <p className="text-sm">Nobody waiting.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-foreground/60">
                <tr>
                  <th className="py-1 pr-3">Name</th>
                  <th className="py-1 pr-3">Signed in with</th>
                  <th className="py-1 pr-3">Signed up</th>
                  <th className="py-1 pr-3">Status</th>
                  <th className="py-1">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-foreground/10">
                {queue.map((p) => (
                  <tr key={p.id}>
                    <td className="py-1.5 pr-3">{`${p.first_name} ${p.last_name}`.trim() || "(no name yet)"}</td>
                    <td className="py-1.5 pr-3 break-all">{authEmails.get(p.id)}</td>
                    <td className="py-1.5 pr-3 whitespace-nowrap">
                      {new Date(p.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/Los_Angeles" })}
                    </td>
                    <td className="py-1.5 pr-3">
                      {p.luma_status}
                      {p.status_override && " (override)"}
                    </td>
                    <td className="py-1.5">
                      <ApprovalButtons person={p} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Everyone ({people.length})</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-foreground/60">
              <tr>
                <th className="py-1 pr-3">Name</th>
                <th className="py-1 pr-3">Default email</th>
                <th className="py-1 pr-3">Ticket</th>
                <th className="py-1 pr-3">Luma status</th>
                <th className="py-1 pr-3">Override</th>
                <th className="py-1 pr-3">Access</th>
                <th className="py-1 pr-3">Role</th>
                <th className="py-1">Approval</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-foreground/10">
              {people.map((p) => (
                <tr key={p.id}>
                  <td className="py-1.5 pr-3">
                    {`${p.first_name} ${p.last_name}`.trim() || "(no name yet)"}
                    {!p.profile_confirmed && <span className="ml-1 text-xs text-foreground/50">unconfirmed</span>}
                  </td>
                  <td className="py-1.5 pr-3 break-all">{defaultEmail.get(p.id)}</td>
                  <td className="py-1.5 pr-3">{p.ticket_name || "—"}</td>
                  <td className="py-1.5 pr-3">{p.luma_status}</td>
                  <td className="py-1.5 pr-3">{p.status_override ? `yes (${p.status_override})` : "no"}</td>
                  <td className="py-1.5 pr-3">{access(p)}</td>
                  <td className="py-1.5 pr-3">
                    <RoleForm person={p} />
                  </td>
                  <td className="py-1.5">
                    <ApprovalButtons person={p} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
