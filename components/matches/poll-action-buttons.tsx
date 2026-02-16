"use client";

import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
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
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { ListPlus, ListMinus } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import type { MatchWithPoll } from "@/lib/actions/matches";
import {
  addMatchesToPoll,
  removeMatchesFromPolls,
  createPoll,
} from "@/lib/actions/polls";

type PollOption = { id: string; title: string | null; status: string };

interface PollActionButtonsProps {
  selectedIds: Set<string>;
  matches: MatchWithPoll[];
  polls: PollOption[];
  onComplete: () => void;
  clearSelection: () => void;
}

const NEW_POLL_VALUE = "__new__";

export function PollActionButtons({
  selectedIds,
  matches,
  polls,
  onComplete,
  clearSelection,
}: PollActionButtonsProps) {
  const t = useTranslations("matches");
  const tCommon = useTranslations("common");

  // Add to poll dialog state
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [selectedPollId, setSelectedPollId] = useState<string>("");
  const [newPollTitle, setNewPollTitle] = useState("");
  const [adding, setAdding] = useState(false);

  // Remove from poll state
  const [removing, setRemoving] = useState(false);
  const [keepEmpty, setKeepEmpty] = useState(false);

  const selectedMatches = useMemo(
    () => matches.filter((m) => selectedIds.has(m.id)),
    [matches, selectedIds],
  );

  const matchesInPoll = useMemo(
    () => selectedMatches.filter((m) => m.poll !== null),
    [selectedMatches],
  );

  const affectedPollCount = useMemo(() => {
    const pollIds = new Set(matchesInPoll.map((m) => m.poll!.id));
    return pollIds.size;
  }, [matchesInPoll]);

  const openPolls = useMemo(
    () => polls.filter((p) => p.status === "open"),
    [polls],
  );

  const removeEnabled = matchesInPoll.length > 0;
  const isNewPoll = selectedPollId === NEW_POLL_VALUE;

  function resetAddDialog() {
    setSelectedPollId("");
    setNewPollTitle("");
    setAddDialogOpen(false);
  }

  async function handleAddToPoll() {
    setAdding(true);
    try {
      const ids = [...selectedIds];
      if (isNewPoll) {
        if (!newPollTitle.trim()) return;
        await createPoll(newPollTitle.trim(), ids);
      } else {
        await addMatchesToPoll(selectedPollId, ids);
      }
      clearSelection();
      onComplete();
      resetAddDialog();
    } catch {
      toast.error(isNewPoll ? t("createPollError") : t("addToPollError"));
    } finally {
      setAdding(false);
    }
  }

  async function handleRemoveFromPoll() {
    setRemoving(true);
    try {
      const ids = matchesInPoll.map((m) => m.id);
      await removeMatchesFromPolls(ids, keepEmpty);
      clearSelection();
      onComplete();
    } catch {
      toast.error(t("removeFromPollError"));
    } finally {
      setRemoving(false);
      setKeepEmpty(false);
    }
  }

  const addDisabled =
    adding || !selectedPollId || (isNewPoll && !newPollTitle.trim());

  return (
    <>
      {/* Add to Poll button */}
      <Button
        variant="outline"
        size="sm"
        onClick={() => setAddDialogOpen(true)}
      >
        <ListPlus className="mr-2 h-4 w-4" />
        {t("addToPoll")}
      </Button>

      {/* Remove from Poll button */}
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            disabled={!removeEnabled || removing}
          >
            <ListMinus className="mr-2 h-4 w-4" />
            {removing ? t("removing") : t("removeFromPoll")}
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("removeFromPollTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("removeFromPollDescription", {
                count: matchesInPoll.length,
                pollCount: affectedPollCount,
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex items-center gap-2 px-1 py-2">
            <Checkbox
              id="keep-empty-polls"
              checked={keepEmpty}
              onCheckedChange={(checked) => setKeepEmpty(checked === true)}
            />
            <Label htmlFor="keep-empty-polls" className="text-sm">
              {t("keepEmptyPolls")}
            </Label>
          </div>
          {!keepEmpty && (
            <p className="text-sm text-muted-foreground px-1">
              {t("removeFromPollDeleteWarning")}
            </p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setKeepEmpty(false)}>
              {tCommon("cancel")}
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleRemoveFromPoll}>
              {t("removeFromPoll")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Add to Poll dialog */}
      <Dialog
        open={addDialogOpen}
        onOpenChange={(open) => {
          if (!open) resetAddDialog();
          else setAddDialogOpen(true);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("addToPollTitle")}</DialogTitle>
            <DialogDescription>
              {t("addToPollDescription", { count: selectedIds.size })}
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-4 py-2">
            <div className="flex flex-col gap-2">
              <Label>{t("selectPoll")}</Label>
              <Select value={selectedPollId} onValueChange={setSelectedPollId}>
                <SelectTrigger>
                  <SelectValue placeholder={t("selectPoll")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NEW_POLL_VALUE}>
                    {t("createNewPoll")}
                  </SelectItem>
                  {openPolls.map((poll) => (
                    <SelectItem key={poll.id} value={poll.id}>
                      {poll.title ?? poll.id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {isNewPoll && (
              <div className="flex flex-col gap-2">
                <Label htmlFor="new-poll-title">{t("pollTitleLabel")}</Label>
                <Input
                  id="new-poll-title"
                  placeholder={t("pollTitlePlaceholder")}
                  value={newPollTitle}
                  onChange={(e) => setNewPollTitle(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !addDisabled) {
                      e.preventDefault();
                      handleAddToPoll();
                    }
                  }}
                />
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={resetAddDialog}>
              {tCommon("cancel")}
            </Button>
            <Button onClick={handleAddToPoll} disabled={addDisabled}>
              {adding
                ? t("adding")
                : isNewPoll
                  ? t("createPollButton")
                  : t("addToPollButton")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
