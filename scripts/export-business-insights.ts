// Builds the public small business dataset from the synced survey: one row per business,
// shuffled, with only the answer fields below. Contact details, revenue, and the timestamp
// are never included. Every row is sent through a model that removes names, businesses,
// websites, places and money figures from the answers, and the result is written for an
// admin to read in full before it is shared.
//
//   npx tsx --env-file=.env.local scripts/export-business-insights.ts ~/Downloads/business-insights.csv
//
// Needs NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and AI_GATEWAY_API_KEY. Prints counts only.
// The output path must be outside the repo: attendee data never goes in git.
import { createClient } from "@supabase/supabase-js";
import { writeFileSync } from "node:fs";
import path from "node:path";

const MODEL = "anthropic/claude-sonnet-5.5";
const CONCURRENCY = 4;

// Public columns, in order, with their CSV headers.
const PUBLIC_FIELDS: [key: string, header: string][] = [
  ["business_role", "Role in the business"],
  ["industry", "Industry"],
  ["team_size", "People in the business"],
  ["location", "Based in"],
  ["business_age", "Years operating"],
  ["ai_comfort", "Owner's comfort with AI (1-5)"],
  ["ai_use_today", "AI use today"],
  ["ai_tried_areas", "Where they tried AI"],
  ["ai_tools", "AI tools used"],
  ["what_worked", "What has worked"],
  ["what_did_not_work", "What has not worked"],
  ["ai_spend_monthly", "Monthly AI spend"],
  ["ai_users", "Who uses AI"],
  ["barriers", "Main barriers"],
  ["biggest_barrier", "Biggest barrier, in their words"],
  ["help_sources", "Where they get help"],
  ["time_sinks", "Biggest time sinks"],
  ["build_wish", "One thing they'd want built"],
  ["adoption_needs", "What it would take to adopt"],
  ["preferred_format", "Most useful format"],
  ["one_time_budget", "One-time budget"],
];

const SCRUB_PROMPT = `You prepare survey answers from small business owners for public release to hackathon participants.
You get one response as a JSON object. Return the same JSON object, same keys, with only these changes:
- Replace anything that could identify the respondent or their business with a short bracketed placeholder:
  names of people, the business, its products, clients or partners ([business], [product], [person], [client]);
  websites, emails, phone numbers and social handles ([link]); street addresses and places smaller than a
  metro area ([place]); revenue, sales, prices they charge, salaries, or other money figures about the
  business ([amount]); and distinctive details that would let a reader who knows the area pick out the
  business (for example "the only kosher bakery in Ballard") — generalize those ("a specialty bakery").
- Keep everything else exactly as written, including typos. Do not summarize, translate or add anything.
- Multiple-choice answers stay as they are unless an "Other" entry contains identifying text.
Return only the JSON object.`;

type Row = Record<string, string>;

function csvCell(value: string) {
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

async function scrub(row: Row): Promise<Row> {
  const response = await fetch("https://ai-gateway.vercel.sh/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.AI_GATEWAY_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0,
      messages: [
        { role: "system", content: SCRUB_PROMPT },
        { role: "user", content: JSON.stringify(row) },
      ],
    }),
  });
  if (!response.ok) throw new Error(`AI Gateway returned ${response.status}`);
  const content: string = (await response.json()).choices[0].message.content;
  const parsed = JSON.parse(content.slice(content.indexOf("{"), content.lastIndexOf("}") + 1)) as Row;
  // Only the keys we sent come back, as strings.
  return Object.fromEntries(Object.keys(row).map((k) => [k, String(parsed[k] ?? "")]));
}

async function main() {
  const out = process.argv[2];
  if (!out) throw new Error("Usage: export-business-insights.ts <output.csv>");
  const outPath = path.resolve(out.replace(/^~(?=\/)/, process.env.HOME ?? "~"));
  if (outPath.startsWith(path.resolve(__dirname, "..") + path.sep)) {
    throw new Error("Write the export outside the repo; attendee data never goes in git.");
  }

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });
  const { data, error } = await supabase.from("survey_responses").select("answers").eq("survey", "small_business");
  if (error) throw new Error(error.message);

  const rows: Row[] = data
    .map((r) => r.answers as Row)
    .filter((a) => a.business_role && a.business_role !== "Neither")
    .map((a) => Object.fromEntries(PUBLIC_FIELDS.map(([key]) => [key, a[key] ?? ""])));

  // Shuffle so row order says nothing about when someone answered.
  for (let i = rows.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [rows[i], rows[j]] = [rows[j], rows[i]];
  }

  const scrubbed: Row[] = new Array(rows.length);
  let changed = 0;
  for (let i = 0; i < rows.length; i += CONCURRENCY) {
    const batch = rows.slice(i, i + CONCURRENCY);
    const results = await Promise.all(batch.map(scrub));
    results.forEach((result, k) => {
      scrubbed[i + k] = result;
      if (JSON.stringify(result) !== JSON.stringify(batch[k])) changed++;
    });
  }

  const lines = [
    PUBLIC_FIELDS.map(([, header]) => csvCell(header)).join(","),
    ...scrubbed.map((row) => PUBLIC_FIELDS.map(([key]) => csvCell(row[key])).join(",")),
  ];
  writeFileSync(outPath, lines.join("\n") + "\n");
  console.log(`Wrote ${scrubbed.length} responses (${data.length - rows.length} screened out; ${changed} edited by the scrubber) to ${outPath}`);
  console.log("Read every row before sharing it.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
