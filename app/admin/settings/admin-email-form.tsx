"use client";

import { useActionState } from "react";
import { addAdminEmail, type AllowlistState } from "./admin-email-actions";

const input = "rounded border border-foreground/20 bg-background px-2 py-1";

export function AdminEmailForm() {
  const [state, formAction, pending] = useActionState<AllowlistState, FormData>(addAdminEmail, { status: "idle" });
  return (
    <form action={formAction} className="space-y-2">
      <div className="flex flex-wrap items-end gap-2">
        <label className="block space-y-1">
          <span className="text-sm font-medium">Email</span>
          <input type="email" name="email" required placeholder="dev@example.com" className={input} />
        </label>
        <label className="block space-y-1">
          <span className="text-sm font-medium">Note (optional)</span>
          <input name="note" placeholder="Dev A, ambassador…" className={input} />
        </label>
        <button
          type="submit"
          disabled={pending}
          className="rounded bg-foreground px-3 py-1.5 text-sm text-background disabled:cursor-wait disabled:opacity-50"
        >
          {pending ? "Adding…" : "Add admin email"}
        </button>
      </div>
      {state.message && (
        <p className={`text-sm ${state.status === "error" ? "text-red-600" : "text-green-700"}`} role="status">
          {state.message}
        </p>
      )}
    </form>
  );
}
