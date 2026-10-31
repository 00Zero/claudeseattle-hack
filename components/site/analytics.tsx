"use client";

import { usePathname, useSearchParams } from "next/navigation";
import Script from "next/script";
import { useEffect, useRef, useState } from "react";
import { measuredPages, unmeasuredPages } from "@/lib/site";

declare global {
  interface Window {
    dataLayer?: unknown[];
  }
}

// gtag.js reads the arguments object itself, so this can't take an array.
const gtag: (...args: unknown[]) => void = function () {
  window.dataLayer ??= [];
  // eslint-disable-next-line prefer-rest-params
  window.dataLayer.push(arguments);
};

// GA's Site search reads these straight from the address bar, not from page_location, and sends
// them to Google as the search term. The search forms are plain GET forms, so each search is its
// own page load: GA stays off for it, whatever the stream's settings say.
const SEARCH_PARAMS = ["q", "s", "search", "query", "keyword"];

// The address Google gets for a page: no query string except campaign tags (people search puts
// names in ?q=), and no profile IDs.
function cleanUrl({ origin, pathname, search }: Location) {
  const path = pathname.replace(/^\/teams\/people\/[^/]+/, "/teams/people/profile");
  const tags = [...new URLSearchParams(search)].filter(([name]) => name.startsWith("utm_"));
  return origin + path + (tags.length ? `?${new URLSearchParams(tags)}` : "");
}

// Same-site referrers can hold a token: a magic link posts from /auth/confirm?token_hash=... and
// redirects here, which leaves that URL in document.referrer.
function cleanReferrer({ origin }: Location) {
  return document.referrer.startsWith(origin) ? origin : document.referrer;
}

// Google Analytics, for everyone but admins and test accounts (app/layout.tsx). Sign-in, email and
// survey links carry tokens in their URLs and always open in a full page load, so it stays off for
// the rest of a page load that began on one: their URLs are never in the same browsing history.
// We send every page view ourselves, with cleanUrl, so "Page changes based on browser history
// events" must stay off in the GA web stream (Enhanced measurement), and "Site search" with it.
export function Analytics({ id, signedIn }: { id: string; signedIn: boolean }) {
  const pathname = usePathname();
  const params = useSearchParams();
  const [started] = useState(() => !SEARCH_PARAMS.some((name) => params.has(name)) && (signedIn ? !unmeasuredPages.test(pathname) : measuredPages.test(pathname)));
  const lastSent = useRef<string | null>(null);

  useEffect(() => {
    if (!started || lastSent.current === pathname || unmeasuredPages.test(pathname)) return;
    // Analytics must never take a page down: this runs in the root layout, on every page.
    try {
      const page_location = cleanUrl(window.location);
      const page_referrer = cleanReferrer(window.location);
      if (lastSent.current === null) {
        gtag("js", new Date());
        gtag("set", "user_properties", { signed_in: signedIn ? "yes" : "no" });
        gtag("config", id, { send_page_view: false, page_location, page_referrer });
      }
      lastSent.current = pathname;
      gtag("set", { page_location, page_referrer });
      gtag("event", "page_view", { page_location, page_referrer });
    } catch (error) {
      console.error("Analytics failed", error);
    }
  }, [id, pathname, signedIn, started]);

  return started ? <Script src={`https://www.googletagmanager.com/gtag/js?id=${id}`} /> : null;
}
