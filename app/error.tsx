"use client";

import Link from "next/link";

// Shown when a page fails on the server, most often when the database is too slow to answer
// within the Supabase clients' 10-second timeout (lib/supabase/fetch-timeout.ts).
export default function ErrorPage({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <div className="mx-auto max-w-sm space-y-4">
      <h1 className="text-2xl font-semibold">This page didn&apos;t load</h1>
      <p>The site is busy or couldn&apos;t reach the database. Wait a few seconds and try again.</p>
      <div className="flex gap-2">
        <button type="button" onClick={() => retry()} className="btn">
          Try again
        </button>
        <Link href="/" prefetch={false} className="btn btn-ghost">
          Home
        </Link>
      </div>
    </div>
  );
}
