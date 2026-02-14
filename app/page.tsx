import { AuthButton } from "@/components/auth-button";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { Suspense } from "react";

export default function Home() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-6 relative">
      <div className="absolute top-4 right-4">
        <ThemeSwitcher />
      </div>

      <div className="flex flex-col items-center gap-6 max-w-xs w-full text-center">
        <div className="flex flex-col gap-2">
          <h1 className="text-4xl font-bold tracking-tight">Fluitplanner</h1>
          <p className="text-muted-foreground text-lg">
            Field hockey umpire planning
          </p>
        </div>

        <div className="w-full pt-4 [&>div]:flex-col [&>div]:w-full [&_a]:w-full [&_a]:justify-center">
          <Suspense>
            <AuthButton />
          </Suspense>
        </div>
      </div>
    </main>
  );
}
