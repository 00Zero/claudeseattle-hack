import Link from "next/link";
import { confirmSignIn } from "./actions";

// Magic-link landing page. The sign-in happens when the button is pressed,
// not on page load, so link scanners in email clients can't use up the link.
export default async function ConfirmPage({ searchParams }: PageProps<"/auth/confirm">) {
  const params = await searchParams;
  const value = (key: string) => (typeof params[key] === "string" ? (params[key] as string) : "");
  const tokenHash = value("token_hash");
  const code = value("code");

  if (!tokenHash && !code) {
    return (
      <div className="mx-auto max-w-sm space-y-3">
        <h1 className="text-2xl font-semibold">Link not valid</h1>
        <p>This sign-in link is incomplete.</p>
        <Link href="/login" className="underline">
          Request a new link
        </Link>
      </div>
    );
  }

  return (
    <form action={confirmSignIn} className="mx-auto max-w-sm space-y-4">
      <h1 className="text-2xl font-semibold">Sign in to Claude Seattle</h1>
      <input type="hidden" name="token_hash" value={tokenHash} />
      <input type="hidden" name="type" value={value("type") || "email"} />
      <input type="hidden" name="code" value={code} />
      <button type="submit" className="w-full rounded bg-foreground px-4 py-3 text-background">
        Continue
      </button>
    </form>
  );
}
