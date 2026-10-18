"use server";

// Venue Wi-Fi comes from env (WIFI_NETWORK, WIFI_PASSWORD), not the public repo, and only reaches
// the browser when someone clicks to reveal it, so it isn't in the page HTML for crawlers.
export async function getWifi() {
  const network = process.env.WIFI_NETWORK;
  const password = process.env.WIFI_PASSWORD;
  return network && password ? { network, password } : null;
}
