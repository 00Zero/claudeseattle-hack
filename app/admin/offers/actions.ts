"use server";

import { revalidatePath } from "next/cache";
import { assertAdmin } from "@/lib/admin";
import { OFFER_FLAGS, type OfferFlag } from "@/lib/offers";
import { createAdminClient } from "@/lib/supabase/admin";

function field(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function revalidate() {
  revalidatePath("/admin/offers");
  revalidatePath("/resources");
}

// Turns an offer on or off, or switches whether attendees must be checked in to see its links.
export async function setOfferFlag(formData: FormData) {
  await assertAdmin();
  const flag = field(formData, "flag") as OfferFlag;
  if (!OFFER_FLAGS.includes(flag)) throw new Error("Unknown setting.");
  const { error } = await createAdminClient()
    .from("offers")
    .update({ [flag]: field(formData, "value") === "true" })
    .eq("slug", field(formData, "slug"));
  if (error) throw new Error(error.message);
  revalidate();
}

// Adds a redemption link to an offer, or updates it when the form carries an id.
export async function saveOfferLink(formData: FormData) {
  await assertAdmin();
  const label = field(formData, "label");
  const url = field(formData, "url");
  const order = Number(field(formData, "sort_order") || "0");
  if (!label) throw new Error("A link needs a button label.");
  if (!/^https:\/\/\S+$/.test(url)) throw new Error("The link needs to start with https://.");
  if (!Number.isInteger(order)) throw new Error("Order needs to be a whole number.");

  const row = { label, url, code: field(formData, "code") || null, sort_order: order };
  const id = field(formData, "id");
  const admin = createAdminClient();
  const { error } = id
    ? await admin.from("offer_links").update(row).eq("id", id)
    : await admin.from("offer_links").insert({ ...row, offer_slug: field(formData, "offer_slug") });
  if (error) throw new Error(error.message);
  revalidate();
}

export async function deleteOfferLink(formData: FormData) {
  await assertAdmin();
  const { error } = await createAdminClient().from("offer_links").delete().eq("id", field(formData, "id"));
  if (error) throw new Error(error.message);
  revalidate();
}
