"use client";

import { useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { Check, Copy, Share2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { buildPollShareUrl } from "@/lib/domain/poll-share-link";

const subscribeNoop = () => () => {};
const getCanShare = () => !!navigator.share;
const getCanShareServer = () => false;

/**
 * Copy or natively share a poll's link. Shared by the polls table's buttons
 * and the poll page's Share menu, so both stamp the same title version.
 */
export function usePollShareLink(token: string, title: string | null) {
  const [copied, setCopied] = useState(false);
  const canShare = useSyncExternalStore(
    subscribeNoop,
    getCanShare,
    getCanShareServer,
  );
  const t = useTranslations("polls");

  function getPollUrl() {
    return buildPollShareUrl(window.location.origin, token, title);
  }

  async function handleCopy() {
    await navigator.clipboard.writeText(getPollUrl());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleShare() {
    if (navigator.share) {
      try {
        await navigator.share({ title: t("shareTitle"), url: getPollUrl() });
        return;
      } catch {
        // User cancelled or share failed — fall through to copy
      }
    }
    await handleCopy();
  }

  return { copied, canShare, handleCopy, handleShare };
}

type Props = {
  token: string;
  /**
   * Stamped onto the shared URL so a renamed poll unfurls a fresh link preview
   * instead of the card WhatsApp cached under the old title.
   */
  title: string | null;
};

/** Copy and share side by side — right for a table row. */
export function SharePollButton({ token, title }: Props) {
  const { copied, canShare, handleCopy, handleShare } = usePollShareLink(
    token,
    title,
  );
  const t = useTranslations("polls");

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
