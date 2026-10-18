"use client";

import { useSyncExternalStore } from "react";
import { applyTheme, getServerMode, readMode, subscribeMode, writeMode, type ThemeMode } from "./theme";

const NEXT: Record<ThemeMode, ThemeMode> = { auto: "light", light: "dark", dark: "auto" };
const ICON: Record<ThemeMode, string> = { auto: "◐", light: "☀", dark: "☾" };

// Cycles auto → light → dark. Lives in the title bar.
export function ThemeToggle() {
  const mode = useSyncExternalStore(subscribeMode, readMode, getServerMode);

  function cycle() {
    writeMode(NEXT[mode]);
    applyTheme();
  }

  return (
    <button
      type="button"
      onClick={cycle}
      aria-label={`Theme: ${mode}. Click to change.`}
      title={mode === "auto" ? "Auto: follows the sun at the venue" : `Theme: ${mode}`}
      className="inline-flex items-center gap-1.5 rounded border border-line px-2 py-1 text-fg hover:bg-fg/5"
    >
      <span aria-hidden="true">{ICON[mode]}</span>
      <span className="hidden sm:inline">{mode}</span>
    </button>
  );
}
