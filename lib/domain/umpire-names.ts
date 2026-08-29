/**
 * Dutch tussenvoegsels: they belong to the surname that follows them, so
 * "de Steenwinkel" abbreviates as one unit ("dS") rather than two initials.
 * Matched case-insensitively, since rosters carry both "de" and "De".
 */
const PARTICLES = new Set([
  "aan",
  "al",
  "bij",
  "da",
  "de",
  "den",
  "der",
  "des",
  "di",
  "do",
  "dos",
  "du",
  "el",
  "het",
  "in",
  "la",
  "le",
  "op",
  "te",
  "ten",
  "ter",
  "van",
  "vd",
  "von",
  "'t",
]);

function initial(word: string): string {
  return word.slice(0, 1);
}

/**
 * Shorten an umpire's name to "given name + surname initials".
 *
 * The grid's sticky name column is the widest thing on a phone, and the given
 * name is what planners actually address umpires by — so it stays whole and
 * the surname collapses: "Bart Takkenberg" → "Bart T.", "Carel de Steenwinkel"
 * → "Carel dS". A single-word surname keeps its period; a surname carrying a
 * tussenvoegsel reads as a run of initials without one.
 *
 * Names with nothing to shorten (a single word, an empty string) come back
 * unchanged, so the caller can render the result unconditionally.
 */
export function shortenUmpireName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) return parts[0] ?? "";

  const [given, ...surname] = parts;

  // Group the surname into units, gluing each tussenvoegsel to the word it
  // introduces, so only genuinely separate surnames get separate initials.
  const units: string[][] = [];
  let prefix: string[] = [];
  for (const word of surname) {
    if (PARTICLES.has(word.toLowerCase())) {
      prefix.push(word);
      continue;
    }
    units.push([...prefix, word]);
    prefix = [];
  }
  if (prefix.length > 0) units.push(prefix);

  const abbreviated = units
    .map((unit) =>
      unit.length > 1 ? unit.map(initial).join("") : `${initial(unit[0])}.`,
    )
    .join("");

  return `${given} ${abbreviated}`;
}
