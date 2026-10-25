"use client";

import { useActionState, useState } from "react";
import { approveStandby, type ApproveState } from "./actions";

export type StandbyRow = {
  guestId: string;
  profileId: string | null; // null: hasn't signed in to the site yet
  name: string;
  email: string; // Luma registration email, the one to find on Luma
  role: string | null;
  work: string | null;
  technicalLevel: number | null;
  profileConfirmed: boolean;
  order: number | null; // check-in order among everyone checked in
  checkedInAt: string | null;
  location: { verdict: "on_site" | "near" | "far" | "unknown"; detail: string; ipDetail: string | null; venueIp: boolean } | null;
  approvedHere: boolean;
  lumaStatus: string;
};

const th = "py-1.5 pr-3 font-medium";
const td = "py-2 pr-3 align-top";
const small = "rounded border border-foreground/20 px-2 py-1 text-sm enabled:hover:bg-foreground/5 disabled:opacity-40";
const VERDICT: Record<string, [string, string]> = {
  on_site: ["On site", "bg-green-600/15 text-green-800"],
  near: ["Nearby", "bg-amber-500/15 text-amber-800"],
  far: ["Far away", "bg-red-600/15 text-red-800"],
  unknown: ["No GPS", "bg-foreground/10 text-foreground/70"],
};

const time = (iso: string) =>
  new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/Los_Angeles" });

// Pick people, approve them here, and copy their Luma emails to approve them on Luma.
export function StandbyTable({ rows }: { rows: StandbyRow[] }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [onlyWaiting, setOnlyWaiting] = useState(true);
  const [copied, setCopied] = useState(false);
  const [state, formAction, pending] = useActionState<ApproveState, FormData>(async (prev, data) => {
    const result = await approveStandby(prev, data);
    if (result.status === "ok") setSelected(new Set());
    return result;
  }, { status: "idle" });

  const shown = rows.filter((r) => !onlyWaiting || (r.checkedInAt && !r.approvedHere));
  const selectable = (r: StandbyRow) => r.profileId != null && !r.approvedHere;
  const picked = rows.filter((r) => selected.has(r.guestId));
  const toggle = (id: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const justApproved = rows.filter((r) => r.profileId && state.approvedIds?.includes(r.profileId));
  const emailList = (list: StandbyRow[]) => list.map((r) => r.email).join("\n");

  async function copy(text: string) {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={onlyWaiting} onChange={(e) => setOnlyWaiting(e.target.checked)} />
          Only checked in and still waiting
        </label>
        <button
          type="button"
          className={small}
          onClick={() => setSelected(new Set(shown.filter(selectable).filter((r) => r.location?.verdict === "on_site").map((r) => r.guestId)))}
        >
          Select everyone on site
        </button>
        <button type="button" className={small} disabled={!selected.size} onClick={() => setSelected(new Set())}>
          Clear selection
        </button>
      </div>

      <form action={formAction} className="sticky top-0 z-10 flex flex-wrap items-center gap-2 rounded border border-foreground/15 bg-background p-2">
        {picked.map((r) => r.profileId && <input key={r.guestId} type="hidden" name="profile_id" value={r.profileId} />)}
        <span className="text-sm font-medium">{picked.length} selected</span>
        <button type="submit" disabled={pending || !picked.length} className="rounded bg-foreground px-3 py-1 text-sm text-background disabled:opacity-40">
          {pending ? "Approving…" : `Approve ${picked.length || ""} on the platform`}
        </button>
        <button type="button" className={small} disabled={!picked.length} onClick={() => copy(emailList(picked))}>
          Copy their Luma emails
        </button>
        {copied && <span className="text-xs text-foreground/70">Copied</span>}
        {state.message && (
          <span className={`w-full text-sm ${state.status === "error" ? "text-red-600" : "text-green-700"}`}>{state.message}</span>
        )}
        {justApproved.length > 0 && (
          <div className="w-full space-y-1">
            <textarea readOnly value={emailList(justApproved)} rows={Math.min(8, justApproved.length)} className="w-full rounded border border-foreground/20 bg-background p-2 font-mono text-xs" />
            <button type="button" className={small} onClick={() => copy(emailList(justApproved))}>
              Copy these {justApproved.length} emails
            </button>
          </div>
        )}
      </form>

      <div className="overflow-x-auto rounded border border-foreground/15">
        <table className="w-full text-left text-sm">
          <thead className="bg-foreground/5 text-foreground/70">
            <tr>
              <th className={`${th} pl-3`} />
              <th className={th}>#</th>
              <th className={th}>Name</th>
              <th className={th}>Role</th>
              <th className={th}>Tech</th>
              <th className={th}>Checked in</th>
              <th className={th}>Location</th>
              <th className={th}>Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-foreground/10">
            {shown.map((r) => (
              <tr key={r.guestId} className={selected.has(r.guestId) ? "bg-foreground/5" : undefined}>
                <td className={`${td} pl-3`}>
                  <input
                    type="checkbox"
                    aria-label={`Select ${r.name}`}
                    disabled={!selectable(r)}
                    checked={selected.has(r.guestId)}
                    onChange={() => toggle(r.guestId)}
                  />
                </td>
                <td className={td}>{r.order ?? ""}</td>
                <td className={td}>
                  {r.name}
                  <span className="block break-all text-xs text-foreground/60">{r.email}</span>
                  {!r.profileId ? (
                    <span className="block text-xs text-foreground/50">hasn&apos;t signed in</span>
                  ) : (
                    !r.profileConfirmed && <span className="block text-xs text-foreground/50">profile not confirmed</span>
                  )}
                </td>
                <td className={td}>
                  {r.role ?? "—"}
                  {r.work && <span className="block text-xs text-foreground/60">{r.work}</span>}
                </td>
                <td className={td}>{r.technicalLevel ?? "—"}</td>
                <td className={`${td} whitespace-nowrap`}>{r.checkedInAt ? time(r.checkedInAt) : "—"}</td>
                <td className={td}>
                  {r.location ? (
                    <>
                      <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${VERDICT[r.location.verdict][1]}`}>
                        {VERDICT[r.location.verdict][0]}
                      </span>
                      <span className="block text-xs text-foreground/60">{r.location.detail}</span>
                      {r.location.ipDetail && (
                        <span className="block text-xs text-foreground/60">
                          {r.location.ipDetail}
                          {r.location.venueIp && " · same IP as an on-site check-in"}
                        </span>
                      )}
                    </>
                  ) : (
                    "—"
                  )}
                </td>
                <td className={`${td} whitespace-nowrap`}>
                  {r.approvedHere ? (
                    <span className="rounded bg-green-600/15 px-1.5 py-0.5 text-xs font-medium text-green-800">approved here</span>
                  ) : (
                    <span className="text-xs text-foreground/70">standby</span>
                  )}
                  <span className="block text-xs text-foreground/50">Luma: {r.lumaStatus.replace("_approval", "")}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {shown.length === 0 && <p className="p-3 text-sm">Nobody here yet.</p>}
      </div>
    </div>
  );
}
