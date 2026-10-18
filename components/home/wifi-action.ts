"use server";

import { createClient } from "@/lib/supabase/server";

// Venue Wi-Fi comes from event_settings (entered at /admin/settings, not the public repo), and only
// reaches the browser when someone clicks to reveal it, so it isn't in the page HTML for crawlers.
export async function getWifi() {
  const supabase = await createClient();
  const { data } = await supabase.from("event_settings").select("wifi_network, wifi_password").eq("id", 1).single();
  const network = data?.wifi_network;
  const password = data?.wifi_password;
  return network && password ? { network, password } : null;
}
