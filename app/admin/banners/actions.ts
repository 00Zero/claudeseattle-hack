"use server";

import { revalidatePath } from "next/cache";
import { assertAdmin } from "@/lib/admin";
import { BANNER_MAX_LENGTH, BANNER_TONES, type BannerTone } from "@/lib/banners";
import { createAdminClient } from "@/lib/supabase/admin";
import { pacificInputToIso } from "@/lib/time";

function field(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

// The banner sits in the root layout, so every page re-renders with it.
function revalidate() {
  revalidatePath("/", "layout");
}

// Adds a banner, or updates it when the form carries an id. Times come in as Pacific wall time.
export async function saveBanner(formData: FormData) {
  await assertAdmin();
  const message = field(formData, "message");
  const tone = field(formData, "tone") as BannerTone;
  const startsAt = pacificInputToIso(field(formData, "starts_at"));
  const endsAt = pacificInputToIso(field(formData, "ends_at"));
  if (!message) throw new Error("A banner needs a message.");
  if (message.length > BANNER_MAX_LENGTH) throw new Error(`Keep the message under ${BANNER_MAX_LENGTH} characters.`);
  if (!BANNER_TONES.includes(tone)) throw new Error("Unknown style.");
  if (!startsAt || !endsAt) throw new Error("A banner needs a start and an end time.");
  if (endsAt <= startsAt) throw new Error("The end time needs to be after the start time.");

  const row = { message, tone, starts_at: startsAt, ends_at: endsAt };
  const id = field(formData, "id");
  const admin = createAdminClient();
  const { error } = id ? await admin.from("banners").update(row).eq("id", id) : await admin.from("banners").insert(row);
  if (error) throw new Error(error.message);
  revalidate();
}

// Ends a live banner now, keeping it in the list as past.
export async function endBanner(formData: FormData) {
  await assertAdmin();
  const { error } = await createAdminClient()
    .from("banners")
    .update({ ends_at: new Date().toISOString() })
    .eq("id", field(formData, "id"));
  if (error) throw new Error(error.message);
  revalidate();
}

export async function deleteBanner(formData: FormData) {
  await assertAdmin();
  const { error } = await createAdminClient().from("banners").delete().eq("id", field(formData, "id"));
  if (error) throw new Error(error.message);
  revalidate();
}
