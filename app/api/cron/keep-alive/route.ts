import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Vercel Cron (vercel.json) calls this once a day, so the Supabase project never goes a week without
// a database request: projects on Supabase's Free plan pause after 7 days of inactivity, which would
// take down sign-in and every page that reads data. The query is a one-row read of event_settings.
// When CRON_SECRET is set in Vercel, Vercel sends it as a bearer token and other callers are refused.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  const { error } = await createAdminClient().from("event_settings").select("id").eq("id", 1).single();
  if (error) {
    console.error("keep-alive query failed:", error.message);
    return NextResponse.json({ ok: false }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
  return NextResponse.json({ ok: true, at: new Date().toISOString() }, { headers: { "Cache-Control": "no-store" } });
}
