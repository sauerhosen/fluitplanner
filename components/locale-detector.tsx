"use client";

import { useEffect } from "react";
import { useLocale } from "next-intl";
import { setLocale } from "@/lib/actions/locale";

export function LocaleDetector() {
  const currentLocale = useLocale();

  useEffect(() => {
    if (document.cookie.split("; ").some((c) => c.startsWith("locale=")))
      return;

    const browserLang = navigator.language.toLowerCase();
    const detected = browserLang.startsWith("nl") ? "nl" : "en";

    if (detected !== currentLocale) {
      setLocale(detected)
        .then(() => window.location.reload())
        .catch(() => {
          // Locale will be re-detected on next visit
        });
    } else {
      // Persist detected locale without reload
      setLocale(detected).catch(() => {});
    }
  }, [currentLocale]);

  return null;
}
