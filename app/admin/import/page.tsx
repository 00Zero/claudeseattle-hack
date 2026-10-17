import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdminPage } from "@/lib/admin";
import { ImportForm } from "./import-form";

export default async function ImportPage() {
  await requireAdminPage();
  const admin = createAdminClient();
  const [{ count }, { data: latest }] = await Promise.all([
    admin.from("luma_guests").select("guest_id", { count: "exact", head: true }),
    admin.from("luma_guests").select("imported_at").order("imported_at", { ascending: false }).limit(1).maybeSingle(),
  ]);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Luma import</h1>
      <p className="text-sm text-foreground/70">
        Upload the guests CSV exported from Luma. Rows are matched on guest_id, so re-import
        after every approval batch and on Sunday morning for check-ins. The file is processed in memory and never saved.
      </p>
      <p className="text-sm">
        {count ?? 0} guests in the database
        {latest?.imported_at ? `, last import ${new Date(latest.imported_at).toLocaleString("en-US", { timeZone: "America/Los_Angeles" })}` : ""}.
      </p>
      <ImportForm />
    </div>
  );
}
