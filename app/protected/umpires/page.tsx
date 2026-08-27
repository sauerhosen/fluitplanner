import { Suspense } from "react";
import { PageHeaderSkeleton, TableSkeleton } from "@/components/skeletons";
import { getUmpires } from "@/lib/actions/umpires";
import { UmpiresPageClient } from "@/components/umpires/umpires-page-client";

async function UmpiresLoader() {
  const umpires = await getUmpires();

  return <UmpiresPageClient initialUmpires={umpires} />;
}

export default function UmpiresPage() {
  // The header lives in the client component because its primary action opens
  // a dialog — see docs/page-chrome.md.
  return (
    <Suspense
      fallback={
        <div className="flex flex-col gap-4">
          <PageHeaderSkeleton />
          <TableSkeleton />
        </div>
      }
    >
      <UmpiresLoader />
    </Suspense>
  );
}
