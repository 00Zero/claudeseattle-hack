import { createHash } from "node:crypto";
import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";

type Result =
  | { kind: "verified"; email: string }
  | { kind: "taken"; email: string }
  | { kind: "expired" }
  | { kind: "invalid" };

// Consumes a single-use add-email token. Verifies the row unless the email is
// already verified on another profile.
async function verifyToken(token: string | undefined): Promise<Result> {
  if (!token) return { kind: "invalid" };
  const admin = createAdminClient();
  const hash = createHash("sha256").update(token).digest("hex");
  const { data: row } = await admin
    .from("profile_emails")
    .select("profile_id, email, verify_expires_at")
    .eq("verify_token_hash", hash)
    .maybeSingle();
  if (!row) return { kind: "invalid" };

  const consume = (fields: Record<string, unknown> = {}) =>
    admin
      .from("profile_emails")
      .update({ ...fields, verify_token_hash: null, verify_expires_at: null })
      .eq("profile_id", row.profile_id)
      .eq("email", row.email);

  if (!row.verify_expires_at || new Date(row.verify_expires_at) < new Date()) {
    await consume();
    return { kind: "expired" };
  }

  const { data: other } = await admin
    .from("profile_emails")
    .select("profile_id")
    .eq("email", row.email)
    .eq("verified", true)
    .neq("profile_id", row.profile_id)
    .maybeSingle();
  if (other) {
    await consume();
    return { kind: "taken", email: row.email };
  }

  const { error } = await consume({ verified: true });
  if (error?.code === "23505") {
    await consume();
    return { kind: "taken", email: row.email };
  }
  if (error) return { kind: "invalid" };
  return { kind: "verified", email: row.email };
}

export default async function VerifyEmailPage({ searchParams }: PageProps<"/verify-email">) {
  const { token } = await searchParams;
  const result = await verifyToken(typeof token === "string" ? token : undefined);

  const copy = {
    verified: { title: "Email verified", body: "It now signs you in to your account." },
    taken: {
      title: "Already linked to another account",
      body: "This email is already verified on a different account, so we didn't add it here. Log in with it to use that account.",
    },
    expired: { title: "Link expired", body: "Verification links last 24 hours. Add the email again from your profile." },
    invalid: { title: "Link not valid", body: "This link was already used or isn't valid. Add the email again from your profile." },
  }[result.kind];

  return (
    <div className="space-y-3">
      <h1 className="text-2xl font-semibold">{copy.title}</h1>
      {"email" in result && <p className="break-all font-medium">{result.email}</p>}
      <p>{copy.body}</p>
      <Link href="/profile" className="underline">
        Go to your profile
      </Link>
    </div>
  );
}
