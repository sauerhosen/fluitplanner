"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Check, Copy, Share2 } from "lucide-react";

export function SharePollButton({ token }: { token: string }) {
  const [copied, setCopied] = useState(false);
  const [canShare, setCanShare] = useState(false);

  useEffect(() => {
    setCanShare(!!navigator.share);
  }, []);

  function getPollUrl() {
    return `${window.location.origin}/poll/${token}`;
  }

  async function handleShare() {
    const pollUrl = getPollUrl();
    if (navigator.share) {
      try {
        await navigator.share({ title: "Availability Poll", url: pollUrl });
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

  return (
    <div className="flex gap-2">
      <Button variant="outline" size="sm" onClick={handleCopy}>
        {copied ? (
          <Check className="mr-2 h-4 w-4" />
        ) : (
          <Copy className="mr-2 h-4 w-4" />
        )}
        {copied ? "Copied!" : "Copy Link"}
      </Button>
      {canShare && (
        <Button variant="outline" size="sm" onClick={handleShare}>
          <Share2 className="mr-2 h-4 w-4" />
          Share
        </Button>
      )}
    </div>
  );
}
