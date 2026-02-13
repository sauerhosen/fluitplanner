"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import type { Match } from "@/lib/types/domain";
import { groupMatchesIntoSlots } from "@/lib/domain/slots";
import { createPoll } from "@/lib/actions/polls";
import { MatchSelector } from "./match-selector";
import { SlotPreview } from "./slot-preview";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Props = {
  availableMatches: Match[];
};

export function PollForm({ availableMatches }: Props) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [selectedMatchIds, setSelectedMatchIds] = useState<string[]>([]);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const filteredMatches = useMemo(() => {
    return availableMatches.filter((m) => {
      if (dateFrom && m.date < dateFrom) return false;
      if (dateTo && m.date > dateTo) return false;
      return true;
    });
  }, [availableMatches, dateFrom, dateTo]);

  const slots = useMemo(() => {
    const selected = availableMatches.filter((m) =>
      selectedMatchIds.includes(m.id),
    );
    const withStartTime = selected.filter((m) => m.start_time);
    return groupMatchesIntoSlots(withStartTime as { start_time: string }[]);
  }, [availableMatches, selectedMatchIds]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!title.trim()) {
      setError("Title is required");
      return;
    }
    if (selectedMatchIds.length === 0) {
      setError("Select at least one match");
      return;
    }

    setSaving(true);
    try {
      const { id } = await createPoll(title, selectedMatchIds);
      router.push(`/protected/polls/${id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create poll");
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      {error && (
        <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="flex flex-col gap-2">
        <Label htmlFor="title">Poll Title</Label>
        <Input
          id="title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Weekend 15-16 February"
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label>Filter by Date</Label>
        <div className="flex gap-2">
          <Input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            placeholder="From"
            className="w-40"
          />
          <Input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            placeholder="To"
            className="w-40"
          />
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label>Select Matches ({selectedMatchIds.length} selected)</Label>
        <MatchSelector
          matches={filteredMatches}
          selectedIds={selectedMatchIds}
          onSelectionChange={setSelectedMatchIds}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label>Time Slots Preview</Label>
        <SlotPreview slots={slots} />
      </div>

      <Button type="submit" disabled={saving}>
        {saving ? "Creating..." : "Create Poll"}
      </Button>
    </form>
  );
}
