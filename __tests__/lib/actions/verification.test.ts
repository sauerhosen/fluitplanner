import { describe, it, expect, vi, beforeEach } from "vitest";
import { createHash } from "crypto";

/* ------------------------------------------------------------------ */
/*  Mocks                                                              */
/* ------------------------------------------------------------------ */

const mockSelect = vi.fn();
const mockEq = vi.fn();
const mockSingle = vi.fn();
const mockInsert = vi.fn();
const mockDelete = vi.fn();
const mockUpdate = vi.fn();
const mockLt = vi.fn();
const mockGt = vi.fn();
const mockGte = vi.fn();

function chainable(): Record<string, ReturnType<typeof vi.fn>> {
  return {
    select: mockSelect,
    eq: mockEq,
    single: mockSingle,
    insert: mockInsert,
    delete: mockDelete,
    update: mockUpdate,
    lt: mockLt,
    gt: mockGt,
    gte: mockGte,
  };
}

const mockFrom = vi.fn(() => chainable());

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    from: mockFrom,
  })),
}));

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: vi.fn(() => ({
    from: mockFrom,
  })),
}));

vi.mock("@/lib/email", () => ({
  sendVerificationEmail: vi.fn(),
}));

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(async () => (key: string) => key),
  getLocale: vi.fn(async () => "en"),
  getMessages: vi.fn(async () => ({})),
}));

function resetChain() {
  for (const fn of [
    mockFrom,
    mockSelect,
    mockEq,
    mockSingle,
    mockInsert,
    mockDelete,
    mockUpdate,
    mockLt,
    mockGt,
    mockGte,
  ]) {
    fn.mockReset();
  }
  mockFrom.mockReturnValue(chainable());
  mockSelect.mockReturnValue(chainable());
  mockEq.mockReturnValue(chainable());
  mockInsert.mockReturnValue(chainable());
  mockDelete.mockReturnValue(chainable());
  mockUpdate.mockReturnValue(chainable());
  mockLt.mockReturnValue(chainable());
  mockGt.mockReturnValue(chainable());
  mockGte.mockReturnValue(chainable());
  mockSingle.mockResolvedValue({ data: null, error: null });
}

beforeEach(() => {
  resetChain();
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://test.supabase.co");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-service-role-key");
  vi.stubEnv("SMTP_HOST", "smtp.test.com");
  vi.stubEnv("SMTP_PORT", "587");
  vi.stubEnv("SMTP_USER", "testuser");
  vi.stubEnv("SMTP_PASS", "testpass");
  vi.stubEnv("SMTP_FROM", "Test <noreply@test.com>");
});

/* ------------------------------------------------------------------ */
/*  requestVerification                                                */
/* ------------------------------------------------------------------ */

describe("requestVerification", () => {
  it("returns needsRegistration when email not in umpires table", async () => {
    mockSingle.mockResolvedValueOnce({
      data: null,
      error: { message: "not found" },
    });

    const { requestVerification } = await import("@/lib/actions/verification");
    const result = await requestVerification("new@example.com", "abc123");
    expect(result).toEqual({ needsRegistration: true });
  });

  it("returns locked error when existing code has active lockout", async () => {
    const future = new Date(Date.now() + 600_000).toISOString();
    // 1. umpire lookup → found
    mockSingle.mockResolvedValueOnce({
      data: { id: "ump-1", email: "jan@example.com", name: "Jan" },
      error: null,
    });
    // 2. poll lookup → organization_id
    mockSingle.mockResolvedValueOnce({
      data: { organization_id: "org-1" },
      error: null,
    });
    // 3. lockout check → active lockout
    mockSingle.mockResolvedValueOnce({
      data: { locked_until: future },
      error: null,
    });

    const { requestVerification } = await import("@/lib/actions/verification");
    const result = await requestVerification("jan@example.com", "abc123");
    expect(result).toEqual({ error: "locked", retryAfter: future });
  });

  it("returns success and masked email for existing umpire", async () => {
    // 1. umpire lookup → found
    mockSingle.mockResolvedValueOnce({
      data: { id: "ump-1", email: "jan@example.com", name: "Jan" },
      error: null,
    });
    // 2. poll lookup → organization_id
    mockSingle.mockResolvedValueOnce({
      data: { organization_id: "org-1" },
      error: null,
    });
    // 3. lockout check → no active lockout
    mockSingle.mockResolvedValueOnce({ data: null, error: null });
    // 4. insert new code
    mockSingle.mockResolvedValueOnce({ data: { id: "code-1" }, error: null });

    const { requestVerification } = await import("@/lib/actions/verification");
    const result = await requestVerification("jan@example.com", "abc123");

    expect(result).toHaveProperty("success", true);
    expect(result).toHaveProperty("maskedEmail");
    expect((result as { maskedEmail: string }).maskedEmail).toContain("•");
  });
});

