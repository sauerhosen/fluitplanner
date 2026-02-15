import Link from "next/link";
import { getTranslations } from "next-intl/server";

export default async function PrivacyPage() {
  const t = await getTranslations("privacy");
  const ft = await getTranslations("footer");

  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <article className="flex flex-col gap-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t("title")}</h1>
          <p className="text-muted-foreground text-sm mt-1">
            {t("lastUpdated")}
          </p>
        </div>

        <section>
          <h2 className="text-lg font-semibold mb-2">{t("introTitle")}</h2>
          <p className="text-sm text-muted-foreground">{t("introText")}</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">
            {t("whatWeCollectTitle")}
          </h2>
          <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
            {t("whatWeCollectItems")
              .split("|")
              .map((item) => (
                <li key={item}>{item}</li>
              ))}
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">
            {t("whyWeCollectTitle")}
          </h2>
          <p className="text-sm text-muted-foreground">
            {t("whyWeCollectText")}
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">{t("legalBasisTitle")}</h2>
          <p className="text-sm text-muted-foreground">{t("legalBasisText")}</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">{t("storageTitle")}</h2>
          <p className="text-sm text-muted-foreground">{t("storageText")}</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">{t("retentionTitle")}</h2>
          <p className="text-sm text-muted-foreground">{t("retentionText")}</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">{t("cookiesTitle")}</h2>
          <p className="text-sm text-muted-foreground">{t("cookiesText")}</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">{t("rightsTitle")}</h2>
          <p className="text-sm text-muted-foreground">{t("rightsText")}</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">{t("changesTitle")}</h2>
          <p className="text-sm text-muted-foreground">{t("changesText")}</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">{t("contactTitle")}</h2>
          <p className="text-sm text-muted-foreground">{t("contactText")}</p>
          <p className="text-sm mt-1">
            <a
              href="mailto:privacy@fluiten.org"
              className="underline hover:text-foreground"
            >
              privacy@fluiten.org
            </a>
          </p>
        </section>
      </article>

      <div className="mt-12 text-center text-xs text-muted-foreground">
        <Link href="/" className="hover:underline">
          Fluitplanner
        </Link>
        {" · "}
        <span>{ft("privacyPolicy")}</span>
      </div>
    </main>
  );
}
