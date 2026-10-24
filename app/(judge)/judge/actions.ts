"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getEnabledCriteria } from "../_lib/criteria";
import { parseScores } from "../_lib/scoring";
import { getJudgeViewer } from "./_lib/judge";

export type ScoreState = { status: "idle" | "ok" | "error"; message?: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Save my score for one entry and round. RLS (scores_create / scores_edit) allows prelim scores
// only for entries assigned to me and final scores only for finalists. Judges can update only
// scores, criteria and comment, so insert the first time and update after (no upsert).
export async function saveScore(_prev: ScoreState, formData: FormData): Promise<ScoreState> {
  const viewer = await getJudgeViewer();
  if (viewer.kind !== "judge") return { status: "error", message: "Only judges can score." };

  const entryId = formData.get("entry_id");
  const round = formData.get("round");
  if (typeof entryId !== "string" || !UUID.test(entryId) || (round !== "prelim" && round !== "final")) {
    return { status: "error", message: "Bad request." };
  }
  // Scored against the criteria enabled now, read on the server; the setting is locked once real
  // scores exist, so a stale form only happens in the test world.
  const { criteria, keys } = await getEnabledCriteria();
  const scores = parseScores(criteria, formData);
  if (!scores) {
    return { status: "error", message: "Pick a score from 1 to 8 for every criterion. If one is missing, reload the page." };
  }
  const raw = formData.get("comment");
  const comment = typeof raw === "string" && raw.trim() ? raw.trim().slice(0, 2000) : null;

  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("judge_scores")
    .select("entry_id")
    .eq("entry_id", entryId)
    .eq("judge_id", viewer.id)
    .eq("round", round)
    .maybeSingle();

  const { error } = existing
    ? await supabase.from("judge_scores").update({ scores, criteria: keys, comment }).eq("entry_id", entryId).eq("judge_id", viewer.id).eq("round", round)
    : await supabase.from("judge_scores").insert({ entry_id: entryId, judge_id: viewer.id, round, scores, criteria: keys, comment });
  if (error) {
    if (error.code === "42501") {
      return { status: "error", message: round === "prelim" ? "This entry isn't assigned to you." : "This entry isn't a finalist." };
    }
    return { status: "error", message: "We couldn't save your score. Try again." };
  }

  revalidatePath("/judge");
  revalidatePath(`/judge/${entryId}`);
  revalidatePath("/judge/results");
  return { status: "ok", message: "Score saved." };
}
