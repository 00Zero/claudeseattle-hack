"use client";

import { useEffect, useRef, useState } from "react";
import { initClawd } from "@/lib/pixel/clawd";
import { initSkyline, WX } from "@/lib/pixel/skyline";
import { THEME_EVENT, currentTheme } from "@/components/theme/theme";
import type { VenueWeather } from "@/lib/weather";

// 7x7 pixel weather glyphs for the chip.
const ICONS: Record<string, string[]> = {
  clear: ["..###..", ".#####.", "#######", "#######", "#######", ".#####.", "..###.."],
  partly: [".......", "..##...", ".####..", ".######", "#######", "#######", "......."],
  overcast: [".......", ".####..", "#######", "#######", ".######", ".......", "......."],
  fog: [".......", "#######", ".......", "#######", ".......", "#######", "......."],
  drizzle: [".####..", "#######", ".......", ".#.#.#.", ".......", "#.#.#..", "......."],
  rain: [".####..", "#######", ".......", "#.#.#.#", "#.#.#.#", ".#.#.#.", ".#.#.#."],
  showers: [".####..", "#######", ".......", "#.#.#.#", ".#.#.#.", "#.#.#.#", ".#.#.#."],
  snow: [".####..", "#######", ".......", ".#.#.#.", "#.#.#.#", ".#.#.#.", "#.#.#.#"],
  thunder: [".####..", "#######", "...##..", "..##...", ".####..", "...#...", "..#...."],
};

type Chip = { label: string; tempF: number; windMph: number; at: number; kind: string; fallback?: boolean };

// The full-bleed pixel Seattle band: skyline, live weather, time of day, and Clawd on the waterfront.
// Once winners are published, a blimp carries them across the sky (lib/pixel/skyline.js, setBlimp).
export function SkylineBand({ venueName, winners = [] }: { venueName: string; winners?: { prize: string; title: string }[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const iconRef = useRef<HTMLCanvasElement>(null);
  const [chip, setChip] = useState<Chip | null>(null);
  const skyRef = useRef<ReturnType<typeof initSkyline> | null>(null);
  const winnersKey = JSON.stringify(winners);

  useEffect(() => {
    const canvas = canvasRef.current;
    const stage = stageRef.current;
    if (!canvas || !stage) return;

    // Full-bleed bands need the scrollbar width (see .full-bleed in globals.css).
    const measureScrollbar = () => document.documentElement.style.setProperty("--scrollbar", `${window.innerWidth - document.documentElement.clientWidth}px`);
    measureScrollbar();
    const sky = initSkyline({ canvas, theme: currentTheme() === "dark" ? "dark" : "light" });
    skyRef.current = sky;
    const placeStage = () => {
      measureScrollbar();
      stage.style.top = `${sky.groundY}px`;
    };
    placeStage();

    let weatherLoaded = false;
    const clawd = initClawd({
      wanderMode: "stage",
      stage,
      scale: sky.scale,
      walkSpeed: 1,
      spawnChanceJersey: 0.25,
      weather: () => (weatherLoaded ? sky.kind() : "unknown"),
      landmarks: {
        get needle() {
          return sky.landmarks().needle;
        },
      },
    });
    // For the curious: try clawd.toggleJersey() or clawd.perform("dance") in the console.
    (window as unknown as { clawd: unknown }).clawd = clawd;

    const onTheme = () => sky.setTheme(currentTheme() === "dark" ? "dark" : "light");
    window.addEventListener(THEME_EVENT, onTheme);
    let resizeTimer: ReturnType<typeof setTimeout>;
    const onResize = () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(placeStage, 200);
    };
    window.addEventListener("resize", onResize);

    async function load() {
      try {
        const response = await fetch("/api/weather");
        const w = (await response.json()) as VenueWeather & { fallback?: boolean };
        sky.setWeather(w);
        weatherLoaded = true;
        setChip({ label: WX.label(w.code), tempF: w.tempF, windMph: w.windMph, at: w.at, kind: WX.kind(w.code), fallback: w.fallback });
      } catch {
        sky.setWeather({ code: 51 });
        setChip({ label: "Drizzle", tempF: 54, windMph: 6, at: Date.now(), kind: "drizzle", fallback: true });
      }
    }
    load();
    const refresh = setInterval(load, 10 * 60_000);

    return () => {
      clearInterval(refresh);
      clearTimeout(resizeTimer);
      window.removeEventListener("resize", onResize);
      window.removeEventListener(THEME_EVENT, onTheme);
      clawd.destroy();
      sky.destroy();
      skyRef.current = null;
    };
  }, []);

  // The winners on the blimp; an empty list hides it.
  useEffect(() => {
    skyRef.current?.setBlimp(JSON.parse(winnersKey));
  }, [winnersKey]);

  // Redraw the chip icon when the weather or the theme changes.
  useEffect(() => {
    const draw = () => {
      const c = iconRef.current?.getContext("2d");
      if (!c || !chip) return;
      c.clearRect(0, 0, 7, 7);
      c.fillStyle = getComputedStyle(document.documentElement).getPropertyValue("--fg").trim() || "#141413";
      (ICONS[chip.kind] ?? ICONS.drizzle).forEach((row, y) => [...row].forEach((ch, x) => ch === "#" && c.fillRect(x, y, 1, 1)));
    };
    draw();
    window.addEventListener(THEME_EVENT, draw);
    return () => window.removeEventListener(THEME_EVENT, draw);
  }, [chip]);

  return (
    <div
      className="full-bleed relative overflow-hidden border-y border-line bg-bg-sunken leading-[0]"
      aria-label={`Pixel-art Seattle skyline with live weather at ${venueName}. Clawd, the Claude Code mascot, walks the waterfront.${
        winners.length ? ` A blimp shows the winners: ${winners.map((w) => `${w.prize}, ${w.title}`).join("; ")}.` : ""
      }`}
      role="img"
    >
      <canvas ref={canvasRef} className="block w-full [image-rendering:pixelated]" aria-hidden="true" />
      <div ref={stageRef} className="absolute left-0 right-0 top-0 h-0" />
      <div
        role="status"
        className="absolute right-4 top-3.5 inline-flex max-w-[calc(100%-2rem)] flex-wrap items-center gap-x-2 border-2 border-fg bg-bg px-2 py-1 font-mono text-[11px] font-medium leading-tight text-fg shadow-[3px_3px_0_var(--fg)]"
      >
        <canvas ref={iconRef} width={7} height={7} className="h-3.5 w-3.5 [image-rendering:pixelated]" aria-hidden="true" />
        <span>
          {venueName} · {chip ? `${Math.round(chip.tempF)}°F · ${chip.label}` : "loading weather…"}
        </span>
        {chip && (
          <span className="hidden text-fg-muted sm:inline">
            · wind {Math.round(chip.windMph)} mph · {chip.fallback ? "weather unavailable, assuming drizzle" : `updated ${new Date(chip.at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`}
          </span>
        )}
      </div>
    </div>
  );
}
