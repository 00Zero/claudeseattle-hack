import { requireAdminPage } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import Link from "next/link";
import { copyableGuests, TEST_GUEST_PREFIX, TEST_ROLES, type GuestRow } from "@/lib/test-accounts";
import { SubmitButton } from "../submit-button";
import {
  createAllTestCopies,
  createProjects,
  createTestCopy,
  deleteAllTestAccounts,
  deleteTestAccount,
  formTeams,
  setTestRole,
  viewAsTestAccount,
} from "./actions";
import { SignInLink } from "./sign-in-link";
import { TechnicalLevelsSection } from "../technical-levels";

type TestAccount = {
  id: string;
  first_name: string;
  last_name: string;
  platform_role: string;
  job_title: string | null;
  company: string | null;
  linkedin_url: string | null;
};

const th = "py-1.5 pr-4 font-medium";
const td = "py-2 pr-4 align-top";
const button = "rounded border border-foreground/20 px-2.5 py-1 text-xs";
const MAX_GUEST_RESULTS = 25;

const matches = (query: string, ...fields: (string | null | undefined)[]) =>
  !query || fields.join(" ").toLowerCase().includes(query);

const titleAt = (title: string | null | undefined, company: string | null | undefined) =>
  [title, company].filter(Boolean).join(" at ") || "—";

