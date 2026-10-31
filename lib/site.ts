import type { Metadata } from "next";

// The public site's address, for canonical URLs, the sitemap, and robots.txt. If the site moves
// domains, change it here and redirect the old one.
export const siteUrl = "https://hack.claudeseattle.org";
export const siteName = "Claude Community Seattle";

// Pages stay out of search engines and AI crawlers by default (app/layout.tsx). The public ones
// (home, /results, /gallery, /small-businesses and its area pages, each /entries/[id]) opt back in with this.
export const indexed: Metadata["robots"] = { index: true, follow: true };

// The pages a visit must land on for Google Analytics to start (components/site/analytics.tsx): the indexed ones above.
// Never add a page whose URL can carry a token or personal data.
export const measuredPages = /^\/(?:results|gallery|small-businesses(?:\/[^/]+)?|entries\/[^/]+)?$/;
