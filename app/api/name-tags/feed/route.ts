import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Name tag feed, polled every few seconds by the name tag printer (github.com/00Zero/thermal-printer)
// with Authorization: Bearer NAME_TAG_FEED_SECRET. Returns the last 30 minutes of "Print my name
// tag" requests; the printer remembers which ids it has printed. Fields match its name-tag template.
const WINDOW_MS = 30 * 60 * 1000;

function authorized(request: Request) {
  const secret = process.env.NAME_TAG_FEED_SECRET;
  const given = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!secret || !given) return false;
  // Compare digests so the lengths always match.
  const digest = (value: string) => createHash("sha256").update(value).digest();
  return timingSafeEqual(digest(given), digest(secret));
}

export async function GET(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await createAdminClient()
    .from("name_tag_prints")
    .select("id, first_name, last_name, job_title, company, role_label")
    .gte("requested_at", new Date(Date.now() - WINDOW_MS).toISOString())
    .order("requested_at");
  if (error) {
    console.error("Name tag feed failed", error.message);
    return NextResponse.json({ error: "Couldn't read name tags" }, { status: 500 });
  }
  const rows = data.map((t) => ({
    id: String(t.id),
    firstName: t.first_name,
    lastName: t.last_name,
    line: t.job_title ?? "",
    line2: t.company ?? "",
    badge: t.role_label ?? "",
  }));
  return NextResponse.json({ rows }, { headers: { "Cache-Control": "no-store" } });
}
