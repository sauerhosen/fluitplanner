"use client";

import { useLocale } from "next-intl";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { setLocale } from "@/lib/actions/locale";
import { Button } from "@/components/ui/button";

export function LanguageSwitcher() {
  const locale = useLocale();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleToggle() {
    const next = locale === "en" ? "nl" : "en";
    startTransition(async () => {
      await setLocale(next);
      router.refresh();
    });
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={handleToggle}
      disabled={isPending}
      className="text-xs font-medium uppercase w-8"
    >
      {locale === "en" ? "NL" : "EN"}
    </Button>
  );
}
