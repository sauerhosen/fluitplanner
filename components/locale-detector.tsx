"use client";

import { useEffect } from "react";
import { useLocale } from "next-intl";
import { setLocale } from "@/lib/actions/locale";

export function LocaleDetector() {
  const currentLocale = useLocale();

  useEffect(() => {
    if (document.cookie.includes("locale=")) return;

    const browserLang = navigator.language.toLowerCase();
    const detected = browserLang.startsWith("nl") ? "nl" : "en";

    if (detected !== currentLocale) {
      setLocale(detected).then(() => {
        window.location.reload();
      });
    } else {
      // Persist detected locale without reload
      setLocale(detected);
    }
  }, [currentLocale]);

  return null;
}
