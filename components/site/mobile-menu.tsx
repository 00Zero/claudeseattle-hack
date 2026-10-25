"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { signOut } from "@/app/auth/actions";

// Phone-width nav for signed-in people: a "/menu" slash command, like the rest of the title bar,
// that opens the page list the way Claude Code lists slash commands. Closes on navigation,
// Escape, or a tap outside.
export function MobileMenu({ pages }: { pages: { href: string; label: string }[] }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const root = useRef<HTMLDivElement>(null);

  // Close whenever the page changes (adjusting state during render, not in an effect).
  const [shownFor, setShownFor] = useState(pathname);
  if (shownFor !== pathname) {
    setShownFor(pathname);
    setOpen(false);
  }

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const item = "flex w-full rounded px-3 py-2.5 text-left text-fg hover:bg-fg/5";
  return (
    <div ref={root} className="relative sm:hidden">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls="mobile-menu"
        className={`rounded border border-line-strong px-2 py-1 text-fg hover:bg-fg/5 ${open ? "bg-fg/5" : ""}`}
      >
        <span className="text-accent">/</span>menu
      </button>
      {open && (
        <div id="mobile-menu" className="absolute right-0 top-full z-30 mt-2 w-48 rounded-lg border border-line bg-bg-raised p-1 shadow-lg">
          <ul>
            {pages.map((page) => (
              <li key={page.href}>
                <Link href={page.href} prefetch={false} className={item} aria-current={pathname.startsWith(page.href) ? "page" : undefined}>
                  <span className="text-accent">/</span>
                  {page.label}
                </Link>
              </li>
            ))}
            <li className="mt-1 border-t border-line pt-1">
              <form action={signOut}>
                <button type="submit" className={item}>
                  <span className="text-accent">/</span>logout
                </button>
              </form>
            </li>
          </ul>
        </div>
      )}
    </div>
  );
}
