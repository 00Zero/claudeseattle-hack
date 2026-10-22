// Test accounts in bulk (lib/test-accounts.ts explains what a test account is). The admin page
// /admin/test-accounts does the same one guest at a time.
//
//   npx tsx --env-file=.env.local scripts/test-accounts.ts status
//   npx tsx --env-file=.env.local scripts/test-accounts.ts seed    (every approved guest with a team ticket; re-run after a Luma import)
//   npx tsx --env-file=.env.local scripts/test-accounts.ts clean   (deletes every test account, its teams and its guest copy)
//
// Needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY. Prints counts only.
import { createClient } from "@supabase/supabase-js";
import { copyableGuests, createTestAccount, deleteTestAccounts, TEST_GUEST_PREFIX } from "../lib/test-accounts";

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});

async function seed() {
  const guests = await copyableGuests(admin);
  for (const [i, guest] of guests.entries()) {
    try {
      await createTestAccount(admin, guest);
    } catch (e) {
      throw new Error(`Stopped after ${i} of ${guests.length}: ${e instanceof Error ? e.message : e}`);
    }
  }
  console.log(`Test accounts created or refreshed: ${guests.length}`);
}

async function clean() {
  const deleted = await deleteTestAccounts(admin);
  // Guest copies left by a failed run have no account.
  const { error } = await admin.from("luma_guests").delete().like("guest_id", `${TEST_GUEST_PREFIX}%`);
  if (error) throw new Error(`guest copies: ${error.message}`);
  console.log(`Test accounts deleted: ${deleted}`);
}

async function status() {
  const [profiles, copies, guests] = await Promise.all([
    admin.from("profiles").select("id", { count: "exact", head: true }).eq("is_test", true),
    admin.from("luma_guests").select("guest_id", { count: "exact", head: true }).like("guest_id", `${TEST_GUEST_PREFIX}%`),
    copyableGuests(admin),
  ]);
  console.log(`Test accounts: ${profiles.count ?? 0}, guest copies: ${copies.count ?? 0}, approved guests that can be copied: ${guests.length}`);
}

const run = { seed, clean, status }[process.argv[2] as "seed" | "clean" | "status"];
if (!run) {
  console.error("Usage: test-accounts.ts seed | clean | status");
  process.exit(1);
}
run().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
