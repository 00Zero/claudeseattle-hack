import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { parseSurvey, SURVEYS, type Survey } from "@/lib/surveys";
import { createAdminClient } from "@/lib/supabase/admin";

// Survey sync, called by the Apps Script in each response sheet (scripts/apps-script/survey-sync.gs)
// with Authorization: Bearer SURVEY_SYNC_SECRET. Body: { survey, headers, rows } with every
// response in the sheet; the survey's stored rows are replaced with them, and for the small
// business survey so is the anonymous business_insights copy. The response holds counts only.
function authorized(request: Request) {
  const secret = process.env.SURVEY_SYNC_SECRET;
  const given = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!secret || !given) return false;
  // Compare digests so the lengths always match.
  const digest = (value: string) => createHash("sha256").update(value).digest();
  return timingSafeEqual(digest(given), digest(secret));
}

export async function POST(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { survey?: unknown; headers?: unknown; rows?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON" }, { status: 400 });
  }
  const survey = body.survey as Survey;
  if (!SURVEYS.includes(survey) || !Array.isArray(body.headers) || !Array.isArray(body.rows)) {
    return NextResponse.json({ error: "Expected { survey, headers, rows }" }, { status: 400 });
  }

  const parsed = parseSurvey(survey, body.headers, body.rows.filter(Array.isArray));
  if (parsed.rows.length === 0) {
    return NextResponse.json({ error: "No responses found", unmapped: parsed.unmapped }, { status: 422 });
  }

  const { data: stored, error } = await createAdminClient().rpc("replace_survey_responses", {
    p_survey: survey,
    p_rows: parsed.rows,
  });
  if (error) {
    console.error("Survey sync failed", survey, error.message);
    return NextResponse.json({ error: "Couldn't store responses" }, { status: 500 });
  }

  let anonymous: number | null = null;
  if (survey === "small_business" && parsed.insights.length > 0) {
    const { data, error: insightsError } = await createAdminClient().rpc("replace_business_insights", {
      p_rows: parsed.insights,
    });
    if (insightsError) {
      console.error("Business insights sync failed", insightsError.message);
      return NextResponse.json({ error: "Couldn't store the anonymous copy" }, { status: 500 });
    }
    anonymous = data;
  }

  console.log("Survey sync", survey, { stored, anonymous, unmapped: parsed.unmapped.length, dropped: parsed.dropped.length });
  return NextResponse.json({ survey, stored, anonymous, unmapped: parsed.unmapped, dropped: parsed.dropped });
}
