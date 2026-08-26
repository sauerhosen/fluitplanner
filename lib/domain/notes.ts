/**
 * Maximum length of a planner note on a match.
 *
 * Lives outside the server-action module so both the client inputs and the
 * server-side validation can import it: a `"use server"` file may only export
 * async functions.
 */
export const MAX_NOTE_LENGTH = 2000;
