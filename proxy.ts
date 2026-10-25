import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    // Everything except static files, images, and /api/banners (public, polled by every open tab,
    // cached by the CDN; it never reads the session).
    "/((?!_next/static|_next/image|favicon.ico|api/banners|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
