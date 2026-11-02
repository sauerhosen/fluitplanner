"use client";

import type { ComponentProps } from "react";
import {
  Check,
  ChevronDown,
  Copy,
  Download,
  ExternalLink,
  Share2,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { buildPollSharePath } from "@/lib/domain/poll-share-link";
import { usePollShareLink } from "./share-poll-button";
import { ExportMenuItems } from "./export-menu-items";

type Props = {
  token: string;
  title: string | null;
  /**
   * A planner sends the poll to umpires; a viewer only takes the assignments
   * away. Without it the menu is Export alone.
   */
  canShareLink: boolean;
  exportData: ComponentProps<typeof ExportMenuItems>;
};

/**
 * The poll page's primary action: everything that leaves the app. The poll
 * link for umpires sits above the assignment day sheets and tables for the
 * club, so the page header keeps one primary button — see
 * `docs/page-chrome.md`.
 */
export function PollShareMenu({
  token,
  title,
  canShareLink,
  exportData,
}: Props) {
  const t = useTranslations("polls");
  const { copied, canShare, handleCopy, handleShare } = usePollShareLink(
    token,
    title,
  );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {canShareLink ? (
          <Button size="sm" data-testid="poll-share-menu">
            <Share2 className="mr-2 h-4 w-4" />
            {t("share")}
            <ChevronDown className="ml-1 h-3 w-3 opacity-70" />
          </Button>
        ) : (
          <Button variant="outline" size="sm" data-testid="poll-share-menu">
            <Download className="mr-2 h-4 w-4" />
            {t("export")}
            <ChevronDown className="ml-1 h-3 w-3 opacity-70" />
          </Button>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="max-h-[80vh] min-w-60 overflow-y-auto"
      >
        {canShareLink && (
          <>
            <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
              {t("sharePollGroup")}
            </DropdownMenuLabel>
            <DropdownMenuItem onSelect={handleCopy}>
              {copied ? (
                <Check className="mr-2 h-4 w-4" />
              ) : (
                <Copy className="mr-2 h-4 w-4" />
              )}
              {copied ? t("copied") : t("copyLink")}
            </DropdownMenuItem>
            {canShare && (
              <DropdownMenuItem onSelect={handleShare}>
                <Share2 className="mr-2 h-4 w-4" />
                {t("shareVia")}
              </DropdownMenuItem>
            )}
            <DropdownMenuItem asChild>
              <a
                href={buildPollSharePath(token, title)}
                target="_blank"
                rel="noopener noreferrer"
              >
                <ExternalLink className="mr-2 h-4 w-4" />
                {t("openPollPage")}
              </a>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        )}
        <ExportMenuItems {...exportData} />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
