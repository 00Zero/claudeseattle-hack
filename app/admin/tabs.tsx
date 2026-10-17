"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const tabs = [
  { href: "/admin/import", label: "Import" },
  { href: "/admin/people", label: "People" },
  { href: "/admin/judging", label: "Judging" },
  { href: "/admin/settings", label: "Settings" },
];

export function AdminTabs() {
  const pathname = usePathname();
  return (
    <nav className="flex gap-1 border-b border-foreground/10">
      {tabs.map((tab) => {
        const active = pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${
              active ? "border-foreground" : "border-transparent text-foreground/60 hover:text-foreground"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
