"use client";

import { useState } from "react";
import { useNow } from "./use-now";
import { getWifi } from "./wifi-action";

type Details = { network: string; password: string };

function CopyValue({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard blocked: the value is on screen to copy by hand.
    }
  }

  return (
    <li className="flex flex-wrap items-baseline justify-between gap-3">
      <span>{label}</span>
      <button type="button" onClick={copy} className="cursor-copy text-fg hover:text-accent" title={`Copy ${label.toLowerCase()}`}>
        {value} <span className="text-fg-faint">{copied ? "copied" : "⧉"}</span>
      </button>
    </li>
  );
}

// The card shows from an hour before the event opens until half an hour after it closes.
const SHOW_BEFORE_MS = 60 * 60_000;
const SHOW_AFTER_MS = 30 * 60_000;

// Venue Wi-Fi during the event only (the home page skips it when none is saved), hidden until
// clicked; each value copies on click.
export function Wifi({ openAt, closeAt }: { openAt: string; closeAt: string }) {
  const [state, setState] = useState<"hidden" | "loading" | "missing" | Details>("hidden");
  const now = useNow();

  // null on the server and during hydration, so the card only ever appears in the browser.
  if (now === null || now < Date.parse(openAt) - SHOW_BEFORE_MS || now > Date.parse(closeAt) + SHOW_AFTER_MS) return null;

  async function reveal() {
    setState("loading");
    setState((await getWifi()) ?? "missing");
  }

  return (
    <section aria-label="Venue Wi-Fi" className="grid gap-2 rounded-lg border border-line bg-bg-raised p-4 font-mono text-xs text-fg-muted">
      <span className="text-fg-faint">Wi-Fi at the venue</span>
      {typeof state === "object" ? (
        <ul className="grid gap-2">
          <CopyValue label="Network" value={state.network} />
          <CopyValue label="Password" value={state.password} />
        </ul>
      ) : state === "missing" ? (
        <span>Ask at check-in.</span>
      ) : (
        <button type="button" onClick={reveal} disabled={state === "loading"} className="justify-self-start text-fg hover:text-accent">
          {state === "loading" ? "Loading…" : "▸ Show network and password"}
        </button>
      )}
    </section>
  );
}
