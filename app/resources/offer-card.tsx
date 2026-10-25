"use client";

import { useState } from "react";
import type { AttendeeOffer, OfferLink } from "@/lib/offers";
import { logOfferClick } from "./actions";

function CopyIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="9" y="9" width="12" height="12" rx="2" />
      <path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  );
}

// Copies synchronously first (a hidden textarea and execCommand), because a redeem link opens a
// new tab right after the click and the async Clipboard API can fail once this page loses focus.
// Falls back to the Clipboard API where execCommand is unavailable.
async function copyText(text: string) {
  const area = document.createElement("textarea");
  area.value = text;
  area.setAttribute("readonly", "");
  area.style.position = "fixed";
  area.style.opacity = "0";
  area.style.fontSize = "16px"; // keeps iOS from zooming
  document.body.appendChild(area);
  area.select();
  area.setSelectionRange(0, text.length);
  let ok = false;
  try {
    ok = document.execCommand("copy");
  } catch {}
  area.remove();
  if (ok) return true;
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

// One sponsor offer. A link with a promo code copies the code when clicked, then opens the
// redemption page in a new tab, so the code is ready to paste there. The code also shows on the
// card with its own copy button. Locked offers (check-in required) show what they are, not the links.
// Each click is logged for the admin stats, in the background.
export function OfferCard({ offer }: { offer: AttendeeOffer }) {
  const [copied, setCopied] = useState<string | null>(null);

  async function copy(code: string) {
    if (await copyText(code)) setCopied(code);
  }

  function log(link: OfferLink, kind: "link" | "code") {
    logOfferClick(offer.slug, link.id, kind).catch(() => {});
  }

  function openLink(link: OfferLink) {
    if (link.code) copy(link.code);
    log(link, "link");
  }

  // One chip per distinct code, logged against the first link that carries it.
  const codeLinks = offer.links.filter((l, i, all) => l.code && all.findIndex((o) => o.code === l.code) === i);

  return (
    <article className="flex h-full flex-col gap-4 rounded-lg border border-line bg-bg-raised p-5">
      <header className="space-y-1.5">
        <p className="eyebrow">{offer.provider}</p>
        <h3 className="text-xl font-semibold text-fg">{offer.headline}</h3>
        <p className="text-sm text-fg-muted">{offer.about}</p>
      </header>

      {offer.details.length > 0 && (
        <ul className="space-y-1 text-sm">
          {offer.details.map((d) => (
            <li key={d} className="flex gap-2">
              <span aria-hidden="true" className="text-accent">
                ✓
              </span>
              <span>{d}</span>
            </li>
          ))}
        </ul>
      )}

      {offer.steps.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-sm font-semibold">How to redeem</p>
          <ol className="list-decimal space-y-1 pl-5 text-sm text-fg-muted marker:text-fg-faint">
            {offer.steps.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ol>
        </div>
      )}

      <div className="mt-auto space-y-3 border-t border-line pt-4">
        {!offer.unlocked ? (
          <p className="flex items-start gap-2 text-sm">
            <span className="mt-0.5 text-fg-faint">
              <LockIcon />
            </span>
            <span>
              <span className="font-medium">Unlocks when you check in at the event.</span>{" "}
              <span className="text-fg-muted">Checked in already? It can take a little while to show up here.</span>
            </span>
          </p>
        ) : offer.links.length === 0 ? (
          <p className="text-sm text-fg-muted">The link is on its way. Check back soon.</p>
        ) : (
          <>
            {codeLinks.map((link) => (
              <div key={link.code} className="flex flex-wrap items-center gap-2 text-sm">
                <span className="text-fg-muted">Promo code</span>
                <button
                  type="button"
                  onClick={() => {
                    copy(link.code!);
                    log(link, "code");
                  }}
                  className="inline-flex items-center gap-2 rounded border border-dashed border-line-strong bg-bg-sunken px-2.5 py-1 font-mono font-semibold tracking-wide hover:bg-fg/5"
                  aria-label={`Copy promo code ${link.code}`}
                >
                  {link.code}
                  <CopyIcon />
                </button>
              </div>
            ))}
            <div className="flex flex-wrap gap-2">
              {offer.links.map((link, i) => (
                <a
                  key={link.id}
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => openLink(link)}
                  className={i === 0 ? "btn" : "btn btn-ghost"}
                >
                  {link.label} ↗
                </a>
              ))}
            </div>
            <p role="status" className="min-h-5 text-sm text-live">
              {copied ? `Copied ${copied}. Paste it if the page asks for a code.` : ""}
            </p>
          </>
        )}
      </div>
    </article>
  );
}
