"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { PollWithMeta } from "@/lib/actions/polls";
import { deletePoll } from "@/lib/actions/polls";
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
import { MoreHorizontal, Eye, Trash2 } from "lucide-react";
import { SharePollButton } from "./share-poll-button";

function formatDateRange(min: string | null, max: string | null): string {
  if (!min) return "\u2014";
  const fmt = (d: string) =>
    new Date(d + "T00:00:00").toLocaleDateString("nl-NL", {
      day: "numeric",
      month: "short",
    });
  if (min === max) return fmt(min);
  return `${fmt(min)} \u2013 ${fmt(max!)}`;
}

export function PollTable({
  polls,
  onDeleted,
}: {
  polls: PollWithMeta[];
  onDeleted: () => void;
}) {
  const router = useRouter();
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function handleDelete(id: string) {
    if (!confirm("Delete this poll? All responses will be lost.")) return;
    setDeletingId(id);
    try {
      await deletePoll(id);
      onDeleted();
    } finally {
      setDeletingId(null);
    }
  }

  if (polls.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        No polls yet. Create your first availability poll to get started.
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Title</TableHead>
          <TableHead>Dates</TableHead>
          <TableHead className="w-24">Status</TableHead>
          <TableHead className="w-24">Responses</TableHead>
          <TableHead className="w-40">Share</TableHead>
          <TableHead className="w-12"></TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {polls.map((poll) => (
          <TableRow key={poll.id}>
            <TableCell
              className="font-medium cursor-pointer hover:underline"
              onClick={() => router.push(`/protected/polls/${poll.id}`)}
            >
              {poll.title}
            </TableCell>
            <TableCell>
              {formatDateRange(poll.match_date_min, poll.match_date_max)}
            </TableCell>
            <TableCell>
              <Badge variant={poll.status === "open" ? "default" : "secondary"}>
                {poll.status === "open" ? "Open" : "Closed"}
              </Badge>
            </TableCell>
            <TableCell>{poll.response_count}</TableCell>
            <TableCell>
              <SharePollButton token={poll.token} />
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
                  <DropdownMenuItem
                    onClick={() => router.push(`/protected/polls/${poll.id}`)}
                  >
                    <Eye className="mr-2 h-4 w-4" />
                    View Details
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => handleDelete(poll.id)}
                    disabled={deletingId === poll.id}
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
  );
}
