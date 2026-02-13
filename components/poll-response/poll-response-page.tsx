"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { UmpireIdentifier } from "@/components/poll-response/umpire-identifier";
import { findUmpireById, getMyResponses } from "@/lib/actions/public-polls";
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
};

export function PollResponsePage({ poll, slots }: Props) {
  const [loading, setLoading] = useState(true);
  const [umpire, setUmpire] = useState<Umpire | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [existingResponses, setExistingResponses] = useState<
    AvailabilityResponse[]
  >([]);

  useEffect(() => {
    async function checkCookie() {
      const savedId = getCookie(COOKIE_NAME);
      if (savedId) {
        const found = await findUmpireById(savedId);
        if (found) {
          setUmpire(found);
          const responses = await getMyResponses(poll.id, found.id);
          setExistingResponses(responses);
        } else {
          deleteCookie(COOKIE_NAME);
        }
      }
      setLoading(false);
    }
    checkCookie();
  }, [poll.id]);

  async function handleIdentified(identified: Umpire) {
    setCookie(COOKIE_NAME, identified.id, 365);
    const responses = await getMyResponses(poll.id, identified.id);
    setExistingResponses(responses);
    setUmpire(identified);
  }

  function handleSwitchUser() {
    deleteCookie(COOKIE_NAME);
    setUmpire(null);
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
        <UmpireIdentifier onIdentified={handleIdentified} />
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
        <Button variant="ghost" size="sm" onClick={handleSwitchUser}>
          Not you?
        </Button>
      </div>
      <p className="text-muted-foreground text-sm">
        Availability form coming next...
      </p>
    </div>
  );
}
