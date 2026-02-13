import { AuthButton } from "@/components/auth-button";
import { ThemeSwitcher } from "@/components/theme-switcher";
import Link from "next/link";
import { Suspense } from "react";

export default function Home() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-6">
      <div className="flex flex-col items-center gap-8 max-w-sm w-full text-center">
        <div className="flex flex-col gap-2">
          <h1 className="text-4xl font-bold tracking-tight">Fluitplanner</h1>
          <p className="text-muted-foreground">Field hockey umpire planning</p>
        </div>

        <div className="flex flex-col gap-3 w-full">
          <Suspense>
            <AuthButton />
          </Suspense>
          <div className="flex gap-4 justify-center text-sm">
            <Link
              href="/auth/login"
              className="text-muted-foreground hover:text-foreground underline underline-offset-4"
            >
              Sign in
            </Link>
            <Link
              href="/auth/sign-up"
              className="text-muted-foreground hover:text-foreground underline underline-offset-4"
            >
              Sign up
            </Link>
          </div>
        </div>

        <div className="pt-8">
          <ThemeSwitcher />
        </div>
      </div>
    </main>
  );
}
