import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { type EmailOtpType } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { type NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = searchParams.get("next") ?? "/";

  if (token_hash && type) {
    const supabase = await createClient();

    const { error } = await supabase.auth.verifyOtp({
      type,
      token_hash,
    });
    if (!error) {
      // Auto-join organization if user was invited
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const invitedToOrg = user?.user_metadata?.invited_to_org;

      if (user && invitedToOrg) {
        const serviceClient = createServiceClient();

        await serviceClient.from("organization_members").upsert(
          {
            organization_id: invitedToOrg,
            user_id: user.id,
            role: "planner",
          },
          { onConflict: "organization_id,user_id" },
        );

        // Clear the metadata so it doesn't re-trigger
        await serviceClient.auth.admin.updateUserById(user.id, {
          user_metadata: { invited_to_org: null },
        });
      }

      // redirect user to specified redirect URL or root of app
      redirect(next);
    } else {
      // redirect the user to an error page with some instructions
      redirect(`/auth/error?error=${error?.message}`);
    }
  }

  // redirect the user to an error page with some instructions
  redirect(`/auth/error?error=No token hash or type`);
}
