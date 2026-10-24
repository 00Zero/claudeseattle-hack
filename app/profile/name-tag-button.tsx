"use client";

import { useActionState, useEffect, useState } from "react";
import { requestNameTag, type NameTagState } from "./name-tag-actions";

const idle: NameTagState = { status: "idle" };

function formatWait(ms: number) {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

// "Print my name tag": one click queues the tag, then the button stays grayed out and the note
// under it counts down until the 5-minute wait is over (the server enforces the same wait).
export function NameTagButton({ preview, initialRetryAt }: { preview: string; initialRetryAt: number | null }) {
  const [state, action, pending] = useActionState(async () => requestNameTag(), idle);
  const retryAt = state.status === "printing" || state.status === "wait" ? state.retryAt : initialRetryAt;

  // Ticks once a second while waiting. Starts null so the server and first client render match.
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    if (!retryAt) return;
    const tick = () => setNow(Date.now());
    const first = setTimeout(tick, 0);
    const timer = setInterval(tick, 1000);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [retryAt]);
  const waiting = retryAt !== null && (now === null || now < retryAt);
  const left = retryAt !== null && now !== null ? formatWait(retryAt - now) : null;

  return (
    <div className="space-y-3 rounded border border-foreground/20 p-4">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold">Name tag</h2>
        <p className="text-sm text-foreground/70">
          Your tag will show: <span className="text-foreground">{preview}</span>. Edit your profile below to change it.
        </p>
      </div>

      <form action={action}>
        <button
          type="submit"
          disabled={pending || waiting}
          className="rounded bg-foreground px-4 py-2 text-background disabled:cursor-not-allowed disabled:opacity-40"
        >
          {pending ? "Sending…" : "Print my name tag"}
        </button>
      </form>

      {state.status === "error" && (
        <p className="text-sm text-red-600" role="status">
          {state.message}
        </p>
      )}
      {waiting && (
        <div className="space-y-1 rounded bg-green-600/10 p-3 text-sm" role="status">
          <p className="font-medium">
            {state.status === "printing"
              ? "Your name tag is printing. Go pick it up at the name tag printer."
              : "Your name tag was sent to the printer. Pick it up at the name tag printer."}
          </p>
          <p className="text-foreground/70">
            If your name tag doesn&apos;t print, you can try again in{" "}
            <span className="tabular-nums">{left ?? "5:00"}</span>.
          </p>
        </div>
      )}
    </div>
  );
}
