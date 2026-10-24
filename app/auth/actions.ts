"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ADMIN_RETURN_COOKIE } from "@/lib/test-accounts";

// Signs out this browser only. Supabase's default scope ("global") would end the user's
// sessions on every device.
export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut({ scope: "local" });
  (await cookies()).delete(ADMIN_RETURN_COOKIE);
  redirect("/login");
}
