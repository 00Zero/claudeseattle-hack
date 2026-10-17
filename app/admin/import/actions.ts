"use server";

import { revalidatePath } from "next/cache";
import { assertAdmin } from "@/lib/admin";
import { parseLumaCsv } from "@/lib/luma";
import { createAdminClient } from "@/lib/supabase/admin";

export type ImportState =
  | { status: "idle" }
  | { status: "error"; message: string; missingColumns?: string[] }
  | {
      status: "ok";
      inserted: number;
      updated: number;
      newlyLinked: number;
      skipped: { reason: string; count: number }[];
      missingColumns: string[];
      unmapped: { ticket_name: string; approval_status: string; guests: number }[];
    };

const CHUNK = 200;

function chunks<T>(items: T[]) {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += CHUNK) out.push(items.slice(i, i + CHUNK));
  return out;
}

// Upserts the Luma guests CSV into luma_guests on guest_id. The file is read
// in memory only; it is never written to disk. The sync trigger links and
// refreshes profiles as rows land.
export async function importLumaCsv(_prev: ImportState, formData: FormData): Promise<ImportState> {
  await assertAdmin();

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { status: "error", message: "Choose the Luma guests CSV." };

  const parsed = parseLumaCsv(await file.text());
  if (parsed.rows.length === 0) {
    return {
      status: "error",
      message: "No guest rows found. Is this the Luma guests export?",
      missingColumns: parsed.missingColumns,
    };
  }

  const admin = createAdminClient();
  const linkedCount = async () => {
    const { count } = await admin
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .not("luma_guest_id", "is", null);
    return count ?? 0;
  };

  const existing = new Set<string>();
  for (const batch of chunks(parsed.rows.map((r) => r.guest_id))) {
    const { data, error } = await admin.from("luma_guests").select("guest_id").in("guest_id", batch);
    if (error) return { status: "error", message: "Couldn't read existing guests." };
    data.forEach((row) => existing.add(row.guest_id));
  }

  const linkedBefore = await linkedCount();
  const importedAt = new Date().toISOString();
  for (const batch of chunks(parsed.rows)) {
    const { error } = await admin
      .from("luma_guests")
      .upsert(batch.map((row) => ({ ...row, imported_at: importedAt })), { onConflict: "guest_id" });
    if (error) return { status: "error", message: `Import stopped partway: ${error.message}` };
  }
  const linkedAfter = await linkedCount();

  const { data: unmapped } = await admin.from("unmapped_luma_tickets").select("ticket_name, approval_status, guests");

  revalidatePath("/admin", "layout");
  return {
    status: "ok",
    inserted: parsed.rows.filter((r) => !existing.has(r.guest_id)).length,
    updated: parsed.rows.filter((r) => existing.has(r.guest_id)).length,
    newlyLinked: linkedAfter - linkedBefore,
    skipped: parsed.skipped,
    missingColumns: parsed.missingColumns,
    unmapped: unmapped ?? [],
  };
}
