import { Suspense } from "react";
import { getUmpires } from "@/lib/actions/umpires";
import { UmpiresPageClient } from "@/components/umpires/umpires-page-client";

async function UmpiresLoader() {
  const umpires = await getUmpires();

  return <UmpiresPageClient initialUmpires={umpires} />;
}

export default function UmpiresPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">Umpires</h1>
        <p className="text-muted-foreground">
          Manage the umpire roster. Umpires are automatically added when they
          respond to an availability poll.
        </p>
      </div>
      <Suspense
        fallback={
          <div className="text-muted-foreground">Loading umpires...</div>
        }
      >
        <UmpiresLoader />
      </Suspense>
    </div>
  );
}
