import { requireAdminPage } from "@/lib/admin";
import { AdminTabs } from "./tabs";

// Admin shell. Only platform_role = 'admin' gets past this; every admin server
// action re-checks with assertAdmin() before writing with the service-role client.
export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  await requireAdminPage();
  return (
    <div className="space-y-6">
      <AdminTabs />
      {children}
    </div>
  );
}
