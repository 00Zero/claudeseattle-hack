import { cookies } from "next/headers";
import { returnToAdmin } from "@/app/admin/test-accounts/actions";
import { signOut } from "@/app/auth/actions";
import { ADMIN_RETURN_COOKIE } from "@/lib/test-accounts";

// Shown on every page while signed in as a test account (lib/test-accounts.ts), usually an
// admin using "View as" on /admin/test-accounts.
export async function TestAccountBanner({ name }: { name: string }) {
  const canReturn = (await cookies()).has(ADMIN_RETURN_COOKIE);
  return (
    <div className="bg-amber-300 text-black">
      <div className="mx-auto flex max-w-4xl flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2 text-sm">
        <p className="flex-1">
          Viewing as <b>{name}</b>, a test account. Only admins and other test accounts see it, its teams, and its
          changes.
        </p>
        <form action={canReturn ? returnToAdmin : signOut}>
          <button className="rounded border border-black/40 px-2.5 py-1 font-medium hover:bg-black/10">
            {canReturn ? "Back to my account" : "Sign out"}
          </button>
        </form>
      </div>
    </div>
  );
}
