import { screen } from "@testing-library/react";
import { render } from "@/__tests__/helpers/render";
import { describe, it, expect, vi } from "vitest";
import { PollTable } from "@/components/polls/poll-table";
import type { PollWithMeta } from "@/lib/actions/polls";

vi.mock("@/lib/actions/polls", () => ({
  deletePoll: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

const mockPolls: PollWithMeta[] = [
  {
    id: "p1",
    title: "Weekend Feb 15",
    token: "abc123token1",
    status: "open",
    created_by: "user-1",
    created_at: "2026-02-13T10:00:00Z",
    response_count: 5,
    match_date_min: "2026-02-15",
    match_date_max: "2026-02-16",
  },
  {
    id: "p2",
    title: "Weekend Feb 22",
    token: "def456token2",
    status: "closed",
    created_by: "user-1",
    created_at: "2026-02-14T10:00:00Z",
    response_count: 0,
    match_date_min: "2026-02-22",
    match_date_max: "2026-02-22",
  },
];

describe("PollTable", () => {
  it("renders poll rows with title and status", () => {
    render(<PollTable polls={mockPolls} onDeleted={vi.fn()} />);
    expect(screen.getByText("Weekend Feb 15")).toBeInTheDocument();
    expect(screen.getByText("Weekend Feb 22")).toBeInTheDocument();
    expect(screen.getByText("Open")).toBeInTheDocument();
    expect(screen.getByText("Closed")).toBeInTheDocument();
  });

  it("shows response counts", () => {
    render(<PollTable polls={mockPolls} onDeleted={vi.fn()} />);
    expect(screen.getByText("5")).toBeInTheDocument();
    expect(screen.getByText("0")).toBeInTheDocument();
  });

  it("shows empty state when no polls", () => {
    render(<PollTable polls={[]} onDeleted={vi.fn()} />);
    expect(screen.getByText(/no polls yet/i)).toBeInTheDocument();
  });
});
