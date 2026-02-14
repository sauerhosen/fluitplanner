import { getRequestConfig } from "next-intl/server";
import { cookies } from "next/headers";

export const locales = ["en", "nl"] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "en";

export default getRequestConfig(async () => {
  let locale: Locale = defaultLocale;

  try {
    const store = await cookies();
    const cookie = store.get("locale")?.value;
    if (cookie && locales.includes(cookie as Locale)) {
      locale = cookie as Locale;
    }
  } catch {
    // cookies() throws during static generation (e.g. _not-found page)
  }

  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
  };
});
