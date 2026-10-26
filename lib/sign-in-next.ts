// Where to go after signing in, from /login?next=/resources (links in emails use it).
// The magic link can't carry it (the email template appends its own query string), so
// sendMagicLink keeps it in a short-lived cookie that the sign-in routes read and clear.
// Links opened in another browser fall back to the usual landing page.

export const SIGN_IN_NEXT_COOKIE = "sign_in_next";
export const SIGN_IN_NEXT_MAX_AGE = 60 * 60; // the sign-in link's lifetime

// A path on this site, or null. Rejects other origins ("//evil.example", "/\evil.example").
export function safeNextPath(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 200) return null;
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\") || value.includes("://")) return null;
  return value;
}
