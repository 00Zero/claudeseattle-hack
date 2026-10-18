"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { signOut } from "./actions";

// Nav "Log in" / "Log out". The root layout persists across navigations, so the
// server-rendered nav can go stale (for example, after signing in from the
// email link in another tab). Re-check the session cookie on every page change;
// if it no longer matches what the server rendered, refresh so the whole nav
// (including the Admin link) is rendered again with the current session.
export function AuthLink({ initialSignedIn }: { initialSignedIn: boolean }) {
  const [signedIn, setSignedIn] = useState(initialSignedIn);
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();
    let active = true;
    const update = (now: boolean) => {
      if (!active) return;
      setSignedIn(now);
      if (now !== initialSignedIn) router.refresh();
    };
    supabase.auth.getSession().then(({ data }) => update(Boolean(data.session)));
    const { data } = supabase.auth.onAuthStateChange((_event, session) => update(Boolean(session)));
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, [pathname, initialSignedIn, router]);

  // Styled as a slash command to match the title bar in app/layout.tsx.
  const cmd = "rounded border border-line-strong px-2 py-1 text-fg hover:bg-fg/5";
  if (!signedIn) {
    return (
      <Link href="/login" className={cmd}>
        <span className="text-accent">/</span>login
      </Link>
    );
  }
  return (
    <form action={signOut}>
      <button type="submit" className={cmd}>
        <span className="text-accent">/</span>logout
      </button>
    </form>
  );
}
