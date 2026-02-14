import { screen, fireEvent, waitFor } from "@testing-library/react";
import { render } from "@/__tests__/helpers/render";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { UmpireIdentifier } from "@/components/poll-response/umpire-identifier";
import type { Umpire } from "@/lib/types/domain";

vi.mock("@/lib/actions/public-polls", () => ({
  findOrCreateUmpire: vi.fn(),
}));

vi.mock("@/lib/actions/verification", () => ({
  requestVerification: vi.fn(),
}));

import { findOrCreateUmpire } from "@/lib/actions/public-polls";
import { requestVerification } from "@/lib/actions/verification";

const mockFindOrCreate = vi.mocked(findOrCreateUmpire);
const mockRequestVerification = vi.mocked(requestVerification);

const testUmpire: Umpire = {
  id: "ump-1",
  auth_user_id: null,
  name: "Jan",
  email: "jan@example.com",
  level: 1,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

describe("UmpireIdentifier", () => {
  let onIdentified: ReturnType<typeof vi.fn<(umpire: Umpire) => void>>;
  let onNeedsVerification: ReturnType<
    typeof vi.fn<(email: string, maskedEmail: string) => void>
  >;

  beforeEach(() => {
    vi.clearAllMocks();
    onIdentified = vi.fn<(umpire: Umpire) => void>();
    onNeedsVerification = vi.fn<(email: string, maskedEmail: string) => void>();
  });

  const defaultProps = () => ({
    pollToken: "test-token",
    onIdentified,
    onNeedsVerification,
  });

  it("renders email input form initially", () => {
    render(<UmpireIdentifier {...defaultProps()} />);
    expect(screen.getByLabelText("Your email")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Continue" })).toBeTruthy();
  });

  it("continue button is disabled with empty email", () => {
    render(<UmpireIdentifier {...defaultProps()} />);
    expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();
  });

  it("calls onNeedsVerification when existing umpire found", async () => {
    mockRequestVerification.mockResolvedValue({
      success: true,
      maskedEmail: "j•••n@example.com",
    });
    render(<UmpireIdentifier {...defaultProps()} />);

    fireEvent.change(screen.getByLabelText("Your email"), {
      target: { value: "jan@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    await waitFor(() => {
      expect(onNeedsVerification).toHaveBeenCalledWith(
        "jan@example.com",
        "j•••n@example.com",
      );
    });
  });

  it("shows name input when email not found (needsRegistration)", async () => {
    mockRequestVerification.mockResolvedValue({ needsRegistration: true });
    render(<UmpireIdentifier {...defaultProps()} />);

    fireEvent.change(screen.getByLabelText("Your email"), {
      target: { value: "new@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    await waitFor(() => {
      expect(screen.getByLabelText("Your name")).toBeTruthy();
    });
    expect(screen.getByText(/new@example.com/)).toBeTruthy();
  });

  it("creates umpire with name and calls onIdentified", async () => {
    // First call triggers registration flow, second call creates umpire
    mockRequestVerification.mockResolvedValue({ needsRegistration: true });
    mockFindOrCreate.mockResolvedValueOnce({
      ...testUmpire,
      name: "Piet",
      email: "new@example.com",
    });

    render(<UmpireIdentifier {...defaultProps()} />);

    // Enter email
    fireEvent.change(screen.getByLabelText("Your email"), {
      target: { value: "new@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    // Wait for name form
    await waitFor(() => {
      expect(screen.getByLabelText("Your name")).toBeTruthy();
    });

    // Enter name and submit
    fireEvent.change(screen.getByLabelText("Your name"), {
      target: { value: "Piet" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    await waitFor(() => {
      expect(onIdentified).toHaveBeenCalled();
    });
    expect(mockFindOrCreate).toHaveBeenCalledWith("new@example.com", "Piet");
  });

  it("shows error when lookup fails", async () => {
    mockRequestVerification.mockRejectedValue(new Error("Network error"));
    render(<UmpireIdentifier {...defaultProps()} />);

    fireEvent.change(screen.getByLabelText("Your email"), {
      target: { value: "jan@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    await waitFor(() => {
      expect(
        screen.getByText("Something went wrong. Please try again."),
      ).toBeTruthy();
    });
  });

  it("shows error when verification send fails", async () => {
    mockRequestVerification.mockResolvedValue({ error: "send_failed" });
    render(<UmpireIdentifier {...defaultProps()} />);

    fireEvent.change(screen.getByLabelText("Your email"), {
      target: { value: "jan@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    await waitFor(() => {
      expect(
        screen.getByText("Could not send verification code. Please try again."),
      ).toBeTruthy();
    });
  });

  it("shows error when registration returns null", async () => {
    mockRequestVerification.mockResolvedValue({ needsRegistration: true });
    mockFindOrCreate.mockResolvedValueOnce(null); // create fails

    render(<UmpireIdentifier {...defaultProps()} />);

    // Email step
    fireEvent.change(screen.getByLabelText("Your email"), {
      target: { value: "new@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    await waitFor(() => {
      expect(screen.getByLabelText("Your name")).toBeTruthy();
    });

    // Name step
    fireEvent.change(screen.getByLabelText("Your name"), {
      target: { value: "Piet" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    await waitFor(() => {
      expect(
        screen.getByText("Could not create account. Please try again."),
      ).toBeTruthy();
    });
  });
});
