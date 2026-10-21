"use server";

import { revalidatePath } from "next/cache";
import { assertSuperAdmin } from "@/lib/admin";
import { cleanRow, type EnrichmentRow } from "@/lib/enrichment";
import { createAdminClient } from "@/lib/supabase/admin";

export type BatchResult = { ok: true; stored: number; rejected: number } | { ok: false; message: string };

const MAX_BATCH = 100;

// One batch of rows the browser normalized (lib/enrichment.ts). Super admins only. Every row
// is checked again here, since the browser can send anything; rows that fail are counted, not stored.
export async function importEnrichmentBatch(rows: unknown): Promise<BatchResult> {
  await assertSuperAdmin();
  if (!Array.isArray(rows) || rows.length === 0 || rows.length > MAX_BATCH) {
    return { ok: false, message: `Send 1 to ${MAX_BATCH} rows at a time.` };
  }
  const clean = rows.map(cleanRow).filter((r): r is EnrichmentRow => r !== null);
  if (clean.length > 0) {
    const { error } = await createAdminClient()
      .from("linkedin_enrichment")
      .upsert(clean, { onConflict: "linkedin_slug,source" });
    if (error) return { ok: false, message: `Couldn't store the batch: ${error.message}` };
  }
  revalidatePath("/admin/enrichment");
  return { ok: true, stored: clean.length, rejected: rows.length - clean.length };
}
