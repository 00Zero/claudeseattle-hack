import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { DEFAULT_EMAILS } from "./emails";
import { GROUPS, type Group } from "./survey";

export type Template = { subject: string; body: string; edited: boolean; updated_at: string | null };

// Each group's email: the admin's saved edit, or the default from lib/followup/emails.ts.
export async function getTemplates(): Promise<Record<Group, Template>> {
  const { data, error } = await createAdminClient().from("followup_emails").select("grp, subject, body, updated_at");
  if (error) throw new Error(error.message);
  const saved = new Map((data ?? []).map((row) => [row.grp as Group, row]));
  return Object.fromEntries(
    GROUPS.map((g) => {
      const row = saved.get(g);
      return [g, row ? { subject: row.subject, body: row.body, edited: true, updated_at: row.updated_at } : { ...DEFAULT_EMAILS[g], edited: false, updated_at: null }];
    }),
  ) as Record<Group, Template>;
}
