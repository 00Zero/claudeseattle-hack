"use client";

import { useSyncExternalStore } from "react";

// One group's card on Admin -> Email, collapsible to its name, rule and recipient count. Which groups
// are collapsed is kept in localStorage, so it survives reloads in this browser; storage can throw
// (private windows, blocked site data), and then every group starts open. Collapsed content stays in
// the page (hidden), so an unsaved email edit isn't lost.

const KEY = "admin-email:collapsed";
const EVENT = "admin-email:collapsed";

function readCollapsed(): string {
  try {
    return localStorage.getItem(KEY) ?? "[]";
  } catch {
    return "[]";
  }
}

function parse(raw: string): string[] {
  try {
    const value = JSON.parse(raw);
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function subscribe(callback: () => void) {
  window.addEventListener(EVENT, callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener(EVENT, callback);
    window.removeEventListener("storage", callback);
  };
}

export function CollapsibleGroup({ id, title, rule, recipients, children }: { id: string; title: string; rule: string; recipients: number; children: React.ReactNode }) {
  const collapsed = parse(useSyncExternalStore(subscribe, readCollapsed, () => "[]")).includes(id);
  const bodyId = `${id}-details`;

  function toggle() {
    const next = new Set(parse(readCollapsed()));
    if (collapsed) next.delete(id);
    else next.add(id);
    try {
      localStorage.setItem(KEY, JSON.stringify([...next]));
    } catch {}
    window.dispatchEvent(new Event(EVENT));
  }

  return (
    <section id={id} className="scroll-mt-20 space-y-4 rounded border border-foreground/20 p-4">
      <div className="flex items-start gap-3">
        <div className="min-w-0 grow">
          <h2 className="text-lg font-semibold">{title}</h2>
          <p className="text-sm text-foreground/70">{rule}</p>
          {collapsed && (
            <p className="mt-1 text-sm">
              <span className="text-foreground/60">Recipients</span> <span className="font-medium tabular-nums">{recipients}</span>
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={toggle}
          aria-expanded={!collapsed}
          aria-controls={bodyId}
          aria-label={collapsed ? `Show ${title}` : `Collapse ${title}`}
          title={collapsed ? "Show" : "Collapse"}
          className="shrink-0 rounded border border-foreground/20 p-1.5 text-foreground/70 hover:text-foreground"
        >
          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" className={`transition-transform ${collapsed ? "rotate-180" : ""}`}>
            <path d="M3.5 10 8 5.5 12.5 10" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>
      <div id={bodyId} hidden={collapsed} className="space-y-4">
        {children}
      </div>
    </section>
  );
}
