"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { verifyCode, requestVerification } from "@/lib/actions/verification";
import { useTranslations } from "next-intl";
import type { Umpire } from "@/lib/types/domain";

type Props = {
  email: string;
  maskedEmail: string;
  pollToken: string;
  onVerified: (umpire: Umpire) => void;
  onBack: () => void;
};

export function VerificationForm({
  email,
  maskedEmail,
  pollToken,
  onVerified,
  onBack,
}: Props) {
  const t = useTranslations("pollResponse");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-focus on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Resend cooldown timer
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setInterval(() => {
      setResendCooldown((c) => Math.max(0, c - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [resendCooldown]);

  const handleSubmit = useCallback(
    async (submittedCode: string) => {
      if (submittedCode.replace(/\s/g, "").length !== 6) return;
      setError(null);
      setLoading(true);
      try {
        const result = await verifyCode(email, submittedCode);
        if ("umpire" in result) {
          onVerified(result.umpire);
        } else if (result.error === "invalid_code") {
          setError(
            result.attemptsRemaining > 0
              ? t("invalidCodeWithAttempts", {
                  attemptsRemaining: result.attemptsRemaining,
                })
              : t("tooManyAttempts"),
          );
          setCode("");
          inputRef.current?.focus();
        } else if (result.error === "locked") {
          setError(t("lockedOut"));
        } else if (result.error === "no_active_code") {
          setError(t("codeExpired"));
        }
      } catch {
        setError(t("errorSomethingWentWrong"));
      } finally {
        setLoading(false);
      }
    },
    [email, onVerified, t],
  );

  function handleCodeChange(value: string) {
    const digits = value.replace(/\D/g, "").slice(0, 6);
    setCode(digits);
    if (digits.length === 6) {
      handleSubmit(digits);
    }
  }

  async function handleResend() {
    if (resendCooldown > 0) return;
    setError(null);
    setResendCooldown(60);
    try {
      const result = await requestVerification(email, pollToken);
      if ("error" in result) {
        setError(t("couldNotResendCode"));
      }
    } catch {
      setError(t("couldNotResendCode"));
    }
  }

  async function handleFormSubmit(e: React.FormEvent) {
    e.preventDefault();
    await handleSubmit(code);
  }

  return (
    <form onSubmit={handleFormSubmit} className="space-y-4">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold">{t("checkYourEmail")}</h2>
        <p className="text-muted-foreground text-sm">
          {t.rich("codeSentTo", {
            maskedEmail,
            strong: (chunks) => <strong>{chunks}</strong>,
          })}
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="verification-code">{t("verificationCode")}</Label>
        <Input
          ref={inputRef}
          id="verification-code"
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          value={code}
          onChange={(e) => handleCodeChange(e.target.value)}
          placeholder="000000"
          maxLength={6}
          disabled={loading}
          className="text-center text-2xl tracking-widest"
        />
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <Button
        type="submit"
        disabled={loading || code.length !== 6}
        className="w-full"
      >
        {loading ? t("verifying") : t("verify")}
      </Button>

      <div className="flex items-center justify-between text-sm">
        <button
          type="button"
          onClick={handleResend}
          disabled={resendCooldown > 0}
          className="text-muted-foreground hover:text-foreground underline disabled:no-underline disabled:opacity-50"
        >
          {resendCooldown > 0
            ? t("resendCodeCountdown", { seconds: resendCooldown })
            : t("resendCode")}
        </button>
        <button
          type="button"
          onClick={onBack}
          className="text-muted-foreground hover:text-foreground underline"
        >
          {t("useDifferentEmail")}
        </button>
      </div>
    </form>
  );
}
