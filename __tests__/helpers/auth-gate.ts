import type { MemberRole } from "@/lib/types/domain";

/**
 * Role the mocked `requirePlanner()` gate resolves to. Vitest isolates modules
 * per test file, so this is per-file state: flip it to "viewer" inside one
 * test (and back in afterEach) to make the caller read-only. A plain object,
 * so `vi.resetAllMocks()` cannot wipe it.
 */
export const gate: { role: MemberRole } = { role: "planner" };

/**
 * Factory for `vi.mock("@/lib/auth", authGateMock)`. It resolves the gates
 * against the test file's own mocked `@/lib/supabase/server` and
 * `@/lib/tenant`, so the existing "Not authenticated" cases keep their
 * meaning and `gate.role` decides whether writes pass.
 */
export async function authGateMock() {
  const { createClient } = await import("@/lib/supabase/server");
  const { requireTenantId } = await import("@/lib/tenant");

  async function requireAuthContext() {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error("Not authenticated");
    return { supabase, user };
  }

  return {
    requireAuthContext,
    requirePlanner: async () => {
      const { supabase, user } = await requireAuthContext();
      if (gate.role !== "planner") throw new Error("NOT_PLANNER");
      return { supabase, user, tenantId: await requireTenantId() };
    },
  };
}
