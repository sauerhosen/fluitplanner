"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { ArrowLeft, Check, Loader2, Plus, Search } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  searchClubs,
  getClubTeams,
  trackTeam,
  type ClubSearchResult,
  type ClubTeamOption,
} from "@/lib/actions/hockey-teams";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onTracked: () => void;
};

export function HockeyTeamPickerDialog({
  open,
  onOpenChange,
  onTracked,
}: Props) {
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
  const [trackingId, setTrackingId] = useState<number | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchSeqRef = useRef(0);

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      setQuery("");
      setClubs([]);
      setSearched(false);
      setSelectedClub(null);
      setTeams([]);
    }
    onOpenChange(nextOpen);
  }

  function handleQueryChange(value: string) {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (value.trim().length < 2) {
      searchSeqRef.current++;
      setClubs([]);
      setSearched(false);
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
    setSelectedClub(club);
    setLoadingTeams(true);
    try {
      setTeams(await getClubTeams(club.id));
    } catch {
      toast.error(t("hockeySyncSearchError"));
      setSelectedClub(null);
    } finally {
      setLoadingTeams(false);
    }
  }

  async function handleTrack(team: ClubTeamOption) {
    if (!selectedClub) return;
    setTrackingId(team.teamId);
    try {
      await trackTeam({
        clubId: selectedClub.id,
        clubName: selectedClub.name,
        teamId: team.teamId,
        teamName: team.name,
        hockeyType: team.hockeyType,
        recentPouleId: team.recentPouleId,
      });
      setTeams((prev) =>
        prev.map((item) =>
          item.teamId === team.teamId ? { ...item, tracked: true } : item,
        ),
      );
      onTracked();
    } catch (error) {
      const message =
        error instanceof Error && error.message === "ALREADY_TRACKED"
          ? t("hockeySyncAlreadyTracked")
          : t("hockeySyncTrackError");
      toast.error(message);
    } finally {
      setTrackingId(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("hockeySyncAddTeam")}</DialogTitle>
          <DialogDescription>{t("hockeySyncAddTeamHint")}</DialogDescription>
        </DialogHeader>
        {selectedClub ? (
          <div className="space-y-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSelectedClub(null)}
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
                  <li
                    key={team.teamId}
                    className="flex items-center justify-between rounded-md px-2 py-1.5"
                  >
                    <span className="text-sm">{team.name}</span>
                    {team.tracked ? (
                      <span className="text-muted-foreground flex items-center gap-1 text-sm">
                        <Check className="h-4 w-4" />
                        {t("hockeySyncTracked")}
                      </span>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={trackingId !== null}
                        onClick={() => handleTrack(team)}
                      >
                        {trackingId === team.teamId ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Plus className="h-4 w-4" />
                        )}
                        {t("hockeySyncTrack")}
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : (
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
        )}
      </DialogContent>
    </Dialog>
  );
}
