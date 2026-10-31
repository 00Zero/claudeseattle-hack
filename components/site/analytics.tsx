"use client";

import { GoogleAnalytics } from "@next/third-parties/google";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { measuredPages } from "@/lib/site";

// Google Analytics, for signed-out visitors only (app/layout.tsx). It starts only when the full page
// load landed on a measured page, not on a later in-app navigation. Sign-in, email and survey links
// carry tokens in their URLs and always open in a full page load, so they are never in the same
// browsing history as the script, even if the visitor clicks through to a public page and back.
export function Analytics({ id }: { id: string }) {
  const pathname = usePathname();
  const [landedOnMeasuredPage] = useState(() => measuredPages.test(pathname));
  return landedOnMeasuredPage ? <GoogleAnalytics gaId={id} /> : null;
}
