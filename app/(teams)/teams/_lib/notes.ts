// Notes on applications and invites: optional, at most 50 words (teams_notes migration checks
// the same limit). Pure, so the form can count words as you type.

export const NOTE_MAX_WORDS = 50;

export function countWords(text: string) {
  const trimmed = text.trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}

// Trimmed note, or null when empty. Throws a user-facing message when it's too long.
export function cleanNote(value: FormDataEntryValue | null): string | null {
  const note = typeof value === "string" ? value.trim() : "";
  if (!note) return null;
  if (countWords(note) > NOTE_MAX_WORDS || note.length > 400) {
    throw new Error(`Keep your note to ${NOTE_MAX_WORDS} words.`);
  }
  return note;
}
