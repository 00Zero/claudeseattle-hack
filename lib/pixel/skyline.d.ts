// Types for skyline.js (plain JavaScript, shared with the prototypes in docs/design).
export type WeatherInput = {
  code?: number; // WMO weather code
  isDay?: 0 | 1;
  windMph?: number;
  tempF?: number;
  sunrise?: string | null;
  sunset?: string | null;
};
export type WeatherKind = "clear" | "partly" | "overcast" | "fog" | "drizzle" | "rain" | "snow" | "showers" | "thunder";
export type Skyline = {
  scale: number;
  groundY: number;
  width: number;
  height: number;
  setWeather(weather: WeatherInput): void;
  setTheme(theme: "light" | "dark"): void;
  // The winners on the blimp's sign, one frame each for the prize and the project; null or [] hides it.
  setBlimp(winners: { prize: string; title: string }[] | null): void;
  forceDaylight(value: number | null): void;
  setTime(time: Date | number | null): void; // preview another time of day; null follows the clock
  destroy(): void;
  landmarks(): { needle: { x: number; top: number }; ground: number };
  daylight(): number;
  kind(): WeatherKind;
  label(): string;
  readonly weather: Required<WeatherInput>;
};
export const WX: { kind(code: number | null | undefined): WeatherKind; label(code: number | null | undefined): string };
export function initSkyline(options: { canvas: HTMLCanvasElement | string; theme?: "light" | "dark" }): Skyline;
