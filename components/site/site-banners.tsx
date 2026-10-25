"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import type { Banner } from "@/lib/banners";

const POLL_MS = 60_000;
// Links in a message, leaving out a trailing period, comma or closing parenthesis.
const URL_PATTERN = /(https?:\/\/[^\s]*[^\s.,;:!?)])/g;

// Announcement banners below the site header, written and scheduled in /admin/banners.
// The root layout renders the live ones; the root layout doesn't re-render on client-side
// navigation, so this polls /api/banners while the tab is visible (and after each navigation)
// to show new banners when they start, and hides each one when its window ends.
export function SiteBanners({ initial }: { initial: Banner[] }) {
  const pathname = usePathname();
  const [banners, setBanners] = useState(initial);
  // 0 until mounted, so the first render matches the server's.
  const [now, setNow] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function refresh() {
      if (document.hidden) return;
      try {
        const response = await fetch("/api/banners");
        if (!response.ok) return;
        const next = (await response.json()) as Banner[];
        if (!cancelled) setBanners(next);
      } catch {
        // Offline or the request failed: keep what's showing and try again on the next tick.
      }
    }
    function tick() {
      setNow(Date.now());
      void refresh();
    }
    tick();
    const interval = setInterval(tick, POLL_MS);
    const onVisible = () => !document.hidden && tick();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [pathname]);

  // Hide a banner the moment its window ends, without waiting for the next poll.
  useEffect(() => {
    const ends = banners.map((b) => Date.parse(b.ends_at)).filter((end) => end > Date.now());
    if (ends.length === 0) return;
    const timeout = setTimeout(() => setNow(Date.now()), Math.min(...ends) - Date.now() + 500);
    return () => clearTimeout(timeout);
  }, [banners, now]);

  const visible = banners.filter((b) => !now || Date.parse(b.ends_at) > now);
  if (visible.length === 0) return null;

  return (
    <div role="region" aria-label="Announcements">
      {visible.map((banner) => (
        <div
          key={banner.id}
          className={
            banner.tone === "urgent" ? "bg-clay-deep text-ivory" : "border-b border-line bg-accent-soft text-fg"
          }
        >
          <p className="mx-auto max-w-4xl whitespace-pre-line px-4 py-2 text-sm">
            {banner.message.split(URL_PATTERN).map((part, i) =>
              i % 2 === 1 ? (
                <a key={i} href={part} target="_blank" rel="noreferrer" className="break-all font-medium underline">
                  {part}
                </a>
              ) : (
                part
              ),
            )}
          </p>
        </div>
      ))}
    </div>
  );
}
