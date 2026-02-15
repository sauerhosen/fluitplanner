import { screen, waitFor } from "@testing-library/react";
import { render } from "@/__tests__/helpers/render";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { PollResponsePage } from "@/components/poll-response/poll-response-page";
import type { Poll, PollSlot } from "@/lib/types/domain";

vi.mock("@/lib/actions/public-polls", () => ({
  findUmpireById: vi.fn(),
  getMyResponses: vi.fn(),
  findOrCreateUmpire: vi.fn(),
  submitResponses: vi.fn(),
}));

vi.mock("@/lib/actions/verification", () => ({
  verifyMagicLink: vi.fn(),
  requestVerification: vi.fn(),
}));

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
    },
  }),
}));

import { findUmpireById, getMyResponses } from "@/lib/actions/public-polls";

const mockFindUmpireById = vi.mocked(findUmpireById);
const mockGetMyResponses = vi.mocked(getMyResponses);

const openPoll: Poll = {
  id: "poll-1",
  title: "Weekend Poll",
  token: "abc123",
  status: "open",
  created_by: "user-1",
  created_at: "2026-02-01T00:00:00Z",
  organization_id: null,
};

const closedPoll: Poll = {
  ...openPoll,
  status: "closed",
};

const slots: PollSlot[] = [
  {
    id: "slot-1",
    poll_id: "poll-1",
    start_time: "2026-02-15T10:00:00Z",
    end_time: "2026-02-15T12:00:00Z",
  },
];

describe("PollResponsePage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Clear the umpire cookie
    document.cookie =
      "fluitplanner_umpire_id=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
  });

  it("shows closed message for closed poll", async () => {
    render(
      <PollResponsePage poll={closedPoll} slots={slots} pollToken="abc123" />,
    );

    await waitFor(() => {
      expect(screen.getByText("Poll closed")).toBeTruthy();
    });
    expect(
      screen.getByText("This poll is no longer accepting responses."),
    ).toBeTruthy();
  });

  it("shows no slots message when poll has no slots", async () => {
    render(<PollResponsePage poll={openPoll} slots={[]} pollToken="abc123" />);

    await waitFor(() => {
      expect(screen.getByText("This poll has no time slots yet.")).toBeTruthy();
    });
  });

  it("shows email input for unauthenticated user", async () => {
    render(
      <PollResponsePage poll={openPoll} slots={slots} pollToken="abc123" />,
    );

    await waitFor(() => {
      expect(screen.getByText("Weekend Poll")).toBeTruthy();
    });
    expect(
      screen.getByText("Enter your email to fill in your availability."),
    ).toBeTruthy();
  });

  it("restores umpire from cookie and shows form", async () => {
    // Set cookie
    document.cookie = "fluitplanner_umpire_id=ump-1; path=/";

    const umpire = {
      id: "ump-1",
      auth_user_id: null,
      name: "Jan",
      email: "jan@example.com",
      level: 1 as const,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    };

    mockFindUmpireById.mockResolvedValue(umpire);
    mockGetMyResponses.mockResolvedValue([]);

    render(
      <PollResponsePage poll={openPoll} slots={slots} pollToken="abc123" />,
    );

    await waitFor(() => {
      expect(screen.getByText("Jan", { exact: false })).toBeTruthy();
    });
    expect(screen.getByRole("button", { name: "Not you?" })).toBeTruthy();
    // Availability form should be rendered with slot buttons
    expect(screen.getByRole("button", { name: "Yes" })).toBeTruthy();
  });

  it("clears stale cookie when umpire not found", async () => {
    document.cookie = "fluitplanner_umpire_id=deleted-id; path=/";
    mockFindUmpireById.mockResolvedValue(null);

    render(
      <PollResponsePage poll={openPoll} slots={slots} pollToken="abc123" />,
    );

    await waitFor(() => {
      expect(
        screen.getByText("Enter your email to fill in your availability."),
      ).toBeTruthy();
    });
    // Cookie should be cleared
    expect(document.cookie).not.toContain("fluitplanner_umpire_id=deleted-id");
  });

  it("shows poll title as fallback when title is null", async () => {
    const untitledPoll: Poll = { ...openPoll, title: null };
    render(
      <PollResponsePage poll={untitledPoll} slots={slots} pollToken="abc123" />,
    );

    await waitFor(() => {
      expect(screen.getByText("Availability Poll")).toBeTruthy();
    });
  });
});
