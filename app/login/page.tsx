import { redirect } from "next/navigation";
import { safeNextPath } from "@/lib/sign-in-next";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentProfile } from "@/lib/supabase/profile";
import { LoginForm } from "./login-form";

const errorMessages: Record<string, string> = {
  link:
    "That sign-in link no longer works. Each link works once, and asking for a new link cancels the earlier ones. " +
    "If you asked more than once, open the newest email from Claude Seattle (check spam too) instead of requesting " +
    "another. Otherwise, enter your email below for a new link.",
};

// /login?invite=<survey token> (the photo upload link in the feedback email and on the survey's
// thank-you page): the address that invite signs in with, its account's email or else the one the
// survey went to. The token is already the key to that person's survey, so the address isn't in the URL.
async function inviteEmail(token: unknown) {
  if (typeof token !== "string" || !/^[0-9a-f]{32}$/.test(token)) return null;
  const admin = createAdminClient();
  const { data: invite } = await admin.from("followup_invites").select("email, profile_id").eq("token", token).maybeSingle();
  if (!invite) return null;
  const account = invite.profile_id ? (await admin.auth.admin.getUserById(invite.profile_id)).data.user?.email : null;
  return account?.toLowerCase() ?? invite.email;
}

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { error, next: nextParam, invite } = await searchParams;
  // /login?next=/resources: already signed in goes straight there; otherwise after the link.
  const next = safeNextPath(nextParam);
  if (await getCurrentProfile()) redirect(next ?? "/");
  const email = await inviteEmail(invite);
  const message = typeof error === "string" ? errorMessages[error] : undefined;

  return (
    <div className="mx-auto max-w-sm space-y-4">
      <h1 className="text-2xl font-semibold">Log in</h1>
      {message && <p className="text-sm text-red-600">{message}</p>}
      <LoginForm next={next} defaultEmail={email} />
    </div>
  );
}
