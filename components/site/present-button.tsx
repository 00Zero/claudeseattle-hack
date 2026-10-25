"use client";

import { useRouter } from "next/navigation";
import { enterFullscreen, rememberReturnPath } from "@/app/slides/slide-store";

function PresentIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="2.5" y="3.5" width="19" height="13" rx="1.5" />
      <path d="M12 16.5v4M8 20.5h8" />
      <path d="M10 7.5v5l4.2-2.5z" fill="currentColor" stroke="none" />
    </svg>
  );
}

// Super admins only (the layout decides): opens the kickoff deck at /slides in
// full screen. The deck remembers its slide, so this picks up where the last run left off.
export function PresentButton() {
  const router = useRouter();

  function present() {
    // Full screen first, while the click still counts as a user gesture; it survives the
    // client-side navigation because it's on <html>, not on the deck.
    enterFullscreen();
    rememberReturnPath(window.location.pathname + window.location.search + window.location.hash);
    router.push("/slides");
  }

  return (
    <button
      type="button"
      onClick={present}
      aria-label="Present the kickoff slides"
      title="Present the kickoff slides"
      className="inline-flex items-center rounded border border-line px-2 py-1 text-fg hover:bg-fg/5 hover:text-accent"
    >
      <PresentIcon />
    </button>
  );
}
