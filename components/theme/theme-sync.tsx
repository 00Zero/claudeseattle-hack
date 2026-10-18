"use client";

import { useEffect } from "react";
import { applyTheme, writeSun } from "./theme";

// Keeps the theme current: re-applies every minute (so auto flips at dusk while the page is open),
// follows system preference changes, and refreshes today's sunrise and sunset from /api/weather.
export function ThemeSync() {
  useEffect(() => {
    applyTheme();
    const interval = setInterval(applyTheme, 60_000);
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onMedia = () => applyTheme();
    media.addEventListener("change", onMedia);
    fetch("/api/weather")
      .then((r) => r.json())
      .then((w) => {
        if (w?.sunrise && w?.sunset) {
          writeSun({ sunrise: w.sunrise, sunset: w.sunset });
          applyTheme();
        }
      })
      .catch(() => {});
    return () => {
      clearInterval(interval);
      media.removeEventListener("change", onMedia);
    };
  }, []);
  return null;
}
