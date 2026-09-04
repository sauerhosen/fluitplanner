import { LoginForm } from "@/components/login-form";
import { toSafeRedirectPath } from "@/lib/safe-redirect";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  const { next: rawNext } = await searchParams;
  // Same-site paths only — a full URL here would be an open redirect.
  const redirectTo = toSafeRedirectPath(rawNext, "") || undefined;
  return (
    <div className="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
      <div className="w-full max-w-sm">
        <LoginForm redirectTo={redirectTo} />
      </div>
    </div>
  );
}
