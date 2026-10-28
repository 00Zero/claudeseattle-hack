import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site";

// Search engines and AI crawlers get the public pages only: home, /results, /small-businesses and
// its area pages, each /entries/[id], and /llms.txt. Sign-in, event-day tools, judging, and admin
// are off limits. Pages also default to noindex (app/layout.tsx), so a new route stays out of
// search until it opts in.
const privatePaths = [
  "/admin",
  "/api",
  "/auth",
  "/check-in",
  "/declined",
  "/judge",
  "/login",
  "/pending",
  "/profile",
  "/resources",
  "/slides",
  "/submit",
  "/survey",
  "/teams",
  "/verify-email",
  "/vote",
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: privatePaths },
    sitemap: `${siteUrl}/sitemap.xml`,
  };
}
