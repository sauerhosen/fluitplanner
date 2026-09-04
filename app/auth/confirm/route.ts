import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { type EmailOtpType } from "@supabase/supabase-js";
import type { MemberRole } from "@/lib/types/domain";
import { toSafeRedirectPath } from "@/lib/safe-redirect";
import { redirect } from "next/navigation";
import { type NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  // Untrusted: it comes straight off the query string, so it may only ever be
  // a same-site path.
  const next = toSafeRedirectPath(searchParams.get("next"));

  if (!token_hash || !type) {
    redirect(`/auth/error?error=No token hash or type`);
  }

  const supabase = await createClient();

  const { error } = await supabase.auth.verifyOtp({ type, token_hash });
  if (error) {
    // redirect the user to an error page with some instructions
    redirect(`/auth/error?error=${encodeURIComponent(error.message)}`);
  }

  // Auto-join organization if user was invited
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const invitedToOrg = user?.app_metadata?.invited_to_org;
  // Stamped by invitePlanner alongside invited_to_org; invites sent
  // before the viewer role existed carry no role and were all planners.
  const invitedRole: MemberRole =
    user?.app_metadata?.invited_role === "viewer" ? "viewer" : "planner";

  if (user && invitedToOrg) {
    const serviceClient = createServiceClient();

    const { error: upsertError } = await serviceClient
      .from("organization_members")
      .upsert(
        {
          organization_id: invitedToOrg,
          user_id: user.id,
          role: invitedRole,
        },
        // A master admin may have added or re-roled this membership
        // while the invite was pending (invitePlanner's existing-user
        // branch, updateMemberRole); the stamped invite role must not
        // overwrite that, so an existing row is left untouched.
        { onConflict: "organization_id,user_id", ignoreDuplicates: true },
      );

    // Only clear metadata if upsert succeeded
    if (!upsertError) {
      await serviceClient.auth.admin.updateUserById(user.id, {
        app_metadata: { invited_to_org: null, invited_role: null },
      });
    }
  }

  // redirect user to specified redirect URL or root of app
  redirect(next);
}
