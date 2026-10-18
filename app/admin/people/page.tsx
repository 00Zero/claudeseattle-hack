import { accessFromRules, type Access, type AccessRule } from "@/lib/access";
import { requireAdminPage } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { SubmitButton } from "../submit-button";
import { approvePerson, clearOverride, declinePerson } from "./actions";
import { RoleForm } from "./role-form";

const small = "rounded border border-foreground/20 px-2 py-0.5 text-xs enabled:hover:bg-foreground/5";

type Person = {
  id: string;
  first_name: string;
  last_name: string;
  luma_guest_id: string | null;
  luma_status: string | null;
  status_override: string | null;
  ticket_name: string | null;
  platform_role: string;
  is_super_admin: boolean;
  profile_confirmed: boolean;
  created_at: string;
};

const STATUS_LABEL: Record<string, string> = {
  approved: "approved",
  pending_approval: "pending",
  waitlist: "waitlist",
  declined: "declined",
};
const STATUS_STYLE: Record<string, string> = {
  approved: "bg-green-600/15 text-green-800",
  pending_approval: "bg-amber-500/15 text-amber-800",
  waitlist: "bg-amber-500/15 text-amber-800",
  declined: "bg-red-600/15 text-red-800",
};
const ACCESS_LABEL: Record<Access, string> = {
  full: "can see profiles",
  profile_only: "own profile only",
  blocked: "blocked",
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

const fullName = (p: Person) => `${p.first_name} ${p.last_name}`.trim() || "(no name yet)";

// Status plus where it came from: an admin override, the Luma import, or nothing yet.
function StatusBadge({ person }: { person: Person }) {
  const status = person.luma_status ?? "pending_approval";
  const source = person.status_override ? "set by admin" : person.luma_guest_id ? "from Luma" : "not in Luma";
  return (
    <span className="inline-flex flex-col">
      <span className={`w-fit rounded px-1.5 py-0.5 text-xs font-medium ${STATUS_STYLE[status] ?? ""}`}>
        {STATUS_LABEL[status] ?? status}
      </span>
      <span className="text-xs text-foreground/50">{source}</span>
    </span>
  );
}

// Buttons that would change nothing are disabled.
function ApprovalButtons({ person }: { person: Person }) {
  if (person.is_super_admin) return <span className="text-xs text-foreground/50">protected</span>;
  const approved = person.luma_status === "approved";
  const declined = person.luma_status === "declined";
  return (
    <div className="flex flex-wrap gap-1">
      <form action={approvePerson}>
        <input type="hidden" name="profile_id" value={person.id} />
        <SubmitButton className={small} pendingText="Approving…" disabled={approved} title={approved ? "Already approved" : undefined}>
          Approve
        </SubmitButton>
      </form>
      <form action={declinePerson}>
        <input type="hidden" name="profile_id" value={person.id} />
        <SubmitButton className={small} pendingText="Declining…" disabled={declined} title={declined ? "Already declined" : undefined}>
          Decline
        </SubmitButton>
      </form>
      {person.status_override && (
        <form action={clearOverride}>
          <input type="hidden" name="profile_id" value={person.id} />
          <SubmitButton
            className={small}
            pendingText="Undoing…"
            title={person.luma_guest_id ? "Go back to the Luma status" : "Go back to pending"}
          >
            Undo override
          </SubmitButton>
        </form>
      )}
    </div>
  );
}

const th = "py-1.5 pr-4 font-medium";
const td = "py-2 pr-4 align-top";

export default async function PeoplePage({ searchParams }: PageProps<"/admin/people">) {
  const viewer = await requireAdminPage();
  const { q } = await searchParams;
  const query = typeof q === "string" ? q.trim().toLowerCase() : "";

  const admin = createAdminClient();
  const [{ data: profiles }, { data: defaults }, { data: rules }, authEmails] = await Promise.all([
    admin
      .from("profiles")
      .select(
        "id, first_name, last_name, luma_guest_id, luma_status, status_override, ticket_name, platform_role, is_super_admin, profile_confirmed, created_at",
      )
      .order("last_name"),
    admin.from("profile_emails").select("profile_id, email").eq("is_default", true),
    admin.from("access_rules").select("ticket_name, approval_status, access, default_role"),
    loadAuthEmails(),
  ]);

  const defaultEmail = new Map((defaults ?? []).map((d) => [d.profile_id, d.email]));
  const people = ((profiles ?? []) as Person[]).filter((p) => {
    if (!query) return true;
    const haystack = `${fullName(p)} ${defaultEmail.get(p.id) ?? ""} ${authEmails.get(p.id) ?? ""}`.toLowerCase();
    return haystack.includes(query);
  });
  const queue = people.filter((p) => !p.luma_guest_id).sort((a, b) => b.created_at.localeCompare(a.created_at));
  const access = (p: Person): Access =>
    p.platform_role === "admin" ? "full" : accessFromRules((rules ?? []) as AccessRule[], p.ticket_name, p.luma_status);
  const role = (p: Person) => (
    <RoleForm profileId={p.id} role={p.platform_role} isSuperAdmin={p.is_super_admin} viewerIsSuperAdmin={viewer.is_super_admin} />
  );

  return (
    <div className="space-y-10">
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

      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold">Not in Luma ({queue.length})</h2>
          <p className="text-sm text-foreground/70">
            Signed in with an email that isn&apos;t on the Luma guest list. Approve or decline them here. A later import
            links them automatically if one of their verified emails is on it.
          </p>
        </div>
        {queue.length === 0 ? (
          <p className="text-sm">Nobody here.</p>
        ) : (
          <div className="overflow-x-auto rounded border border-foreground/15">
            <table className="w-full text-left text-sm">
              <thead className="bg-foreground/5 text-foreground/70">
                <tr>
                  <th className={`${th} pl-3`}>Name</th>
                  <th className={th}>Signed in with</th>
                  <th className={th}>Signed up</th>
                  <th className={th}>Status</th>
                  <th className={th}>Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-foreground/10">
                {queue.map((p) => (
                  <tr key={p.id}>
                    <td className={`${td} pl-3`}>{fullName(p)}</td>
                    <td className={`${td} break-all`}>{authEmails.get(p.id)}</td>
                    <td className={`${td} whitespace-nowrap`}>
                      {new Date(p.created_at).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        timeZone: "America/Los_Angeles",
                      })}
                    </td>
                    <td className={td}>
                      <StatusBadge person={p} />
                    </td>
                    <td className={td}>
                      <ApprovalButtons person={p} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Everyone ({people.length})</h2>
        <div className="overflow-x-auto rounded border border-foreground/15">
          <table className="w-full text-left text-sm">
            <thead className="bg-foreground/5 text-foreground/70">
              <tr>
                <th className={`${th} pl-3`}>Name</th>
                <th className={th}>Default email</th>
                <th className={th}>Ticket</th>
                <th className={th}>Status</th>
                <th className={th}>Access</th>
                <th className={th}>Role</th>
                <th className={th}>Approval</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-foreground/10">
              {people.map((p) => (
                <tr key={p.id}>
                  <td className={`${td} pl-3`}>
                    {fullName(p)}
                    {!p.profile_confirmed && <span className="block text-xs text-foreground/50">profile not confirmed</span>}
                  </td>
                  <td className={`${td} break-all`}>{defaultEmail.get(p.id)}</td>
                  <td className={td}>{p.ticket_name || "—"}</td>
                  <td className={td}>
                    <StatusBadge person={p} />
                  </td>
                  <td className={`${td} whitespace-nowrap`}>{ACCESS_LABEL[access(p)]}</td>
                  <td className={td}>{role(p)}</td>
                  <td className={td}>
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
