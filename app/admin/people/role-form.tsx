"use client";

import { useActionState } from "react";
import { setPlatformRole, type RoleState } from "./actions";

const ROLES = ["participant", "mentor", "volunteer", "judge", "admin"];

// Role dropdown for one person. Admin is only selectable by super admins, and
// admins can only be changed by super admins; the server re-checks both.
export function RoleForm({
  profileId,
  role,
  isSuperAdmin,
  viewerIsSuperAdmin,
}: {
  profileId: string;
  role: string;
  isSuperAdmin: boolean;
  viewerIsSuperAdmin: boolean;
}) {
  const [state, formAction, pending] = useActionState<RoleState, FormData>(setPlatformRole, { status: "idle" });

  if (isSuperAdmin) return <span className="rounded bg-foreground px-2 py-0.5 text-xs text-background">super admin</span>;
  const locked = role === "admin" && !viewerIsSuperAdmin;

  return (
    <form action={formAction} className="flex flex-wrap items-center gap-1">
      <input type="hidden" name="profile_id" value={profileId} />
      <select
        key={role}
        name="platform_role"
        defaultValue={role}
        disabled={locked || pending}
        title={locked ? "Only a super admin can change an admin" : undefined}
        className="rounded border border-foreground/20 bg-background text-xs disabled:opacity-60"
      >
        {ROLES.map((r) => (
          <option key={r} value={r} disabled={r === "admin" && !viewerIsSuperAdmin}>
            {r}
          </option>
        ))}
      </select>
      {!locked && (
        <button
          type="submit"
          disabled={pending}
          className="rounded border border-foreground/20 px-2 py-0.5 text-xs hover:bg-foreground/5 disabled:cursor-wait disabled:opacity-50"
        >
          {pending ? "Saving…" : "Set"}
        </button>
      )}
      {state.status === "error" && <span className="w-full text-xs text-red-600">{state.message}</span>}
    </form>
  );
}
