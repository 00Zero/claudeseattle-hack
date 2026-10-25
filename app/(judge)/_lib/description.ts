// The entry has one description, saved in description_long (description_short is cleared on
// save). Entries saved before the two were merged still have both, so read them together.
export function joinDescription(short: string | null | undefined, long: string | null | undefined) {
  return [short, long]
    .map((part) => (part ?? "").trim())
    .filter(Boolean)
    .join("\n\n");
}
