"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import type { PollWithMeta } from "@/lib/actions/polls";
import { getPolls } from "@/lib/actions/polls";
import { PollTable } from "./poll-table";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { useTranslations } from "next-intl";

export function PollsPageClient({
  initialPolls,
}: {
  initialPolls: PollWithMeta[];
}) {
  const [polls, setPolls] = useState(initialPolls);
  const t = useTranslations("polls");

  const refreshPolls = useCallback(async () => {
    const data = await getPolls();
    setPolls(data);
  }, []);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-4">
        <div className="ml-auto">
          <Button asChild>
            <Link href="/protected/polls/new">
              <Plus className="mr-2 h-4 w-4" />
              {t("newPoll")}
            </Link>
          </Button>
        </div>
      </div>

      <PollTable polls={polls} onDeleted={refreshPolls} />
    </div>
  );
}
