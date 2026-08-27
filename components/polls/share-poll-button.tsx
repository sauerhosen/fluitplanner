"use client";

import { useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Check, Copy, Share2, ExternalLink, ChevronDown } from "lucide-react";
import { useTranslations } from "next-intl";

const subscribeNoop = () => () => {};
const getCanShare = () => !!navigator.share;
const getCanShareServer = () => false;

type Props = {
  token: string;
  /**
   * "buttons" puts copy and share side by side — right for a table row, where
   * there is no other control competing for attention. "menu" collapses them
   * into one primary button, for a page header that has to stay one row tall.
   */
  variant?: "buttons" | "menu";
};

export function SharePollButton({ token, variant = "buttons" }: Props) {
  const [copied, setCopied] = useState(false);
  const canShare = useSyncExternalStore(
    subscribeNoop,
    getCanShare,
    getCanShareServer,
  );
  const t = useTranslations("polls");

  function getPollUrl() {
    return `${window.location.origin}/poll/${token}`;
  }

  async function handleShare() {
    const pollUrl = getPollUrl();
    if (navigator.share) {
      try {
        await navigator.share({ title: t("shareTitle"), url: pollUrl });
        return;
      } catch {
        // User cancelled or share failed — fall through to copy
      }
    }
    await handleCopy();
  }

  async function handleCopy() {
    const pollUrl = getPollUrl();
    await navigator.clipboard.writeText(pollUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (variant === "menu") {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm">
            <Share2 className="mr-2 h-4 w-4" />
            {t("share")}
            <ChevronDown className="ml-1 h-3 w-3 opacity-70" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
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
              {t("share")}
            </DropdownMenuItem>
          )}
          <DropdownMenuItem asChild>
            <a
              href={`/poll/${token}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <ExternalLink className="mr-2 h-4 w-4" />
              {t("openPollPage")}
            </a>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  return (
    <div className="flex gap-2">
      <Button variant="outline" size="sm" onClick={handleCopy}>
        {copied ? (
          <Check className="mr-2 h-4 w-4" />
        ) : (
          <Copy className="mr-2 h-4 w-4" />
        )}
        {copied ? t("copied") : t("copyLink")}
      </Button>
      {canShare && (
        <Button variant="outline" size="sm" onClick={handleShare}>
          <Share2 className="mr-2 h-4 w-4" />
          {t("share")}
        </Button>
      )}
    </div>
  );
}
