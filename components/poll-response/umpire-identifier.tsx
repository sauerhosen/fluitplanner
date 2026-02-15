"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { findOrCreateUmpire } from "@/lib/actions/public-polls";
import { requestVerification } from "@/lib/actions/verification";
import { useTranslations } from "next-intl";
import type { Umpire } from "@/lib/types/domain";

type Props = {
  pollId: string;
  pollToken: string;
  onIdentified: (umpire: Umpire) => void;
  onNeedsVerification: (email: string, maskedEmail: string) => void;
};

export function UmpireIdentifier({
  pollId,
  pollToken,
  onIdentified,
  onNeedsVerification,
}: Props) {
  const t = useTranslations("pollResponse");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [needsName, setNeedsName] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleEmailSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setError(null);
    setLoading(true);
    try {
      const result = await requestVerification(email, pollToken);
      if ("needsRegistration" in result) {
        setNeedsName(true);
      } else if ("success" in result) {
        onNeedsVerification(email, result.maskedEmail);
      } else if ("error" in result) {
        if (result.error === "locked") {
          setError(t("errorTooManyAttempts"));
        } else {
          setError(t("errorCouldNotSendCode"));
        }
      }
    } catch {
      setError(t("errorSomethingWentWrong"));
    } finally {
      setLoading(false);
    }
  }

  async function handleRegisterSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setError(null);
    setLoading(true);
    try {
      const umpire = await findOrCreateUmpire(email, name, pollId);
      if (umpire) {
        onIdentified(umpire);
      } else {
        setError(t("errorCouldNotCreateAccount"));
      }
    } catch {
      setError(t("errorSomethingWentWrong"));
    } finally {
      setLoading(false);
    }
  }

  if (needsName) {
    return (
      <form onSubmit={handleRegisterSubmit} className="space-y-4">
        <p className="text-muted-foreground text-sm">
          {t.rich("notOnFileYet", {
            email,
            strong: (chunks) => <strong>{chunks}</strong>,
          })}
        </p>
        <div className="space-y-2">
          <Label htmlFor="name">{t("yourName")}</Label>
          <Input
            id="name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("namePlaceholder")}
            required
            autoFocus
          />
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <Button
          type="submit"
          disabled={loading || !name.trim()}
          className="w-full"
        >
          {loading ? t("registering") : t("continue")}
        </Button>
      </form>
    );
  }

  return (
    <form onSubmit={handleEmailSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="email">{t("yourEmail")}</Label>
        <Input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder={t("emailPlaceholder")}
          required
          autoFocus
        />
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <Button
        type="submit"
        disabled={loading || !email.trim()}
        className="w-full"
      >
        {loading ? t("lookingUp") : t("continue")}
      </Button>
    </form>
  );
}
