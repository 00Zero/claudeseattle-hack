import "server-only";
import { createClient } from "@supabase/supabase-js";
import { fetchWithTimeout } from "@/lib/supabase/fetch-timeout";

// Announcement banners below the site header (*_shared_banners.sql), written and scheduled in
// /admin/banners. A banner is live while starts_at <= now < ends_at.

export const BANNER_TONES = ["info", "urgent"] as const;
export type BannerTone = (typeof BANNER_TONES)[number];
export const BANNER_MAX_LENGTH = 500;

export type Banner = {
  id: string;
  message: string;
  tone: BannerTone;
  starts_at: string;
  ends_at: string;
};

export const BANNER_COLUMNS = "id, message, tone, starts_at, ends_at";

// Live banners, the same for everyone: an anonymous client without cookies (RLS returns only
// banners inside their window), so the root layout and /api/banners never touch the session.
export async function getLiveBanners(): Promise<Banner[]> {
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: fetchWithTimeout(5_000) },
  });
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("banners")
    .select(BANNER_COLUMNS)
    .lte("starts_at", now)
    .gt("ends_at", now)
    .order("starts_at");
  if (error) throw new Error(error.message);
  return (data ?? []) as Banner[];
}
