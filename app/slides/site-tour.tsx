"use client";

import { useRef, useState } from "react";

// The "review the website" slide: the live site in a frame, with a tab per page worth showing.
// Keys pressed inside the frame are passed up, so a clicker still moves the deck after someone
// clicks into the preview.
const NAV_KEYS = new Set(["ArrowRight", "ArrowLeft", "PageDown", "PageUp", "Home", "End", "Escape"]);

export function SiteTour({ pages }: { pages: { path: string; label: string; note: string }[] }) {
  const [current, setCurrent] = useState(pages[0]);
  const frame = useRef<HTMLIFrameElement>(null);

  function forwardKeys() {
    const win = frame.current?.contentWindow;
    if (!win) return;
    win.addEventListener("keydown", (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))) return;
      if (!NAV_KEYS.has(event.key)) return;
      event.preventDefault();
      window.dispatchEvent(new KeyboardEvent("keydown", { key: event.key }));
    });
  }

  return (
    <div className="grid h-full grid-cols-[300px_1fr] gap-8" data-no-advance>
      <ul className="grid content-start gap-2">
        {pages.map((page) => (
          <li key={page.path}>
            <button
              type="button"
              onClick={() => setCurrent(page)}
              className={`grid w-full gap-1 rounded-lg border px-4 py-3 text-left transition-colors ${
                page.path === current.path ? "border-accent bg-accent-soft" : "border-line hover:bg-fg/5"
              }`}
            >
              <span className="font-mono text-xl">
                <span className="text-accent">/</span>
                {page.label}
              </span>
              <span className="text-base leading-snug text-fg-muted">{page.note}</span>
            </button>
          </li>
        ))}
      </ul>
      <div className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-line-strong bg-bg-raised shadow-2xl">
        <div className="flex items-center gap-2 border-b border-line px-4 py-2.5 font-mono text-base text-fg-muted">
          <span className="h-3 w-3 rounded-full bg-[#d97757]" />
          <span className="h-3 w-3 rounded-full bg-line-strong" />
          <span className="h-3 w-3 rounded-full bg-line-strong" />
          <span className="ml-3">hack.claudeseattle.org{current.path === "/" ? "" : current.path}</span>
        </div>
        <iframe ref={frame} key={current.path} src={current.path} title={`Preview of ${current.label}`} onLoad={forwardKeys} className="min-h-0 w-full flex-1 bg-white" />
      </div>
    </div>
  );
}
