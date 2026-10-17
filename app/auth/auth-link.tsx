"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { signOut } from "./actions";

// Nav "Log in" / "Log out". The root layout persists across navigations, so the
// server-rendered state can go stale (for example, after signing in from the
// email link in another tab). Re-check the session cookie on every page change.
export function AuthLink({ initialSignedIn }: { initialSignedIn: boolean }) {
  const [signedIn, setSignedIn] = useState(initialSignedIn);
  const pathname = usePathname();

  useEffect(() => {
    const supabase = createClient();
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (active) setSignedIn(Boolean(data.session));
    });
    const { data } = supabase.auth.onAuthStateChange((_event, session) => setSignedIn(Boolean(session)));
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, [pathname]);

  if (!signedIn) {
    return (
      <Link href="/login" className="hover:underline">
        Log in
      </Link>
    );
  }
  return (
    <form action={signOut}>
      <button type="submit" className="hover:underline">
        Log out
      </button>
    </form>
  );
}
