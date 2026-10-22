"use server";

import { revalidatePath } from "next/cache";
import { assertAdmin } from "@/lib/admin";
import { RESOURCE_SECTIONS } from "@/lib/resources";
import { createAdminClient } from "@/lib/supabase/admin";

function field(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function revalidate() {
  revalidatePath("/admin/settings");
  revalidatePath("/resources");
  revalidatePath("/", "layout");
}

// Adds a resource, or updates it when the form carries an id.
export async function saveResource(formData: FormData) {
  await assertAdmin();
  const title = field(formData, "title");
  const url = field(formData, "url");
  const section = field(formData, "section");
  const order = Number(field(formData, "sort_order") || "0");
  if (!title) throw new Error("A resource needs a title.");
  if (!/^https:\/\/\S+$/.test(url)) throw new Error("The link needs to start with https://.");
  if (!RESOURCE_SECTIONS.some((s) => s.key === section)) throw new Error("Pick a section.");
  if (!Number.isInteger(order)) throw new Error("Order needs to be a whole number.");

  const row = {
    title,
    url,
    section,
    description: field(formData, "description") || null,
    sort_order: order,
    visible: formData.get("visible") === "on",
  };
  const id = field(formData, "id");
  const admin = createAdminClient();
  const { error } = id
    ? await admin.from("resources").update(row).eq("id", id)
    : await admin.from("resources").insert(row);
  if (error) throw new Error(error.message);
  revalidate();
}

export async function deleteResource(formData: FormData) {
  await assertAdmin();
  const { error } = await createAdminClient().from("resources").delete().eq("id", field(formData, "id"));
  if (error) throw new Error(error.message);
  revalidate();
}
