"use client";

import { Button } from "@/components/ui/button";
import { AlertCircle } from "lucide-react";

export function ErrorBoundaryContent({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex flex-col items-center gap-4 py-16 text-center">
      <AlertCircle className="h-10 w-10 text-destructive" />
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold">Something went wrong</h2>
        <p className="text-sm text-muted-foreground">
          {error.message || "An unexpected error occurred."}
        </p>
      </div>
      <Button variant="outline" onClick={reset}>
        Try again
      </Button>
    </div>
  );
}
