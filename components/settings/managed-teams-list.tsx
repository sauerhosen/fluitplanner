"use client";

import { useState } from "react";
import type { ManagedTeam } from "@/lib/types/domain";
import {
  createManagedTeam,
  updateManagedTeam,
  deleteManagedTeam,
} from "@/lib/actions/managed-teams";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Trash2, Pencil, Plus, Check, X } from "lucide-react";

const LEVEL_LABELS: Record<number, string> = {
  1: "Any",
  2: "Experienced",
  3: "Top",
};

const LEVEL_VARIANTS: Record<number, "default" | "secondary" | "destructive"> =
  {
    1: "secondary",
    2: "default",
    3: "destructive",
  };

export function ManagedTeamsList({
  initialTeams,
}: {
  initialTeams: ManagedTeam[];
}) {
  const [teams, setTeams] = useState<ManagedTeam[]>(initialTeams);
  const [newName, setNewName] = useState("");
  const [newLevel, setNewLevel] = useState<"1" | "2" | "3">("1");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editLevel, setEditLevel] = useState<"1" | "2" | "3">("1");
  const [loading, setLoading] = useState(false);

  async function handleAdd() {
    if (!newName.trim()) return;
    setLoading(true);
    try {
      const team = await createManagedTeam(
        newName.trim(),
        Number(newLevel) as 1 | 2 | 3,
      );
      setTeams((prev) =>
        [...prev, team].sort((a, b) => a.name.localeCompare(b.name)),
      );
      setNewName("");
      setNewLevel("1");
    } finally {
      setLoading(false);
    }
  }

  async function handleUpdate(id: string) {
    if (!editName.trim()) return;
    setLoading(true);
    try {
      const updated = await updateManagedTeam(
        id,
        editName.trim(),
        Number(editLevel) as 1 | 2 | 3,
      );
      setTeams((prev) =>
        prev
          .map((t) => (t.id === id ? updated : t))
          .sort((a, b) => a.name.localeCompare(b.name)),
      );
      setEditingId(null);
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id: string) {
    setLoading(true);
    try {
      await deleteManagedTeam(id);
      setTeams((prev) => prev.filter((t) => t.id !== id));
    } finally {
      setLoading(false);
    }
  }

  function startEdit(team: ManagedTeam) {
    setEditingId(team.id);
    setEditName(team.name);
    setEditLevel(String(team.required_level) as "1" | "2" | "3");
  }

  return (
    <div className="space-y-4">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Team Name</TableHead>
            <TableHead className="w-40">Required Level</TableHead>
            <TableHead className="w-24">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {teams.map((team) => (
            <TableRow key={team.id}>
              {editingId === team.id ? (
                <>
                  <TableCell>
                    <Input
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      onKeyDown={(e) =>
                        e.key === "Enter" && handleUpdate(team.id)
                      }
                    />
                  </TableCell>
                  <TableCell>
                    <Select
                      value={editLevel}
                      onValueChange={(v) => setEditLevel(v as "1" | "2" | "3")}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1">1 — Any</SelectItem>
                        <SelectItem value="2">2 — Experienced</SelectItem>
                        <SelectItem value="3">3 — Top</SelectItem>
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => handleUpdate(team.id)}
                        disabled={loading}
                      >
                        <Check className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => setEditingId(null)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </>
              ) : (
                <>
                  <TableCell>{team.name}</TableCell>
                  <TableCell>
                    <Badge variant={LEVEL_VARIANTS[team.required_level]}>
                      {team.required_level} —{" "}
                      {LEVEL_LABELS[team.required_level]}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => startEdit(team)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => handleDelete(team.id)}
                        disabled={loading}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </>
              )}
            </TableRow>
          ))}

          {/* Add new row */}
          <TableRow>
            <TableCell>
              <Input
                placeholder="Team name (e.g. Heren 01)"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAdd()}
              />
            </TableCell>
            <TableCell>
              <Select
                value={newLevel}
                onValueChange={(v) => setNewLevel(v as "1" | "2" | "3")}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">1 — Any</SelectItem>
                  <SelectItem value="2">2 — Experienced</SelectItem>
                  <SelectItem value="3">3 — Top</SelectItem>
                </SelectContent>
              </Select>
            </TableCell>
            <TableCell>
              <Button
                size="icon"
                variant="ghost"
                onClick={handleAdd}
                disabled={loading || !newName.trim()}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </div>
  );
}
