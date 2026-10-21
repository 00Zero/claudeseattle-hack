"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { newestRows, parseEnrichmentFile, type EnrichmentRow } from "@/lib/enrichment";
import { importEnrichmentBatch } from "./actions";

// Server Actions accept 1 MB per request; stay well under it.
const BATCH_BYTES = 600_000;
const BATCH_ROWS = 100;

type Preview = { rows: EnrichmentRow[]; skipped: number; errors: string[] };

function batches(rows: EnrichmentRow[]) {
  const out: EnrichmentRow[][] = [];
  let current: EnrichmentRow[] = [];
  let bytes = 0;
  for (const row of rows) {
    const size = JSON.stringify(row).length;
    if (current.length > 0 && (bytes + size > BATCH_BYTES || current.length >= BATCH_ROWS)) {
      out.push(current);
      current = [];
      bytes = 0;
    }
    current.push(row);
    bytes += size;
  }
  if (current.length > 0) out.push(current);
  return out;
}

// Reads Apify or EnrichLayer exports in the browser, normalizes and trims them with the same
// code as scripts/import-linkedin-enrichment.ts, previews the counts, then sends compact rows in
// batches. The original files never leave this computer.
export function UploadForm({ guestSlugs }: { guestSlugs: string[] }) {
  const router = useRouter();
  const [preview, setPreview] = useState<Preview | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const guests = new Set(guestSlugs);

  async function read(files: FileList | null) {
    setStatus(null);
    if (!files || files.length === 0) return setPreview(null);
    const rows: EnrichmentRow[] = [];
    const errors: string[] = [];
    let skipped = 0;
    for (const file of Array.from(files)) {
      try {
        // Apify items carry no fetch time; the file's time stands in.
        const parsed = parseEnrichmentFile(JSON.parse(await file.text()), new Date(file.lastModified).toISOString());
        if (!parsed) errors.push(`${file.name}: not an Apify or EnrichLayer export`);
        else {
          rows.push(...parsed.rows);
          skipped += parsed.skipped;
        }
      } catch {
        errors.push(`${file.name}: not valid JSON`);
      }
    }
    setPreview({ rows: newestRows(rows), skipped, errors });
  }

  async function upload() {
    if (!preview) return;
    setBusy(true);
    const parts = batches(preview.rows);
    let stored = 0;
    let rejected = 0;
    for (const [i, part] of parts.entries()) {
      setStatus(`Importing batch ${i + 1} of ${parts.length}…`);
      const result = await importEnrichmentBatch(part);
      if (!result.ok) {
        setStatus(`Stopped at batch ${i + 1} of ${parts.length} after ${stored} rows: ${result.message}`);
        setBusy(false);
        return;
      }
      stored += result.stored;
      rejected += result.rejected;
    }
    setStatus(`Imported ${stored} rows${rejected ? `; ${rejected} rejected by the server check` : ""}.`);
    setPreview(null);
    setBusy(false);
    router.refresh();
  }

  const bySource = (source: EnrichmentRow["source"]) => preview?.rows.filter((r) => r.source === source) ?? [];
  return (
    <div className="space-y-3">
      <input
        type="file"
        accept=".json,application/json"
        multiple
        disabled={busy}
        onChange={(e) => read(e.target.files)}
        className="text-sm"
      />
      {preview && (
        <div className="space-y-2 rounded border border-foreground/20 p-3 text-sm">
          {(["apify", "enrichlayer"] as const).map((source) => {
            const rows = bySource(source);
            if (rows.length === 0) return null;
            return (
              <p key={source}>
                <strong>{source === "apify" ? "Apify" : "EnrichLayer"}:</strong> {rows.length} profiles,{" "}
                {rows.filter((r) => guests.has(r.linkedin_slug)).length} match a Luma guest,{" "}
                {rows.filter((r) => r.skills.length > 0).length} with skills,{" "}
                {rows.filter((r) => r.summary).length} with a summary
              </p>
            );
          })}
          {preview.skipped > 0 && <p className="text-amber-700">Skipped {preview.skipped} records with no LinkedIn URL.</p>}
          {preview.errors.map((e) => (
            <p key={e} className="text-red-600">
              {e}
            </p>
          ))}
          <button
            type="button"
            onClick={upload}
            disabled={busy || preview.rows.length === 0}
            className="rounded bg-foreground px-4 py-2 text-background disabled:opacity-50"
          >
            {busy ? "Importing…" : `Import ${preview.rows.length} rows`}
          </button>
        </div>
      )}
      {status && <p className="text-sm" role="status">{status}</p>}
    </div>
  );
}

// Read-only text with a copy button, for pasting into Apify.
export function CopyBox({ label, text, rows = 6 }: { label: string; text: string; rows?: number }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium">{label}</span>
        <button
          type="button"
          onClick={async () => {
            await navigator.clipboard.writeText(text);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          }}
          className="rounded border border-foreground/20 px-2 py-0.5 text-xs hover:bg-foreground/5"
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <textarea
        readOnly
        value={text}
        rows={rows}
        className="w-full rounded border border-foreground/20 bg-background px-2 py-1 font-mono text-xs"
      />
    </div>
  );
}
