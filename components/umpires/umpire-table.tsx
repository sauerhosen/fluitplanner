"use client";

import { useState } from "react";
import type { Umpire } from "@/lib/types/domain";
import { deleteUmpire } from "@/lib/actions/umpires";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreHorizontal, Pencil, Trash2, Check, X, Inbox } from "lucide-react";

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

export function UmpireTable({
  umpires,
  onEdit,
  onDeleted,
}: {
  umpires: Umpire[];
  onEdit: (umpire: Umpire) => void;
  onDeleted: () => void;
}) {
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function handleDelete(id: string) {
    setDeletingId(id);
    try {
      await deleteUmpire(id);
      onDeleted();
    } finally {
      setDeletingId(null);
    }
  }

  if (umpires.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-12 text-center text-muted-foreground">
        <Inbox className="h-10 w-10" />
        <p>
          No umpires yet. Umpires will appear here when they respond to an
          availability poll, or you can add them manually.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Email</TableHead>
            <TableHead className="w-32">Level</TableHead>
            <TableHead className="w-20">Verified</TableHead>
            <TableHead className="w-12"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {umpires.map((umpire) => (
            <TableRow key={umpire.id}>
              <TableCell className="font-medium">{umpire.name}</TableCell>
              <TableCell>{umpire.email}</TableCell>
              <TableCell>
                <Badge variant={LEVEL_VARIANTS[umpire.level]}>
                  {LEVEL_LABELS[umpire.level]}
                </Badge>
              </TableCell>
              <TableCell>
                {umpire.auth_user_id ? (
                  <Check className="h-4 w-4 text-green-600 dark:text-green-400" />
                ) : (
                  <X className="h-4 w-4 text-muted-foreground" />
                )}
              </TableCell>
              <TableCell>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8">
                      <MoreHorizontal className="h-4 w-4" />
                      <span className="sr-only">More actions</span>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => onEdit(umpire)}>
                      <Pencil className="mr-2 h-4 w-4" />
                      Edit
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => handleDelete(umpire.id)}
                      disabled={deletingId === umpire.id}
                      className="text-destructive"
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
