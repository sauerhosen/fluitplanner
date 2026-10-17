"use client";

import { useRef, useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { toast } from "sonner";
import { ArrowLeft, CalendarDays, CircleCheck, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { ClubTeamBrowser } from "@/components/hockey/club-team-browser";
import {
  getClubDayFixtures,
  getTeamFixtures,
  importClubDayFixtures,
  importTeamFixtures,
  type TeamFixture,
} from "@/lib/actions/hockey-import";
import type { ClubSearchResult } from "@/lib/actions/hockey-teams";
import { deleteMatch } from "@/lib/actions/matches";
import { cn } from "@/lib/utils";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported: () => void;
};

/** Today as the `YYYY-MM-DD` an `<input type="date">` takes, in the viewer's zone. */
function todayInputValue(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

/**
 * Import single fixtures straight from the Match Center, for a team the club
 * does not track. Nothing is subscribed: the picked matches land as ordinary
 * matches and the nightly sync leaves them alone.
 */
export function MatchCenterImportDialog({
  open,
  onOpenChange,
  onImported,
}: Props) {
  const t = useTranslations("matches");
  const tCommon = useTranslations("common");
  const format = useFormatter();
  // What the fixture list shows: one team's upcoming home matches, or every
  // home match of a club on one day.
  const [view, setView] = useState<
    | { kind: "team"; club: ClubSearchResult; teamId: number; name: string }
    | { kind: "day"; club: ClubSearchResult }
    | null
  >(null);
  const [date, setDate] = useState("");
  const [fixtures, setFixtures] = useState<TeamFixture[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<number[]>([]);
  const [importing, setImporting] = useState(false);
  // An added fixture the planner unticked, awaiting their go-ahead to delete.
  const [removing, setRemoving] = useState<TeamFixture | null>(null);
  const teamSeqRef = useRef(0);

  async function handleSelectTeam(
    club: ClubSearchResult,
    teamId: number,
    name: string,
  ) {
    // Going back and picking another team must not let the first team's
    // fixtures — or its failure — land on the second one.
    const seq = ++teamSeqRef.current;
    setView({ kind: "team", club, teamId, name });
    setFixtures([]);
    setSelected([]);
    setLoading(true);
    try {
      const result = await getTeamFixtures({ clubId: club.id, teamId });
      if (seq !== teamSeqRef.current) return;
      showFixtures(result);
    } catch {
      if (seq !== teamSeqRef.current) return;
      // Server-action error messages are a generic digest in production, so
      // every upstream failure reads the same here.
      toast.error(t("matchCenterLoadError"));
      setView(null);
    } finally {
      if (seq === teamSeqRef.current) setLoading(false);
    }
  }

  function handleSelectDay(club: ClubSearchResult) {
    teamSeqRef.current++;
    setView({ kind: "day", club });
    setDate("");
    setFixtures([]);
    setSelected([]);
    setLoading(false);
  }

  async function handleDateChange(value: string, club: ClubSearchResult) {
    const seq = ++teamSeqRef.current;
    setDate(value);
    setFixtures([]);
    setSelected([]);
    if (!value) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const result = await getClubDayFixtures({ clubId: club.id, date: value });
      if (seq !== teamSeqRef.current) return;
      showFixtures(result);
    } catch {
      if (seq !== teamSeqRef.current) return;
      toast.error(t("matchCenterDayLoadError"));
      // Back to "pick a date": an empty list under the date would read as
      // "no home matches that day" when the day simply failed to load.
      setDate("");
    } finally {
      if (seq === teamSeqRef.current) setLoading(false);
    }
  }

  /** A fixture the club already has starts ticked: the tick means "in the club". */
  function showFixtures(result: TeamFixture[]) {
    setFixtures(result);
    setSelected(
      result
        .filter((fixture) => fixture.alreadyImported)
        .map((fixture) => fixture.matchId),
    );
  }

  function handleCheckedChange(fixture: TeamFixture) {
    // Unticking a match the club has deletes it — only after confirming.
    if (fixture.alreadyImported && selected.includes(fixture.matchId)) {
      setRemoving(fixture);
      return;
    }
    toggle(fixture.matchId);
  }

  async function handleRemove(fixture: TeamFixture) {
    if (!fixture.existingMatchId) return;
    try {
      await deleteMatch(fixture.existingMatchId);
    } catch {
      toast.error(t("matchCenterRemoveError"));
      return;
    }
    setFixtures((prev) =>
      prev.map((candidate) =>
        candidate.matchId === fixture.matchId
          ? { ...candidate, alreadyImported: false, existingMatchId: null }
          : candidate,
      ),
    );
    setSelected((prev) => prev.filter((id) => id !== fixture.matchId));
    toast.success(t("matchCenterRemoved"));
    onImported();
  }

  function toggle(matchId: number) {
    setSelected((prev) =>
      prev.includes(matchId)
        ? prev.filter((id) => id !== matchId)
        : [...prev, matchId],
    );
  }

  async function handleImport() {
    if (!view || selected.length === 0) return;
    setImporting(true);
    try {
      const result =
        view.kind === "team"
          ? await importTeamFixtures({
              clubId: view.club.id,
              teamId: view.teamId,
              matchIds: selected,
            })
          : await importClubDayFixtures({
              clubId: view.club.id,
              date,
              matchIds: selected,
            });

      const parts = [
        result.imported > 0 &&
          t("matchCenterAdded", { count: result.imported }),
        result.updated > 0 &&
          t("matchCenterUpdated", { count: result.updated }),
        result.skipped > 0 &&
          t("matchCenterSkipped", { count: result.skipped }),
      ].filter((part): part is string => typeof part === "string");

      if (result.errors.length > 0) {
        toast.error(t("matchCenterImportError"));
      } else if (parts.length === 0) {
        // Every picked fixture vanished upstream between loading the list and
        // importing it — nothing was written, so don't claim success.
        toast.error(t("matchCenterNothingImported"));
      } else {
        toast.success(parts.join(", "));
      }
      if (result.imported > 0 || result.updated > 0) onImported();
      onOpenChange(false);
    } catch {
      toast.error(t("matchCenterImportError"));
    } finally {
      setImporting(false);
    }
  }

  const newCount = fixtures.filter(
    (fixture) => !fixture.alreadyImported && selected.includes(fixture.matchId),
  ).length;

  function fixtureLabel(fixture: TeamFixture): string {
    // `fixture.date` is a calendar date, not an instant: parse and format it
    // in UTC so it reads the same whatever zone the viewer's browser is in.
    // Parsed as local time it would land a day early east of Amsterdam.
    const date = format.dateTime(new Date(`${fixture.date}T00:00:00Z`), {
      timeZone: "UTC",
      weekday: "short",
      day: "numeric",
      month: "short",
    });
    const time = fixture.start
      ? format.dateTime(new Date(fixture.start), {
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        })
      : t("matchCenterTimeTbd");
    return `${date} ${time}`;
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("matchCenterImport")}</DialogTitle>
          <DialogDescription>{t("matchCenterImportHint")}</DialogDescription>
        </DialogHeader>

        {/* The browser stays mounted behind the fixture list so going back
            returns to the club's teams, not to an empty search. */}
        <div hidden={view !== null}>
          <ClubTeamBrowser
            renderClubAction={(club) => (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full justify-start"
                onClick={() => handleSelectDay(club)}
              >
                <CalendarDays className="mr-2 h-4 w-4" />
                {t("matchCenterByDay")}
              </Button>
            )}
            renderTeam={(option, club) => (
              <button
                type="button"
                onClick={() =>
                  handleSelectTeam(club, option.teamId, option.name)
                }
                className="hover:bg-muted w-full rounded-md px-2 py-1.5 text-left text-sm"
              >
                {option.name}
              </button>
            )}
          />
        </div>

        {view && (
          <div className="space-y-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                teamSeqRef.current++;
                setLoading(false);
                setView(null);
              }}
            >
              <ArrowLeft className="mr-1 h-4 w-4" />
              {view.kind === "team"
                ? view.name
                : `${view.club.name} · ${t("matchCenterByDayTitle")}`}
            </Button>
            {view.kind === "day" && (
              <label className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">
                  {t("matchCenterDateLabel")}
                </span>
                <Input
                  type="date"
                  value={date}
                  min={todayInputValue()}
                  onChange={(event) =>
                    handleDateChange(event.target.value, view.club)
                  }
                  className="w-auto"
                />
              </label>
            )}
            {view.kind === "day" && !date ? (
              <p className="text-muted-foreground py-4 text-sm">
                {t("matchCenterPickDate")}
              </p>
            ) : loading ? (
              <div className="text-muted-foreground flex items-center gap-2 py-4 text-sm">
                <Loader2 className="h-4 w-4 animate-spin" />
                {t("matchCenterLoadingFixtures")}
              </div>
            ) : fixtures.length === 0 ? (
              <p className="text-muted-foreground py-4 text-sm">
                {view.kind === "day"
                  ? t("matchCenterNoDayFixtures")
                  : t("matchCenterNoFixtures")}
              </p>
            ) : (
              <ul className="max-h-72 space-y-1 overflow-y-auto">
                {fixtures.map((fixture) => (
                  <li key={fixture.matchId}>
                    {/* A fixture the club already has stays ticked and is
                        re-read on import: this is the only way to collect a
                        kick-off time that was still TBD when it was imported,
                        since the nightly sync does not follow this team.
                        Re-importing an unchanged one writes nothing. */}
                    <label
                      className={cn(
                        "flex cursor-pointer items-start gap-3 rounded-md border-l-4 px-2 py-2 text-sm",
                        fixture.alreadyImported
                          ? "border-green-600 bg-green-50 hover:bg-green-100 dark:bg-green-900/30 dark:hover:bg-green-900/50"
                          : "hover:bg-muted border-transparent",
                      )}
                    >
                      <Checkbox
                        className="mt-0.5"
                        checked={selected.includes(fixture.matchId)}
                        onCheckedChange={() => handleCheckedChange(fixture)}
                      />
                      <span className="min-w-0">
                        <span className="block truncate font-medium">
                          {fixture.homeTeam} – {fixture.awayTeam}
                        </span>
                        <span className="text-muted-foreground block truncate text-xs">
                          {fixture.alreadyImported && (
                            <span className="font-medium text-green-700 dark:text-green-400">
                              <CircleCheck className="mr-1 inline h-3.5 w-3.5 align-[-0.2em]" />
                              {t("matchCenterAlreadyAdded")} ·{" "}
                            </span>
                          )}
                          {fixtureLabel(fixture)}
                          {fixture.venue ? ` · ${fixture.venue}` : ""}
                          {fixture.field ? ` · ${fixture.field}` : ""}
                        </span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {view && fixtures.length > 0 && (
          <DialogFooter>
            <Button
              onClick={handleImport}
              disabled={selected.length === 0 || importing}
            >
              {importing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {/* Only the new ticks count as imports; with none, the button
                  just re-reads the matches the club already has. */}
              {newCount === 0 && selected.length > 0
                ? t("matchCenterUpdate")
                : t("matchCenterImportSelected", { count: newCount })}
            </Button>
          </DialogFooter>
        )}

        <AlertDialog
          open={removing !== null}
          onOpenChange={(isOpen) => {
            if (!isOpen) setRemoving(null);
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t("matchCenterRemoveTitle")}</AlertDialogTitle>
              <AlertDialogDescription>
                {removing &&
                  t("matchCenterRemoveBody", {
                    match: `${removing.homeTeam} – ${removing.awayTeam}`,
                  })}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{tCommon("cancel")}</AlertDialogCancel>
              <AlertDialogAction
                variant="destructive"
                onClick={() => {
                  if (removing) void handleRemove(removing);
                }}
              >
                {t("matchCenterRemove")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </DialogContent>
    </Dialog>
  );
}
