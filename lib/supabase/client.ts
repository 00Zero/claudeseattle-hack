import { createBrowserClient } from "@supabase/ssr";

// Browser client for Client Components. Runs as the logged-in user; RLS applies.
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
