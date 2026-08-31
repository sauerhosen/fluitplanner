import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import {
  getClient,
  OauthClientError,
  type OauthClient,
} from "@/lib/oauth/clients";
import { isValidResource } from "@/lib/oauth/metadata";
import { ConsentForm } from "@/components/oauth/consent-form";

/**
 * OAuth authorization endpoint. The proxy guarantees a logged-in session
 * here (unauthenticated visitors are bounced to /auth/login?next=…); this
 * page validates the request, and only redirects errors back to the client
 * once its redirect_uri has been verified — never before.
 */

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function ErrorCard({ title, message }: { title: string; message: string }) {
  return (
    <div className="border-destructive/30 w-full max-w-md space-y-2 rounded-lg border p-6">
      <h1 className="text-lg font-semibold">{title}</h1>
      <p className="text-muted-foreground text-sm">{message}</p>
    </div>
  );
}

export default async function AuthorizePage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const sp = await searchParams;
  const get = (key: string): string | undefined => {
    const value = sp[key];
    return typeof value === "string" && value ? value : undefined;
  };
  const t = await getTranslations("oauth");

  const clientId = get("client_id");
  const redirectUri = get("redirect_uri");
  const state = get("state");
  const codeChallenge = get("code_challenge");
  const codeChallengeMethod = get("code_challenge_method") ?? "S256";
  const resource = get("resource");

  const wrap = (node: React.ReactNode) => (
    <div className="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
      {node}
    </div>
  );

  // Without a verified client + registered redirect_uri there is nowhere
  // safe to send errors — render them.
  if (!clientId || !redirectUri) {
    return wrap(
      <ErrorCard
        title={t("invalidRequestTitle")}
        message={t("invalidRequest")}
      />,
    );
  }
  let client: OauthClient | null = null;
  try {
    client = await getClient(clientId);
  } catch (error) {
    if (!(error instanceof OauthClientError)) throw error;
  }
  if (!client || !client.redirect_uris.includes(redirectUri)) {
    return wrap(
      <ErrorCard
        title={t("invalidRequestTitle")}
        message={t("invalidClient")}
      />,
    );
  }

  // From here the redirect_uri is trusted; protocol errors go back to the
  // client per RFC 6749 §4.1.2.1.
  const redirectWithError = (error: string, description: string): never => {
    const url = new URL(redirectUri);
    url.searchParams.set("error", error);
    url.searchParams.set("error_description", description);
    if (state) url.searchParams.set("state", state);
    redirect(url.toString());
  };

  if (get("response_type") !== "code") {
    redirectWithError(
      "unsupported_response_type",
      "Only response_type=code is supported",
    );
  }
  if (!codeChallenge || codeChallengeMethod !== "S256") {
    redirectWithError(
      "invalid_request",
      "PKCE with code_challenge_method=S256 is required",
    );
  }
  if (resource && !isValidResource(resource)) {
    redirectWithError("invalid_target", "Unknown resource");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    // Defensive: the proxy normally handles this.
    const here = new URL("/oauth/authorize", "http://x");
    for (const [key, value] of Object.entries(sp)) {
      if (typeof value === "string") here.searchParams.set(key, value);
    }
    redirect(
      `/auth/login?next=${encodeURIComponent(here.pathname + here.search)}`,
    );
  }

  const { data: memberships, error: memberError } = await supabase
    .from("organization_members")
    .select("role, organizations (id, name, is_active)")
    .eq("user_id", user.id);
  if (memberError) throw new Error(memberError.message);

  const organizations = (memberships ?? []).flatMap((row) => {
    const org = row.organizations as unknown as {
      id: string;
      name: string;
      is_active: boolean;
    } | null;
    return row.role === "planner" && org?.is_active
      ? [{ id: org.id, name: org.name }]
      : [];
  });
  if (organizations.length === 0) {
    return wrap(
      <ErrorCard
        title={t("noPlannerRoleTitle")}
        message={t("noPlannerRole")}
      />,
    );
  }

  const denyUrl = new URL(redirectUri);
  denyUrl.searchParams.set("error", "access_denied");
  if (state) denyUrl.searchParams.set("state", state);

  return wrap(
    <div className="w-full max-w-md rounded-lg border p-6">
      <ConsentForm
        clientName={client.client_name ?? client.client_id}
        clientUri={client.client_uri}
        organizations={organizations}
        request={{
          client_id: clientId,
          redirect_uri: redirectUri,
          state,
          code_challenge: codeChallenge!,
          resource,
        }}
        denyUrl={denyUrl.toString()}
      />
    </div>,
  );
}
