// Whether new people can create an account (event_settings.registration, set in Admin -> Settings).
// auto (or unset): open until the event ends, then closed. Existing accounts always sign in.

export const REGISTRATION_MODES = ["auto", "open", "closed"] as const;
export type RegistrationMode = (typeof REGISTRATION_MODES)[number];

export function registrationMode(value: unknown): RegistrationMode {
  return REGISTRATION_MODES.includes(value as RegistrationMode) ? (value as RegistrationMode) : "auto";
}

export function registrationOpen(mode: RegistrationMode, eventEndsAt: string | null | undefined, now = Date.now()) {
  if (mode !== "auto") return mode === "open";
  return !eventEndsAt || now < Date.parse(eventEndsAt);
}
