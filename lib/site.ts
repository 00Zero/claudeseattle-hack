import type { Metadata } from "next";

// The public site's address, for canonical URLs, the sitemap, and robots.txt. If the site moves
// domains, change it here and redirect the old one.
export const siteUrl = "https://hack.claudeseattle.org";
export const siteName = "Claude Community Seattle";

// Pages stay out of search engines and AI crawlers by default (app/layout.tsx). The public ones
// (home, /results, /gallery, /small-businesses and its area pages, each /entries/[id]) opt back in with this.
export const indexed: Metadata["robots"] = { index: true, follow: true };

// Google Analytics (components/site/analytics.tsx). A signed-out visit must land on one of these for
// it to start: the indexed pages above.
export const measuredPages = /^\/(?:results|gallery|small-businesses(?:\/[^/]+)?|entries\/[^/]+)?$/;
// It never starts on or reports these, signed in or not. Any new page whose path can carry a token
// goes here; a path with personal data in it needs cleaning in cleanUrl too.
export const unmeasuredPages = /^\/(?:admin|auth|login|survey|verify-email)(?:\/|$)/;
