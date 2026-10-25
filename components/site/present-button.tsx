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

function TrophyIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M7 4h10v5a5 5 0 0 1-10 0V4z" />
      <path d="M7 6H4v1.5A3.5 3.5 0 0 0 7.5 11M17 6h3v1.5a3.5 3.5 0 0 1-3.5 3.5" />
      <path d="M12 14v3M8.5 20.5h7M9.5 17.5h5" />
    </svg>
  );
}

const DECKS = {
  kickoff: { href: "/slides", label: "Present the kickoff slides", icon: <PresentIcon /> },
  awards: { href: "/slides/awards", label: "Present the finalists and winners", icon: <TrophyIcon /> },
};

// Super admins only (the layout decides): opens a deck (kickoff at /slides, awards at
// /slides/awards) in full screen. Each deck remembers its slide, so this picks up where the
// last run left off.
export function PresentButton({ deck = "kickoff" }: { deck?: keyof typeof DECKS }) {
  const router = useRouter();
  const { href, label, icon } = DECKS[deck];

  function present() {
    // Full screen first, while the click still counts as a user gesture; it survives the
    // client-side navigation because it's on <html>, not on the deck.
    enterFullscreen();
    rememberReturnPath(window.location.pathname + window.location.search + window.location.hash);
    router.push(href);
  }

  return (
    <button
      type="button"
      onClick={present}
      aria-label={label}
      title={label}
      className="inline-flex items-center rounded border border-line px-2 py-1 text-fg hover:bg-fg/5 hover:text-accent"
    >
      {icon}
    </button>
  );
}
