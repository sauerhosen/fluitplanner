/**
 * Maximum length of a planner note (on a match, or on an umpire).
 *
 * Lives outside the server-action modules so both the client inputs and the
 * server-side validation can import it: a `"use server"` file may only export
 * async functions.
 */
export const MAX_NOTE_LENGTH = 2000;

/**
 * Apply the note-writing rules shared by every write path: trim, cap the
 * length, and store a blank body as NULL so "has a note" stays a single check
 * wherever it is rendered.
 */
export function normalizeNote(notes: string | null): string | null {
  if (notes === null) return null;
  const trimmed = notes.trim();
  if (trimmed.length > MAX_NOTE_LENGTH) {
    throw new Error(`Note cannot be longer than ${MAX_NOTE_LENGTH} characters`);
  }
  return trimmed || null;
}
