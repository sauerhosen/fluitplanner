import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { render } from "@/__tests__/helpers/render";
import { describe, it, expect, vi } from "vitest";
import { PollTable } from "@/components/polls/poll-table";
import type { PollWithMeta } from "@/lib/actions/polls";

vi.mock("@/lib/actions/polls", () => ({
  deletePoll: vi.fn(),
  deletePolls: vi.fn().mockResolvedValue(undefined),
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
    organization_id: "test-org-id",
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
    organization_id: "test-org-id",
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

  it("renders checkboxes for each row", () => {
    render(<PollTable polls={mockPolls} onDeleted={vi.fn()} />);
    const checkboxes = screen.getAllByRole("checkbox");
    // 1 header checkbox + 2 row checkboxes
    expect(checkboxes).toHaveLength(3);
  });

  it("clicking a row checkbox toggles selection", async () => {
    const user = userEvent.setup();
    render(<PollTable polls={mockPolls} onDeleted={vi.fn()} />);

    const checkbox = screen.getByRole("checkbox", { name: "Weekend Feb 15" });
    await user.click(checkbox);

    expect(screen.getByText("1 item selected")).toBeInTheDocument();
  });

  it("header checkbox selects all", async () => {
    const user = userEvent.setup();
    render(<PollTable polls={mockPolls} onDeleted={vi.fn()} />);

    const headerCheckbox = screen.getByRole("checkbox", {
      name: "Select all",
    });
    await user.click(headerCheckbox);

    expect(screen.getByText("2 items selected")).toBeInTheDocument();
  });

  it("selection toolbar appears when items are selected", async () => {
    const user = userEvent.setup();
    render(<PollTable polls={mockPolls} onDeleted={vi.fn()} />);

    expect(screen.queryByText("Delete selected")).not.toBeInTheDocument();

    await user.click(screen.getByRole("checkbox", { name: "Weekend Feb 15" }));

    expect(screen.getByText("Delete selected")).toBeInTheDocument();
    expect(screen.getByText("Clear selection")).toBeInTheDocument();
  });
});
