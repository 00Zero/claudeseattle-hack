"use client";

import { startTransition, useActionState, useRef, useState } from "react";
import { checkIn, type CheckInState } from "./actions";

const button = "rounded bg-foreground px-4 py-2 text-background disabled:opacity-40";

// Asks the browser for its position, then checks in with it (or with why there was none).
export function CheckInButton({ label }: { label: string }) {
  const [state, formAction, pending] = useActionState<CheckInState, FormData>(checkIn, { status: "idle" });
  const [locating, setLocating] = useState(false);
  const sent = useRef(false);
  const fallback = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Exactly one submit per tap: the position, the browser's error, or the fallback below.
  function submit(fields: Record<string, string>) {
    if (sent.current) return;
    sent.current = true;
    clearTimeout(fallback.current);
    const data = new FormData();
    Object.entries(fields).forEach(([key, value]) => data.set(key, value));
    setLocating(false);
    startTransition(() => formAction(data));
  }

  function onClick() {
    sent.current = false;
    if (!("geolocation" in navigator)) return submit({ gps_error: "unsupported" });
    setLocating(true);
    // Safari never calls back if the permission prompt is dismissed or ignored (its timeout only
    // starts after permission), so check in without a position after 20 seconds.
    fallback.current = setTimeout(() => submit({ gps_error: "timeout" }), 20_000);
    navigator.geolocation.getCurrentPosition(
      (p) =>
        submit({
          lat: String(p.coords.latitude),
          lon: String(p.coords.longitude),
          accuracy: String(p.coords.accuracy),
        }),
      (e) =>
        submit({
          gps_error: e.code === e.PERMISSION_DENIED ? "denied" : e.code === e.TIMEOUT ? "timeout" : "unavailable",
        }),
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 60_000 },
    );
  }

  return (
    <div className="space-y-2">
      <button type="button" onClick={onClick} disabled={locating || pending} className={button}>
        {locating ? "Getting your location…" : pending ? "Checking in…" : label}
      </button>
      {state.status === "error" && <p className="text-sm text-red-600">{state.message}</p>}
    </div>
  );
}
