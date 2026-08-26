function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Remove the poll's own club name from the front of a team name.
 *
 * Within a poll every home team belongs to the same club, so the club name
 * distinguishes nothing and only widens the column. Both shapes the club uses
 * are handled: the plain prefix ("VVV HC MO16-1") and the combination-team
 * prefix ("AMVJ/VVV HC JO14-1"), which is why anything before the club name
 * must end in a slash.
 *
 * Returns the original name when there is no club to strip, when the name does
 * not start with it, or when stripping would leave nothing behind.
 */
export function stripClubPrefix(
  team: string,
  clubName: string | null | undefined,
): string {
  if (!clubName) return team;

  const pattern = new RegExp(
    `^\\s*(?:[^\\s/][^/]*/)?${escapeRegExp(clubName)}\\s+`,
    "i",
  );

  const stripped = team.replace(pattern, "").trim();
  return stripped.length > 0 ? stripped : team;
}
