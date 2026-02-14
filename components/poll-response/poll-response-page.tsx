"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { AvailabilityForm } from "@/components/poll-response/availability-form";
import { UmpireIdentifier } from "@/components/poll-response/umpire-identifier";
import { VerificationForm } from "@/components/poll-response/verification-form";
import { findUmpireById, getMyResponses } from "@/lib/actions/public-polls";
import { verifyMagicLink } from "@/lib/actions/verification";
import { LayoutDashboard } from "lucide-react";
import Link from "next/link";
import type {
  AvailabilityResponse,
  Poll,
  PollSlot,
  Umpire,
} from "@/lib/types/domain";

/* ------------------------------------------------------------------ */
/*  Cookie helpers                                                      */
/* ------------------------------------------------------------------ */

const COOKIE_NAME = "fluitplanner_umpire_id";

function getCookie(name: string): string | null {
  const match = document.cookie.match(
    new RegExp(
      "(?:^|; )" + name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "=([^;]*)",
    ),
  );
  return match ? decodeURIComponent(match[1]) : null;
}

function setCookie(name: string, value: string, days: number) {
  const expires = new Date(Date.now() + days * 864e5).toUTCString();
  document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires}; path=/; SameSite=Lax`;
}

function deleteCookie(name: string) {
  document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
}

/* ------------------------------------------------------------------ */
/*  Component                                                           */
/* ------------------------------------------------------------------ */

type Props = {
  poll: Poll;
  slots: PollSlot[];
  pollToken: string;
  verifyToken?: string;
};

export function PollResponsePage({
  poll,
  slots,
  pollToken,
  verifyToken,
}: Props) {
  const [loading, setLoading] = useState(true);
  const [umpire, setUmpire] = useState<Umpire | null>(null);
  const [existingResponses, setExistingResponses] = useState<
    AvailabilityResponse[]
  >([]);
  const [verifyState, setVerifyState] = useState<{
    email: string;
    maskedEmail: string;
  } | null>(null);

  useEffect(() => {
    async function init() {
      // Try magic link verification first
      if (verifyToken) {
        const result = await verifyMagicLink(verifyToken);
        if ("umpire" in result) {
          setCookie(COOKIE_NAME, result.umpire.id, 365);
          const responses = await getMyResponses(poll.id, result.umpire.id);
          setExistingResponses(responses);
          setUmpire(result.umpire);
          setLoading(false);
          return;
        }
      }

      // Fall back to cookie check
      const savedId = getCookie(COOKIE_NAME);
      if (savedId) {
        const found = await findUmpireById(savedId);
        if (found) {
          const responses = await getMyResponses(poll.id, found.id);
          setExistingResponses(responses);
          setUmpire(found);
        } else {
          deleteCookie(COOKIE_NAME);
        }
      }
      setLoading(false);
    }
    init();
  }, [poll.id, verifyToken]);

  async function handleIdentified(identified: Umpire) {
    setCookie(COOKIE_NAME, identified.id, 365);
    const responses = await getMyResponses(poll.id, identified.id);
    setExistingResponses(responses);
    setUmpire(identified);
  }

  function handleNeedsVerification(email: string, maskedEmail: string) {
    setVerifyState({ email, maskedEmail });
  }

  function handleSwitchUser() {
    deleteCookie(COOKIE_NAME);
    setUmpire(null);
    setVerifyState(null);
    setExistingResponses([]);
  }

  /* Loading */
  if (loading) {
    return (
      <div className="py-12 text-center">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  /* Closed poll */
  if (poll.status === "closed") {
    return (
      <div className="py-12 text-center">
        <h1 className="text-2xl font-bold">Poll closed</h1>
        <p className="text-muted-foreground mt-2">
          This poll is no longer accepting responses.
        </p>
      </div>
    );
  }

  /* No slots */
  if (slots.length === 0) {
    return (
      <div className="py-12 text-center">
        <h1 className="text-2xl font-bold">
          {poll.title ?? "Availability Poll"}
        </h1>
        <p className="text-muted-foreground mt-2">
          This poll has no time slots yet.
        </p>
      </div>
    );
  }

  /* Verification step */
  if (!umpire && verifyState) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">
            {poll.title ?? "Availability Poll"}
          </h1>
        </div>
        <VerificationForm
          email={verifyState.email}
          maskedEmail={verifyState.maskedEmail}
          pollToken={pollToken}
          onVerified={handleIdentified}
          onBack={() => setVerifyState(null)}
        />
      </div>
    );
  }

  /* Not identified */
  if (!umpire) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">
            {poll.title ?? "Availability Poll"}
          </h1>
          <p className="text-muted-foreground mt-1">
            Enter your email to fill in your availability.
          </p>
        </div>
        <UmpireIdentifier
          pollToken={pollToken}
          onIdentified={handleIdentified}
          onNeedsVerification={handleNeedsVerification}
        />
      </div>
    );
  }

  /* Identified — show availability form */
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">
            {poll.title ?? "Availability Poll"}
          </h1>
          <p className="text-muted-foreground text-sm">
            Responding as <strong>{umpire.name}</strong>
          </p>
        </div>
        <div className="flex items-center gap-1">
          {umpire.auth_user_id && (
            <Button variant="ghost" size="sm" asChild>
              <Link href="/protected">
                <LayoutDashboard className="mr-1 h-4 w-4" />
                Dashboard
              </Link>
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={handleSwitchUser}>
            Not you?
          </Button>
        </div>
      </div>
      <AvailabilityForm
        pollId={poll.id}
        umpireId={umpire.id}
        umpireName={umpire.name}
        slots={slots}
        existingResponses={existingResponses}
      />
    </div>
  );
}
