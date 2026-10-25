"use client";

import { startTransition, useActionState, useState } from "react";
import { checkIn, type CheckInState } from "./actions";

const button = "rounded bg-foreground px-4 py-2 text-background disabled:opacity-40";

// Asks the browser for its position, then checks in with it (or with why there was none).
export function CheckInButton({ label }: { label: string }) {
  const [state, formAction, pending] = useActionState<CheckInState, FormData>(checkIn, { status: "idle" });
  const [locating, setLocating] = useState(false);

  function submit(fields: Record<string, string>) {
    const data = new FormData();
    Object.entries(fields).forEach(([key, value]) => data.set(key, value));
    setLocating(false);
    startTransition(() => formAction(data));
  }

  function onClick() {
    if (!("geolocation" in navigator)) return submit({ gps_error: "unsupported" });
    setLocating(true);
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
