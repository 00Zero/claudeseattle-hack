// Theme: light by default, dark after sunset at the venue, a grey "dusk" step either side.
// `auto` follows the sun (and the system preference); `light` and `dark` are explicit choices.
// The same logic is inlined as a plain script in app/layout.tsx so the first paint has no flash;
// keep the two in sync.

export type ThemeMode = "auto" | "light" | "dark";
export type Theme = "light" | "dark" | "dusk";
export type SunTimes = { sunrise: string; sunset: string };

export const THEME_KEY = "hack-theme";
export const SUN_KEY = "hack-sun";
export const THEME_EVENT = "hack-theme";
export const MODE_EVENT = "hack-theme-mode";

export function readMode(): ThemeMode {
  try {
    const value = localStorage.getItem(THEME_KEY);
    if (value === "light" || value === "dark" || value === "auto") return value;
  } catch {}
  return "auto";
}

export function writeMode(mode: ThemeMode) {
  try {
    localStorage.setItem(THEME_KEY, mode);
  } catch {}
  window.dispatchEvent(new CustomEvent(MODE_EVENT, { detail: mode }));
}

// Subscribe/snapshot pair for useSyncExternalStore: the stored mode, "auto" on the server.
export function subscribeMode(callback: () => void) {
  window.addEventListener(MODE_EVENT, callback);
  return () => window.removeEventListener(MODE_EVENT, callback);
}
export const getServerMode = (): ThemeMode => "auto";

export function readSun(): SunTimes | null {
  try {
    const value = JSON.parse(localStorage.getItem(SUN_KEY) || "null");
    if (value && value.sunrise && value.sunset) return value;
  } catch {}
  return null;
}

export function writeSun(sun: SunTimes) {
  try {
    localStorage.setItem(SUN_KEY, JSON.stringify(sun));
  } catch {}
}

// 1 in full daylight, 0 at night, ramping over 45 minutes either side of sunrise and sunset.
export function daylightAt(now: number, sun: SunTimes | null): number {
  if (sun) {
    const rise = new Date(sun.sunrise).getTime();
    const set = new Date(sun.sunset).getTime();
    const ramp = 45 * 60_000;
    if (now < rise - ramp || now > set + ramp) return 0;
    if (now < rise + ramp) return (now - (rise - ramp)) / (2 * ramp);
    if (now > set - ramp) return (set + ramp - now) / (2 * ramp);
    return 1;
  }
  const hour = new Date(now).getHours();
  return hour >= 7 && hour < 18 ? 1 : 0;
}

export function resolveTheme(mode: ThemeMode, daylight: number, systemDark: boolean): Theme {
  if (mode !== "auto") return mode;
  if (daylight < 0.35 || (systemDark && daylight < 0.5)) return "dark";
  if (daylight < 0.85) return "dusk";
  return "light";
}

// Reads the stored mode and sun times, sets data-theme on <html>, and tells listeners (the skyline).
export function applyTheme(): Theme {
  const mode = readMode();
  const systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const theme = resolveTheme(mode, daylightAt(Date.now(), readSun()), systemDark);
  if (document.documentElement.getAttribute("data-theme") !== theme) {
    document.documentElement.setAttribute("data-theme", theme);
    window.dispatchEvent(new CustomEvent(THEME_EVENT, { detail: theme }));
  }
  return theme;
}

export function currentTheme(): Theme {
  const value = document.documentElement.getAttribute("data-theme");
  return value === "dark" || value === "dusk" ? value : "light";
}

// Inline, dependency-free copy of the above for the <head>. Runs before React hydrates.
export const THEME_BOOT_SCRIPT = `(function(){try{var m=localStorage.getItem("${THEME_KEY}")||"auto";var t=m;if(m==="auto"){var s=JSON.parse(localStorage.getItem("${SUN_KEY}")||"null"),n=Date.now(),d;if(s&&s.sunrise&&s.sunset){var r=new Date(s.sunrise).getTime(),e=new Date(s.sunset).getTime(),R=2700000;d=n<r-R||n>e+R?0:n<r+R?(n-(r-R))/(2*R):n>e-R?((e+R)-n)/(2*R):1}else{var h=new Date().getHours();d=h>=7&&h<18?1:0}var k=matchMedia("(prefers-color-scheme: dark)").matches;t=d<0.35||(k&&d<0.5)?"dark":d<0.85?"dusk":"light"}document.documentElement.setAttribute("data-theme",t)}catch(e){}})();`;
