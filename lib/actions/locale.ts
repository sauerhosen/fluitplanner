"use server";

import { cookies } from "next/headers";
import { locales, type Locale } from "@/i18n/request";

export async function setLocale(locale: string) {
  if (!locales.includes(locale as Locale)) {
    throw new Error(`Invalid locale: ${locale}`);
  }
  const store = await cookies();
  store.set("locale", locale, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365, // 1 year
    sameSite: "lax",
  });
}
