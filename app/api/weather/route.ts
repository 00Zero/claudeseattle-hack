import { NextResponse } from "next/server";
import { fallbackWeather, getVenueWeather } from "@/lib/weather";

// Public. Weather at the venue for the home page skyline and the sunset-driven theme.
// The upstream fetch is cached for ten minutes (see lib/weather.ts), so this costs one
// Open-Meteo call per ten minutes however many people are on the page.
export async function GET() {
  try {
    const weather = await getVenueWeather();
    return NextResponse.json(weather, { headers: { "Cache-Control": "public, max-age=300, stale-while-revalidate=600" } });
  } catch {
    return NextResponse.json({ ...fallbackWeather(), fallback: true }, { headers: { "Cache-Control": "no-store" } });
  }
}
