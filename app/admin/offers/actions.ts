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

// Turns an offer on or off, switches whether attendees must be checked in to see its links, or
// whether its promo codes are shown (and copied) on the page.
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

// One entry per non-empty line, for the "what you get" and "how to redeem" lists.
function lines(formData: FormData, key: string) {
  return field(formData, key)
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
}

// The text every offer needs, checked like the columns in *_shared_offers.sql.
function offerText(formData: FormData) {
  const provider = field(formData, "provider");
  const headline = field(formData, "headline");
  const about = field(formData, "about");
  if (!provider || !headline || !about) throw new Error("An offer needs a provider, a headline and a description.");
  if (provider.length > 60) throw new Error("Keep the provider name to 60 characters.");
  if (headline.length > 120) throw new Error("Keep the headline to 120 characters.");
  return { provider, headline, about };
}

// Saves an offer's text, lists and order. The personal link label is only on offers with personal codes.
export async function saveOffer(formData: FormData) {
  await assertAdmin();
  const order = Number(field(formData, "sort_order") || "0");
  if (!Number.isInteger(order)) throw new Error("Order needs to be a whole number.");
  const row: Record<string, unknown> = {
    ...offerText(formData),
    details: lines(formData, "details"),
    steps: lines(formData, "steps"),
    sort_order: order,
  };
  if (formData.has("personal_link_label")) {
    const label = field(formData, "personal_link_label");
    if (!label || label.length > 80) throw new Error("The personal link needs a button label of up to 80 characters.");
    row.personal_link_label = label;
  }
  const { error } = await createAdminClient().from("offers").update(row).eq("slug", field(formData, "slug"));
  if (error) throw new Error(error.message);
  revalidate();
}

// Adds an offer, turned off so its links can go in before attendees see it.
export async function addOffer(formData: FormData) {
  await assertAdmin();
  const text = offerText(formData);
  const slug = text.provider
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  if (!slug) throw new Error("The provider name needs a letter or number.");
  const admin = createAdminClient();
  const { data: last } = await admin.from("offers").select("sort_order").order("sort_order", { ascending: false }).limit(1);
  const { error } = await admin.from("offers").insert({
    slug,
    ...text,
    details: lines(formData, "details"),
    steps: lines(formData, "steps"),
    sort_order: (last?.[0]?.sort_order ?? 0) + 10,
    enabled: false,
  });
  if (error) throw new Error(error.code === "23505" ? "There's already an offer with that provider name." : error.message);
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