export default async function TestAccountsPage({ searchParams }: PageProps<"/admin/test-accounts">) {
  await requireAdminPage();
  const { q } = await searchParams;
  const query = typeof q === "string" ? q.trim().toLowerCase() : "";

  const admin = createAdminClient();
  const [{ data: profiles }, guests] = await Promise.all([
    admin
      .from("profiles")
      .select("id, first_name, last_name, luma_guest_id, platform_role, job_title, company, linkedin_url")
      .eq("is_test", true)
      .order("first_name"),
    copyableGuests(admin),
  ]);
  const tests = (profiles ?? []) as (TestAccount & { luma_guest_id: string })[];
  const { data: memberships } = tests.length
    ? await admin
        .from("team_members")
        .select("profile_id, status, teams(name)")
        .in("status", ["member", "applied"])
        .in("profile_id", tests.map((t) => t.id))
    : { data: [] };
  const teamOf = new Map<string, string>();
  for (const m of (memberships ?? []) as unknown as { profile_id: string; status: string; teams: { name: string } }[]) {
    if (m.status === "member" || !teamOf.has(m.profile_id)) {
      teamOf.set(m.profile_id, m.status === "member" ? m.teams.name : `applied to ${m.teams.name}`);
    }
  }

  const [{ data: testTeams }, { data: entries }] = await Promise.all([
    admin.from("teams").select("id, leader:profiles!teams_leader_id_fkey!inner(is_test)").eq("leader.is_test", true),
    admin.from("judge_entries").select("team_id"),
  ]);
  const teamIds = new Set((testTeams ?? []).map((t) => t.id));
  const projectCount = (entries ?? []).filter((e) => teamIds.has(e.team_id)).length;
  const participants = tests.filter((t) => t.platform_role === "participant");
  const unteamed = participants.filter((t) => !teamOf.has(t.id) || teamOf.get(t.id)!.startsWith("applied to")).length;
  const judgeCount = tests.filter((t) => t.platform_role === "judge").length;

  const copied = new Set(tests.map((t) => t.luma_guest_id.slice(TEST_GUEST_PREFIX.length)));
  const uncopied = guests.filter((g) => !copied.has(g.guest_id));
  const shownTests = tests.filter((t) => matches(query, t.first_name, t.job_title, t.company));
  const shownGuests = query
    ? uncopied
        .filter((g) => matches(query, g.name as string, g.job_title as string, g.company as string))
        .slice(0, MAX_GUEST_RESULTS)
    : [];

  return (
    <div className="space-y-10">
      <div className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h1 className="text-2xl font-semibold">Test accounts</h1>
          <form className="flex gap-2">
            <input
              name="q"
              defaultValue={query}
              placeholder="Search name, title, or company"
              className="rounded border border-foreground/20 bg-background px-3 py-1.5 text-sm"
            />
            <button className="rounded border border-foreground/20 px-3 py-1.5 text-sm">Search</button>
          </form>
        </div>
        <p className="text-sm text-foreground/70">
          Copies of approved guests with an @example.com email and the last name &ldquo;Test&rdquo;, carrying the
          guest&apos;s Luma answers, LinkedIn profile and enrichment, and survey answers, so team matching treats them like
          the real person. They live in a separate test world with their own teams, projects, judges, scores and
          places: real attendees (and you, in your own account) never see any of it, and test accounts never see real
          data. &ldquo;View as&rdquo; signs this browser in as the test account; use the banner at the top to come
          back. &ldquo;Sign-in link&rdquo; makes a one-time link to open on another device, for example a real judge
          rehearsing as a test judge on their phone.
        </p>
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">
          Test accounts ({query ? `${shownTests.length} of ${tests.length}` : tests.length})
        </h2>
        {shownTests.length === 0 ? (
          <p className="text-sm">{tests.length ? "None match your search." : "None yet. Create some below."}</p>
        ) : (
          <div className="overflow-x-auto rounded border border-foreground/15">
            <table className="w-full text-left text-sm">
              <thead className="bg-foreground/5 text-foreground/70">
                <tr>
                  <th className={`${th} pl-3`}>Name</th>
                  <th className={th}>Role</th>
                  <th className={th}>Title</th>
                  <th className={th}>Team</th>
                  <th className={th}>Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-foreground/10">
                {shownTests.map((t) => (
                  <tr key={t.id}>
                    <td className={`${td} pl-3`}>
                      {t.first_name} {t.last_name}
                      {!t.linkedin_url && <span className="block text-xs text-foreground/50">no LinkedIn</span>}
                    </td>
                    <td className={td}>
                      <form action={setTestRole} className="flex gap-1">
                        <input type="hidden" name="profile_id" value={t.id} />
                        <select
                          name="role"
                          defaultValue={t.platform_role}
                          className="rounded border border-foreground/20 bg-background px-1 py-0.5 text-xs"
                        >
                          {TEST_ROLES.map((r) => (
                            <option key={r}>{r}</option>
                          ))}
                        </select>
                        <SubmitButton className={button} pendingText="…">
                          Set
                        </SubmitButton>
                      </form>
                    </td>
                    <td className={td}>{titleAt(t.job_title, t.company)}</td>
                    <td className={td}>{teamOf.get(t.id) ?? "—"}</td>
                    <td className={`${td} whitespace-nowrap`}>
                      <div className="flex items-start gap-2">
                        <form action={viewAsTestAccount}>
                          <input type="hidden" name="profile_id" value={t.id} />
                          <SubmitButton className={button} pendingText="Signing in…">
                            View as
                          </SubmitButton>
                        </form>
                        <SignInLink profileId={t.id} className={button} />
                        <form action={deleteTestAccount}>
                          <input type="hidden" name="profile_id" value={t.id} />
                          <SubmitButton className={button} pendingText="Deleting…">
                            Delete
                          </SubmitButton>
                        </form>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Create test copies</h2>
            <p className="text-sm text-foreground/70">
              {uncopied.length} approved guests with a participant, mentor, ambassador or judge ticket have no test copy
              yet.
              Copying all of them runs in batches of about 40 seconds; click again if some are left.
            </p>
          </div>
          {uncopied.length > 0 && (
            <form action={createAllTestCopies}>
              <SubmitButton className={button} pendingText="Copying…">
                Copy all {uncopied.length}
              </SubmitButton>
            </form>
          )}
        </div>
        {!query ? (
          <p className="text-sm">Search above to copy one person.</p>
        ) : shownGuests.length === 0 ? (
          <p className="text-sm">No uncopied approved guests match your search.</p>
        ) : (
          <div className="overflow-x-auto rounded border border-foreground/15">
            <table className="w-full text-left text-sm">
              <thead className="bg-foreground/5 text-foreground/70">
                <tr>
                  <th className={`${th} pl-3`}>Guest</th>
                  <th className={th}>Ticket</th>
                  <th className={th}>Title</th>
                  <th className={th}></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-foreground/10">
                {shownGuests.map((g: GuestRow) => (
                  <tr key={g.guest_id}>
                    <td className={`${td} pl-3`}>
                      {g.name as string}
                      {!g.linkedin_url && <span className="block text-xs text-foreground/50">no LinkedIn</span>}
                    </td>
                    <td className={td}>{g.ticket_name}</td>
                    <td className={td}>{titleAt(g.job_title as string, g.company as string)}</td>
                    <td className={td}>
                      <form action={createTestCopy}>
                        <input type="hidden" name="guest_id" value={g.guest_id} />
                        <SubmitButton className={button} pendingText="Creating…">
                          Create test copy
                        </SubmitButton>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {tests.length > 0 && <TechnicalLevelsSection world="test" />}

      {tests.length > 0 && (
        <section className="space-y-3">
          <div>
            <h2 className="text-lg font-semibold">Simulate teams and judging</h2>
            <p className="text-sm text-foreground/70">
              {testTeams?.length ?? 0} test teams, {projectCount} test projects, {judgeCount} test judges. Forming teams
              places the {unteamed} test participants without a team the way the people page ranks fit, about 4 to a team, led by business owners first. Projects are submitted entries with no repo or video; edit
              them on /submit as a team member. Then assign test judges on{" "}
              <Link href="/admin/judging?world=test" className="underline">
                Judging (test)
              </Link>{" "}
              and score as a test judge with &ldquo;View as&rdquo;. Set a test account&apos;s role to judge to add judges.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <form action={formTeams}>
              <SubmitButton className={button} pendingText="Forming…" disabled={unteamed < 2}>
                Form test teams
              </SubmitButton>
            </form>
            <form action={createProjects}>
              <SubmitButton className={button} pendingText="Creating…" disabled={(testTeams?.length ?? 0) === projectCount}>
                Create a test project for each test team
              </SubmitButton>
            </form>
          </div>
        </section>
      )}

      {tests.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-lg font-semibold">Clean up</h2>
          <p className="text-sm text-foreground/70">
            Deletes every test account, the teams they lead with their projects, scores and assignments, and their
            guest copies. Real data is untouched.
          </p>
          <form action={deleteAllTestAccounts}>
            <SubmitButton className={button} pendingText="Deleting…">
              Delete all {tests.length} test accounts
            </SubmitButton>
          </form>
        </section>
      )}
    </div>
  );
}
