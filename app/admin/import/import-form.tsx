"use client";

import Link from "next/link";
import { useActionState } from "react";
import { importLumaCsv, type ImportState } from "./actions";

export function ImportForm() {
  const [state, formAction, pending] = useActionState<ImportState, FormData>(importLumaCsv, { status: "idle" });

  return (
    <div className="space-y-4">
      <form action={formAction} className="flex flex-wrap items-center gap-3">
        <input type="file" name="file" accept=".csv,text/csv" required className="text-sm" />
        <button type="submit" disabled={pending} className="rounded bg-foreground px-4 py-2 text-background disabled:opacity-50">
          {pending ? "Importing…" : "Import"}
        </button>
        <label className="flex w-full items-center gap-2 text-sm text-foreground/70">
          <input type="checkbox" name="allow_unmapped" />
          Import even if some ticket names have no access rule (those guests get profile-only access)
        </label>
      </form>

      {state.status === "error" && (
        <div className="text-sm text-red-600">
          <p>{state.message}</p>
          {state.missingColumns?.length ? <p>Columns not found: {state.missingColumns.join(", ")}</p> : null}
          {state.unmappedInFile?.length ? (
            <>
              <ul className="list-disc pl-5">
                {state.unmappedInFile.map((u) => (
                  <li key={u.ticket_name + u.approval_status}>
                    {u.ticket_name || "(no ticket)"} / {u.approval_status}: {u.guests} guest{u.guests === 1 ? "" : "s"}
                  </li>
                ))}
              </ul>
              <Link href="/admin/settings" className="underline">
                Add rules in Settings
              </Link>
            </>
          ) : null}
        </div>
      )}

      {state.status === "ok" && (
        <div className="space-y-3 rounded border border-foreground/20 p-4 text-sm">
          <dl className="grid grid-cols-3 gap-4">
            <div>
              <dt className="text-foreground/60">Inserted</dt>
              <dd className="text-2xl font-semibold">{state.inserted}</dd>
            </div>
            <div>
              <dt className="text-foreground/60">Updated</dt>
              <dd className="text-2xl font-semibold">{state.updated}</dd>
            </div>
            <div>
              <dt className="text-foreground/60">Newly linked profiles</dt>
              <dd className="text-2xl font-semibold">{state.newlyLinked}</dd>
            </div>
          </dl>
          {state.skipped.map((s) => (
            <p key={s.reason} className="text-red-600">
              Skipped {s.count} row{s.count === 1 ? "" : "s"}: {s.reason}
            </p>
          ))}
          {state.missingColumns.length > 0 && (
            <p className="text-amber-700">Columns not found (left empty): {state.missingColumns.join(", ")}</p>
          )}
          {state.unmapped.length > 0 && (
            <div className="text-amber-700">
              <p className="font-medium">Ticket and status pairs with no access rule (treated as profile only):</p>
              <ul className="list-disc pl-5">
                {state.unmapped.map((u) => (
                  <li key={u.ticket_name + u.approval_status}>
                    {u.ticket_name || "(no ticket)"} / {u.approval_status}: {u.guests} guest{u.guests === 1 ? "" : "s"}
                  </li>
                ))}
              </ul>
              <Link href="/admin/settings" className="underline">
                Add rules in Settings
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
