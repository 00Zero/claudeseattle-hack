"use client";

import { useEffect, useRef } from "react";

// Posts the sign-in form as soon as the page loads, so people don't have to
// click twice. The button stays as a fallback if scripts are slow or blocked.
export function AutoSubmitForm({ tokenHash, type, code }: { tokenHash: string; type: string; code: string }) {
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    form.current?.requestSubmit();
  }, []);

  return (
    <form ref={form} method="post" action="/auth/confirm/verify" className="mx-auto max-w-sm space-y-4">
      <h1 className="text-2xl font-semibold">Signing you in…</h1>
      <input type="hidden" name="token_hash" value={tokenHash} />
      <input type="hidden" name="type" value={type} />
      <input type="hidden" name="code" value={code} />
      <button type="submit" className="w-full rounded bg-foreground px-4 py-3 text-background">
        Continue
      </button>
    </form>
  );
}
