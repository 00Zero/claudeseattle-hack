"use server";

import {
  FEEDBACK_KINDS,
  FEEDBACK_MAX_LENGTH,
  type FeedbackKind,
  getFeedbackSender,
  postFeedbackToSlack,
} from "@/lib/feedback";
import { createClient } from "@/lib/supabase/server";

// On an error the submitted kind and text come back, because React clears the form after each submit.
export type FeedbackState = { status: "idle" | "ok" | "error"; message?: string; kind?: string; text?: string };

export async function sendFeedback(_prev: FeedbackState, formData: FormData): Promise<FeedbackState> {
  const profile = await getFeedbackSender();
  if (!profile) return { status: "error", message: "Feedback isn't open to you right now." };

  const kind = String(formData.get("kind") ?? "");
  const text = String(formData.get("text") ?? "");
  const page = formData.get("page");
  if (!(kind in FEEDBACK_KINDS)) return { status: "error", message: "Pick what this is about.", text };
  if (!text.trim()) return { status: "error", message: "Write a message first.", kind };

  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  try {
    await postFeedbackToSlack({
      kind: kind as FeedbackKind,
      text: text.trim().slice(0, FEEDBACK_MAX_LENGTH),
      page: typeof page === "string" && page.startsWith("/") ? page.slice(0, 200) : "(unknown page)",
      name: `${profile.first_name} ${profile.last_name}`.trim() || "Guest",
      email: typeof claims?.claims.email === "string" ? claims.claims.email : null,
    });
  } catch (error) {
    console.error("Feedback to Slack failed:", error instanceof Error ? error.message : error);
    return { status: "error", message: "Couldn't send that. Try again, or find an organizer in person.", kind, text };
  }
  return { status: "ok", message: "Sent. Thanks! An organizer will see it right away." };
}