/* ------------------------------------------------------------------ */
/*  verifyCode                                                         */
/* ------------------------------------------------------------------ */

describe("verifyCode", () => {
  it("returns error when no active code exists", async () => {
    mockSingle.mockResolvedValueOnce({
      data: null,
      error: { message: "not found" },
    });

    const { verifyCode } = await import("@/lib/actions/verification");
    const result = await verifyCode("jan@example.com", "123456");
    expect(result).toHaveProperty("error", "no_active_code");
  });

  it("returns locked error when email is locked", async () => {
    const future = new Date(Date.now() + 600_000).toISOString();
    mockSingle.mockResolvedValueOnce({
      data: {
        id: "code-1",
        email: "jan@example.com",
        code_hash: "somehash",
        attempts: 5,
        locked_until: future,
        expires_at: new Date(Date.now() + 1_800_000).toISOString(),
      },
      error: null,
    });

    const { verifyCode } = await import("@/lib/actions/verification");
    const result = await verifyCode("jan@example.com", "123456");
    expect(result).toHaveProperty("error", "locked");
  });

  it("returns invalid_code and increments attempts on wrong code", async () => {
    const hash = createHash("sha256").update("654321").digest("hex");
    mockSingle.mockResolvedValueOnce({
      data: {
        id: "code-1",
        email: "jan@example.com",
        code_hash: hash,
        attempts: 2,
        locked_until: null,
        expires_at: new Date(Date.now() + 1_800_000).toISOString(),
      },
      error: null,
    });
    // First .eq() in the query chain must return chainable (so .gt() works)
    mockEq.mockReturnValueOnce(chainable());
    mockEq.mockResolvedValueOnce({ error: null });

    const { verifyCode } = await import("@/lib/actions/verification");
    const result = await verifyCode("jan@example.com", "000000");
    expect(result).toHaveProperty("error", "invalid_code");
    expect(result).toHaveProperty("attemptsRemaining");
  });

  it("returns umpire on correct code", async () => {
    const code = "384721";
    const hash = createHash("sha256").update(code).digest("hex");
    mockSingle.mockResolvedValueOnce({
      data: {
        id: "code-1",
        email: "jan@example.com",
        code_hash: hash,
        attempts: 0,
        locked_until: null,
        expires_at: new Date(Date.now() + 1_800_000).toISOString(),
      },
      error: null,
    });
    // First .eq() in the query chain must return chainable (so .gt() works)
    mockEq.mockReturnValueOnce(chainable());
    mockEq.mockResolvedValueOnce({ error: null });
    mockSingle.mockResolvedValueOnce({
      data: {
        id: "ump-1",
        name: "Jan",
        email: "jan@example.com",
        level: 1,
      },
      error: null,
    });

    const { verifyCode } = await import("@/lib/actions/verification");
    const result = await verifyCode("jan@example.com", code);
    expect(result).toHaveProperty("umpire");
    expect((result as { umpire: { id: string } }).umpire.id).toBe("ump-1");
  });
});

/* ------------------------------------------------------------------ */
/*  verifyMagicLink                                                    */
/* ------------------------------------------------------------------ */

describe("verifyMagicLink", () => {
  it("returns error for invalid/expired token", async () => {
    mockSingle.mockResolvedValueOnce({
      data: null,
      error: { message: "not found" },
    });

    const { verifyMagicLink } = await import("@/lib/actions/verification");
    const result = await verifyMagicLink("bad-token");
    expect(result).toHaveProperty("error", "invalid_or_expired");
  });

  it("returns umpire for valid magic token", async () => {
    mockSingle.mockResolvedValueOnce({
      data: {
        id: "code-1",
        email: "jan@example.com",
        magic_token: "valid-token",
        expires_at: new Date(Date.now() + 1_800_000).toISOString(),
      },
      error: null,
    });
    // First .eq() in the query chain must return chainable (so .gt() works)
    mockEq.mockReturnValueOnce(chainable());
    mockEq.mockResolvedValueOnce({ error: null });
    mockSingle.mockResolvedValueOnce({
      data: {
        id: "ump-1",
        name: "Jan",
        email: "jan@example.com",
        level: 1,
      },
      error: null,
    });

    const { verifyMagicLink } = await import("@/lib/actions/verification");
    const result = await verifyMagicLink("valid-token");
    expect(result).toHaveProperty("umpire");
  });
});
