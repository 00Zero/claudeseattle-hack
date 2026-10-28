import type { Metadata } from "next";

// The public site's address, for canonical URLs, the sitemap, and robots.txt. If the site moves
// domains, change it here and redirect the old one.
export const siteUrl = "https://hack.claudeseattle.org";
export const siteName = "Claude Community Seattle";

// Pages stay out of search engines and AI crawlers by default (app/layout.tsx). The public ones
// (home, /results, /small-businesses, each /entries/[id]) opt back in with this.
export const indexed: Metadata["robots"] = { index: true, follow: true };
