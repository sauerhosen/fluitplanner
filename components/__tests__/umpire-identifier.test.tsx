import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { UmpireIdentifier } from "@/components/poll-response/umpire-identifier";
import type { Umpire } from "@/lib/types/domain";

vi.mock("@/lib/actions/public-polls", () => ({
  findOrCreateUmpire: vi.fn(),
}));

import { findOrCreateUmpire } from "@/lib/actions/public-polls";

const mockFindOrCreate = vi.mocked(findOrCreateUmpire);

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

  beforeEach(() => {
    vi.clearAllMocks();
    onIdentified = vi.fn<(umpire: Umpire) => void>();
  });

  it("renders email input form initially", () => {
    render(<UmpireIdentifier onIdentified={onIdentified} />);
    expect(screen.getByLabelText("Your email")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Continue" })).toBeTruthy();
  });

  it("continue button is disabled with empty email", () => {
    render(<UmpireIdentifier onIdentified={onIdentified} />);
    expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();
  });

  it("calls onIdentified when existing umpire found", async () => {
    mockFindOrCreate.mockResolvedValue(testUmpire);
    render(<UmpireIdentifier onIdentified={onIdentified} />);

    fireEvent.change(screen.getByLabelText("Your email"), {
      target: { value: "jan@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    await waitFor(() => {
      expect(onIdentified).toHaveBeenCalledWith(testUmpire);
    });
  });

  it("shows name input when email not found", async () => {
    mockFindOrCreate.mockResolvedValue(null);
    render(<UmpireIdentifier onIdentified={onIdentified} />);

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
    // First call (email only) returns null, second call (with name) returns umpire
    mockFindOrCreate.mockResolvedValueOnce(null);
    mockFindOrCreate.mockResolvedValueOnce({
      ...testUmpire,
      name: "Piet",
      email: "new@example.com",
    });

    render(<UmpireIdentifier onIdentified={onIdentified} />);

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
    mockFindOrCreate.mockRejectedValue(new Error("Network error"));
    render(<UmpireIdentifier onIdentified={onIdentified} />);

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

  it("shows error when registration returns null", async () => {
    mockFindOrCreate.mockResolvedValueOnce(null); // email lookup
    mockFindOrCreate.mockResolvedValueOnce(null); // create fails

    render(<UmpireIdentifier onIdentified={onIdentified} />);

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
