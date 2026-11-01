/**
 * Hidden poll matches: a planner-side declutter. A hidden match stays in the
 * poll (its slot, and every umpire's answer for it, are untouched) but folds
 * out of the assignment grid and is left out of exports.
 */

type Dated = { id: string; date: string };

export type MatchSegment<M extends Dated> =
  { kind: "match"; match: M } | { kind: "hidden"; key: string; matches: M[] };

/**
 * Walk already-sorted matches and fold each run of consecutive hidden matches
 * into one segment, so the grid renders one narrow marker per run rather than
 * a column per hidden match. A run never spans two dates: the grid groups by
 * date and a marker has to sit under one day's header.
 */
export function collapseHiddenMatches<M extends Dated>(
  sorted: M[],
  hiddenIds: ReadonlySet<string>,
): MatchSegment<M>[] {
  const segments: MatchSegment<M>[] = [];
  for (const match of sorted) {
    if (!hiddenIds.has(match.id)) {
      segments.push({ kind: "match", match });
      continue;
    }
    const last = segments[segments.length - 1];
    if (last?.kind === "hidden" && last.matches[0].date === match.date) {
      last.matches.push(match);
    } else {
      segments.push({
        kind: "hidden",
        key: `hidden-${match.id}`,
        matches: [match],
      });
    }
  }
  return segments;
}

/** The matches that should reach an export. */
export function withoutHidden<M extends { id: string }>(
  matches: M[],
  hiddenIds: readonly string[],
): M[] {
  if (hiddenIds.length === 0) return matches;
  const hidden = new Set(hiddenIds);
  return matches.filter((m) => !hidden.has(m.id));
}
