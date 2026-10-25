import "server-only";
import { createClient } from "@supabase/supabase-js";
import { fetchWithTimeout } from "./fetch-timeout";

// Service-role client: bypasses RLS and column grants.
// Use only in server actions and route handlers, and only after a server-side
// check (for admin writes: the caller's profile has platform_role = 'admin').
// Never import this from a Client Component.
// 30-second timeout, not 10 like the others: admin jobs such as the Luma import write in bulk.
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: fetchWithTimeout(30_000) } },
  );
}
