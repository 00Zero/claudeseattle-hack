import { createAdminClient } from "@/lib/supabase/admin";
import { SubmitButton } from "./submit-button";
import { suggestTechnicalLevelsAction } from "./technical-levels-action";

const button = "rounded border border-foreground/20 px-2.5 py-1 text-xs";

// How many people with full access in one world have an AI-suggested technical level, and a
// button to suggest the rest (and refresh stale ones). Admin pages only.
export async function TechnicalLevelsSection({ world }: { world: "real" | "test" }) {
  const admin = createAdminClient();
  const [people, suggested] = await Promise.all([
    admin.from("matching_profiles").select("profile_id").eq("access", "full").eq("is_test", world === "test"),
    admin.from("profile_technical_ai").select("profile_id"),
  ]);
  const ids = new Set((suggested.data ?? []).map((row) => row.profile_id as string));
  const total = people.data?.length ?? 0;
  const done = (people.data ?? []).filter((row) => ids.has(row.profile_id as string)).length;
  const who = world === "test" ? "test accounts" : "real people";

  return (
    <section className="space-y-2">
      <h2 className="text-lg font-semibold">Technical level suggestions</h2>
      {suggested.error ? (
        <p className="text-sm text-foreground/70">Available once the technical-level migration is live.</p>
      ) : (
        <>
          <p className="text-sm text-foreground/70">
            {done} of {total} {who} with full access have a suggested 1–5 technical level from their registration,
            LinkedIn and survey. People see only the number, preselected on their profile until they save their own.
            Suggesting runs in batches of about 40 seconds and also refreshes suggestions whose inputs changed; about
            $0.005 each.
          </p>
          <form action={suggestTechnicalLevelsAction}>
            <input type="hidden" name="world" value={world} />
            <SubmitButton className={button} pendingText="Suggesting…">
              Suggest for {who}
            </SubmitButton>
          </form>
        </>
      )}
    </section>
  );
}
