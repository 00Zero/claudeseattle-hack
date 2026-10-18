// Live weather at the venue from Open-Meteo (free, no key). Server-side only; the browser calls
// /api/weather, which caches this for ten minutes so visitors never hit Open-Meteo directly.

import { venue } from "@/lib/event";

export type VenueWeather = {
  code: number; // WMO weather code
  isDay: 0 | 1;
  tempF: number;
  windMph: number;
  sunrise: string; // ISO, Pacific
  sunset: string;
  at: number; // epoch ms when fetched
};

const OPEN_METEO = "https://api.open-meteo.com/v1/forecast";

export async function getVenueWeather(): Promise<VenueWeather> {
  const url = new URL(OPEN_METEO);
  url.searchParams.set("latitude", String(venue.lat));
  url.searchParams.set("longitude", String(venue.lon));
  url.searchParams.set("current", "temperature_2m,weather_code,wind_speed_10m,is_day");
  url.searchParams.set("daily", "sunrise,sunset");
  url.searchParams.set("temperature_unit", "fahrenheit");
  url.searchParams.set("wind_speed_unit", "mph");
  url.searchParams.set("timezone", "America/Los_Angeles");
  url.searchParams.set("forecast_days", "1");

  const response = await fetch(url, { next: { revalidate: 600 } });
  if (!response.ok) throw new Error(`Open-Meteo responded ${response.status}`);
  const json = await response.json();
  return {
    code: json.current.weather_code,
    isDay: json.current.is_day ? 1 : 0,
    tempF: json.current.temperature_2m,
    windMph: json.current.wind_speed_10m,
    sunrise: json.daily.sunrise[0],
    sunset: json.daily.sunset[0],
    at: Date.now(),
  };
}

// Fallback when Open-Meteo is unreachable: it is Seattle, assume drizzle, and use the clock for day and night.
export function fallbackWeather(): VenueWeather {
  const now = new Date();
  const hour = Number(new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", hour: "numeric", hourCycle: "h23" }).format(now));
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles" }).format(now); // YYYY-MM-DD
  return { code: 51, isDay: hour >= 7 && hour < 18 ? 1 : 0, tempF: 54, windMph: 6, sunrise: `${day}T07:30:00-07:00`, sunset: `${day}T18:10:00-07:00`, at: Date.now() };
}
