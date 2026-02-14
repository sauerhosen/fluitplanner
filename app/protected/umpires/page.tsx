import { Suspense } from "react";
import { TableSkeleton } from "@/components/skeletons";
import { getUmpires } from "@/lib/actions/umpires";
import { UmpiresPageClient } from "@/components/umpires/umpires-page-client";
import { getTranslations } from "next-intl/server";

async function UmpiresLoader() {
  const umpires = await getUmpires();

  return <UmpiresPageClient initialUmpires={umpires} />;
}

export default async function UmpiresPage() {
  const t = await getTranslations("umpires");
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">{t("pageTitle")}</h1>
        <p className="text-muted-foreground">{t("pageSubtitle")}</p>
      </div>
      <Suspense fallback={<TableSkeleton />}>
        <UmpiresLoader />
      </Suspense>
    </div>
  );
}
