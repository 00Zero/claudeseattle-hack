"use server";

import { revalidatePath } from "next/cache";
import { assertAdmin } from "@/lib/admin";
import { parseLumaCsv } from "@/lib/luma";
import { createAdminClient } from "@/lib/supabase/admin";

export type ImportState =
  | { status: "idle" }
  | {
      status: "error";
      message: string;
      missingColumns?: string[];
      // Ticket and status pairs in the file with no access rule; set when the import was held back.
      unmappedInFile?: { ticket_name: string; approval_status: string; guests: number }[];
    }
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

  // A renamed or new ticket in Luma would leave its guests at profile-only access, so
  // hold the import back until there are rules for it, unless the admin confirms.
  const { data: rules, error: rulesError } = await admin.from("access_rules").select("ticket_name, approval_status");
  if (rulesError) return { status: "error", message: "Couldn't read the access rules." };
  const ruled = new Set(rules.map((r) => `${r.ticket_name}\n${r.approval_status}`));
  const unmappedInFile = new Map<string, { ticket_name: string; approval_status: string; guests: number }>();
  for (const row of parsed.rows) {
    const key = `${row.ticket_name}\n${row.approval_status}`;
    if (ruled.has(key)) continue;
    const entry = unmappedInFile.get(key) ?? { ticket_name: row.ticket_name, approval_status: row.approval_status, guests: 0 };
    entry.guests++;
    unmappedInFile.set(key, entry);
  }
  if (unmappedInFile.size > 0 && formData.get("allow_unmapped") !== "on") {
    return {
      status: "error",
      message: "Nothing imported: this file has ticket names with no access rule. Add them in Settings, or tick the box to import anyway.",
      unmappedInFile: [...unmappedInFile.values()],
    };
  }

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
