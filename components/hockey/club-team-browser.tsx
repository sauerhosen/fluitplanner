"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { ArrowLeft, Loader2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  searchClubs,
  getClubTeams,
  type ClubSearchResult,
  type ClubTeamOption,
} from "@/lib/actions/hockey-teams";

type Props = {
  /** Row content for one team — the caller owns what the row does. */
  renderTeam: (team: ClubTeamOption, club: ClubSearchResult) => ReactNode;
};

/**
 * Search a club, then browse its field hockey teams. Shared by the settings
 * team picker and the matches page's Match Center import, which differ only
 * in what a team row offers. State lives here and is dropped on unmount, so a
 * dialog that unmounts its content reopens on a clean search.
 *
 * The strings are the `settings` namespace's `hockeySync*` keys — one club
 * search vocabulary, wherever the browser is shown.
 */
export function ClubTeamBrowser({ renderTeam }: Props) {
  const t = useTranslations("settings");
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [clubs, setClubs] = useState<ClubSearchResult[]>([]);
  const [searched, setSearched] = useState(false);
  const [selectedClub, setSelectedClub] = useState<ClubSearchResult | null>(
    null,
  );
  const [teams, setTeams] = useState<ClubTeamOption[]>([]);
  const [loadingTeams, setLoadingTeams] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchSeqRef = useRef(0);
  const clubSeqRef = useRef(0);

  useEffect(
    () => () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      // Invalidate any in-flight request so it cannot set state after unmount.
      searchSeqRef.current++;
      clubSeqRef.current++;
    },
    [],
  );

  function handleQueryChange(value: string) {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (value.trim().length < 2) {
      searchSeqRef.current++;
      setClubs([]);
      setSearched(false);
      // An invalidated in-flight request skips its own cleanup — do it here
      // so the spinner cannot get stuck.
      setSearching(false);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      // Guard against an earlier in-flight request resolving after this one
      const seq = ++searchSeqRef.current;
      setSearching(true);
      try {
        const results = await searchClubs(value);
        if (seq !== searchSeqRef.current) return;
        setClubs(results);
        setSearched(true);
      } catch {
        if (seq === searchSeqRef.current)
          toast.error(t("hockeySyncSearchError"));
      } finally {
        if (seq === searchSeqRef.current) setSearching(false);
      }
    }, 400);
  }

  async function handleSelectClub(club: ClubSearchResult) {
    // Same sequence guard as the search: going back and picking another club
    // must not let the first club's teams land under the second one's header.
    const seq = ++clubSeqRef.current;
    setSelectedClub(club);
    setTeams([]);
    setLoadingTeams(true);
    try {
      const result = await getClubTeams(club.id);
      if (seq !== clubSeqRef.current) return;
      setTeams(result);
    } catch {
      if (seq !== clubSeqRef.current) return;
      toast.error(t("hockeySyncSearchError"));
      setSelectedClub(null);
    } finally {
      if (seq === clubSeqRef.current) setLoadingTeams(false);
    }
  }

  if (selectedClub) {
    return (
      <div className="space-y-3">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            clubSeqRef.current++;
            setLoadingTeams(false);
            setSelectedClub(null);
          }}
        >
          <ArrowLeft className="mr-1 h-4 w-4" />
          {selectedClub.name}
        </Button>
        {loadingTeams ? (
          <div className="text-muted-foreground flex items-center gap-2 py-4 text-sm">
            <Loader2 className="h-4 w-4 animate-spin" />
            {t("hockeySyncLoadingTeams")}
          </div>
        ) : teams.length === 0 ? (
          <p className="text-muted-foreground py-4 text-sm">
            {t("hockeySyncNoTeams")}
          </p>
        ) : (
          <ul className="max-h-72 space-y-1 overflow-y-auto">
            {teams.map((team) => (
              <li key={team.teamId}>{renderTeam(team, selectedClub)}</li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="text-muted-foreground absolute top-2.5 left-2.5 h-4 w-4" />
        <Input
          value={query}
          onChange={(event) => handleQueryChange(event.target.value)}
          placeholder={t("hockeySyncSearchClubs")}
          className="pl-8"
          autoFocus
        />
      </div>
      {searching ? (
        <div className="text-muted-foreground flex items-center gap-2 py-4 text-sm">
          <Loader2 className="h-4 w-4 animate-spin" />
          {t("hockeySyncSearching")}
        </div>
      ) : clubs.length === 0 && searched ? (
        <p className="text-muted-foreground py-4 text-sm">
          {t("hockeySyncNoResults")}
        </p>
      ) : (
        <ul className="max-h-72 space-y-1 overflow-y-auto">
          {clubs.map((club) => (
            <li key={club.id}>
              <button
                type="button"
                onClick={() => handleSelectClub(club)}
                className="hover:bg-muted flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm"
              >
                <span>{club.name}</span>
                <span className="text-muted-foreground">{club.city}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
