import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock nodemailer before importing
const mockSendMail = vi.fn();
vi.mock("nodemailer", () => ({
  default: {
    createTransport: vi.fn(() => ({
      sendMail: mockSendMail,
    })),
  },
}));

describe("sendVerificationEmail", () => {
  beforeEach(() => {
    mockSendMail.mockReset();
    mockSendMail.mockResolvedValue({ messageId: "test-id" });

    // Set required env vars
    vi.stubEnv("SMTP_HOST", "smtp.test.com");
    vi.stubEnv("SMTP_PORT", "587");
    vi.stubEnv("SMTP_USER", "testuser");
    vi.stubEnv("SMTP_PASS", "testpass");
    vi.stubEnv("SMTP_FROM", "Fluitplanner <noreply@test.com>");
  });

  it("sends an email with code and magic link", async () => {
    const { sendVerificationEmail } = await import("@/lib/email");
    await sendVerificationEmail({
      to: "jan@example.com",
      code: "384721",
      magicLink: "https://fluitplanner.nl/poll/abc123?verify=token123",
    });

    expect(mockSendMail).toHaveBeenCalledOnce();
    const call = mockSendMail.mock.calls[0][0];
    expect(call.to).toBe("jan@example.com");
    expect(call.subject).toContain("verification");
    expect(call.text).toContain("384721");
    expect(call.text).toContain(
      "https://fluitplanner.nl/poll/abc123?verify=token123",
    );
    expect(call.html).toContain("384 721"); // formatted with space
    expect(call.html).toContain(
      "https://fluitplanner.nl/poll/abc123?verify=token123",
    );
  });

  it("retries on transient DNS errors", async () => {
    mockSendMail
      .mockRejectedValueOnce(new Error("getaddrinfo EBUSY smtp.test.com"))
      .mockResolvedValueOnce({ messageId: "retry-id" });

    const { sendVerificationEmail } = await import("@/lib/email");
    await sendVerificationEmail({
      to: "jan@example.com",
      code: "384721",
      magicLink: "https://example.com/poll/abc?verify=tok",
    });

    expect(mockSendMail).toHaveBeenCalledTimes(2);
  });

  it("throws after exhausting retries on transient errors", async () => {
    mockSendMail.mockRejectedValue(
      new Error("getaddrinfo EBUSY smtp.test.com"),
    );

    const { sendVerificationEmail } = await import("@/lib/email");
    await expect(
      sendVerificationEmail({
        to: "jan@example.com",
        code: "384721",
        magicLink: "https://example.com/poll/abc?verify=tok",
      }),
    ).rejects.toThrow("EBUSY");

    expect(mockSendMail).toHaveBeenCalledTimes(3); // 1 initial + 2 retries
  });

  it("throws when SMTP env vars are missing", async () => {
    vi.stubEnv("SMTP_HOST", "");

    const { sendVerificationEmail } = await import("@/lib/email");
    await expect(
      sendVerificationEmail({
        to: "jan@example.com",
        code: "384721",
        magicLink: "https://example.com/poll/abc?verify=tok",
      }),
    ).rejects.toThrow();
  });
});
