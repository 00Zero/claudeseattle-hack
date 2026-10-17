// The event runs in Seattle; deadlines are entered and shown in Pacific time.
export const EVENT_TIME_ZONE = "America/Los_Angeles";

// Offset of the time zone from UTC at a given instant, in minutes (e.g. -420 for PDT).
function zoneOffsetMinutes(instant: Date) {
  const name = new Intl.DateTimeFormat("en-US", { timeZone: EVENT_TIME_ZONE, timeZoneName: "longOffset" })
    .formatToParts(instant)
    .find((part) => part.type === "timeZoneName")?.value; // "GMT-07:00"
  const match = name?.match(/GMT([+-])(\d{2}):(\d{2})/);
  if (!match) return 0;
  const minutes = Number(match[2]) * 60 + Number(match[3]);
  return match[1] === "-" ? -minutes : minutes;
}

// "2026-10-25T10:30" (Pacific wall time, from <input type="datetime-local">) -> ISO UTC string.
export function pacificInputToIso(local: string) {
  const asUtc = new Date(`${local}:00Z`);
  if (Number.isNaN(asUtc.getTime())) return null;
  const firstGuess = new Date(asUtc.getTime() - zoneOffsetMinutes(asUtc) * 60_000);
  return new Date(asUtc.getTime() - zoneOffsetMinutes(firstGuess) * 60_000).toISOString();
}

// ISO timestamp -> "2026-10-25T10:30" in Pacific time, for datetime-local inputs.
export function isoToPacificInput(iso: string) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: EVENT_TIME_ZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(new Date(iso))
      .map((part) => [part.type, part.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

// ISO timestamp -> "Sun Oct 25, 10:30 am" in Pacific time.
export function formatPacific(iso: string) {
  const date = new Date(iso);
  const day = new Intl.DateTimeFormat("en-US", {
    timeZone: EVENT_TIME_ZONE,
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(date);
  const time = new Intl.DateTimeFormat("en-US", { timeZone: EVENT_TIME_ZONE, hour: "numeric", minute: "2-digit" })
    .format(date)
    .replace(" AM", " am")
    .replace(" PM", " pm");
  return `${day}, ${time}`;
}
