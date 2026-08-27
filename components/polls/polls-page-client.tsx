"use client";

import { useState, useCallback } from "react";
import type { PollWithMeta } from "@/lib/actions/polls";
import { getPolls } from "@/lib/actions/polls";
import { PollTable } from "./poll-table";

export function PollsPageClient({
  initialPolls,
}: {
  initialPolls: PollWithMeta[];
}) {
  const [polls, setPolls] = useState(initialPolls);

  const refreshPolls = useCallback(async () => {
    const data = await getPolls();
    setPolls(data);
  }, []);

  // "New poll" lives in the page header — see docs/page-chrome.md.
  return <PollTable polls={polls} onDeleted={refreshPolls} />;
}
