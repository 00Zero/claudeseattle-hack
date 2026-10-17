import Link from "next/link";
import { AutoSubmitForm } from "./auto-submit-form";

// Magic-link landing page. The token is used by a POST from this page (sent
// automatically on load), not by the GET itself, so link scanners in email
// clients that only fetch the URL can't use up the link.
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

  return <AutoSubmitForm tokenHash={tokenHash} type={value("type") || "email"} code={code} />;
}
