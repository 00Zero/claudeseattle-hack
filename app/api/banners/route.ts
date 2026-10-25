import { NextResponse } from "next/server";
import { getLiveBanners } from "@/lib/banners";

// Public. Live announcement banners, polled by components/site/site-banners.tsx so a banner
// shows and hides on schedule without a page reload. The CDN keeps each answer for 30 seconds,
// so this costs about two database reads a minute however many tabs are open.
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const banners = await getLiveBanners();
    return NextResponse.json(banners, { headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=30" } });
  } catch {
    return NextResponse.json({ error: "unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
