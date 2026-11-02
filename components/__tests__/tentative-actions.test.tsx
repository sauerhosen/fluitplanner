import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import { useState } from "react";
import { render } from "@/__tests__/helpers/render";
import { TentativeActions } from "@/components/polls/tentative-actions";
import type { Assignment } from "@/lib/types/domain";

vi.mock("@/lib/actions/assignments", () => ({
  confirmTentativeAssignments: vi.fn(),
  clearTentativeAssignments: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

import {
  clearTentativeAssignments,
  confirmTentativeAssignments,
} from "@/lib/actions/assignments";

function makeAssignment(
  overrides: Partial<Assignment> & Pick<Assignment, "match_id" | "umpire_id">,
): Assignment {
  return {
    id: `a-${overrides.match_id}-${overrides.umpire_id}`,
    poll_id: "poll-1",
    created_at: "2026-01-01T00:00:00Z",
    organization_id: "test-org-id",
    status: "confirmed",
    ...overrides,
  };
}

/** Plays the poll page: owns the assignments and shows their statuses. */
function Harness({ initial }: { initial: Assignment[] }) {
  const [assignments, setAssignments] = useState(initial);
  const [pending, setPending] = useState(false);
  return (
    <>
      <TentativeActions
        pollId="poll-1"
        assignments={assignments}
        onAssignmentsChange={setAssignments}
        pending={pending}
        onPendingChange={setPending}
      />
      <output data-testid="statuses">
        {assignments.map((a) => a.status).join(",")}
      </output>
    </>
  );
}

const twoTentative = [
  makeAssignment({ match_id: "m1", umpire_id: "u1", status: "tentative" }),
  makeAssignment({ match_id: "m1", umpire_id: "u2", status: "tentative" }),
];

describe("TentativeActions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("stays out of the way until there is something tentative", () => {
    render(
      <Harness
        initial={[makeAssignment({ match_id: "m1", umpire_id: "u1" })]}
      />,
    );

    expect(screen.queryByTestId("tentative-summary")).not.toBeInTheDocument();
    expect(screen.queryByTestId("confirm-tentative")).not.toBeInTheDocument();
  });

  it("counts the sketches once there are some", () => {
    render(<Harness initial={twoTentative} />);

    // Assert the count, not the sentence around it — the copy lives in
    // messages/en.json and may be reworded without a behaviour change.
    expect(screen.getByTestId("tentative-summary")).toHaveTextContent("2");
    expect(screen.getByTestId("confirm-tentative")).toBeInTheDocument();
  });

  it("confirms every tentative appointment at once", async () => {
    vi.mocked(confirmTentativeAssignments).mockResolvedValue(2);
    render(<Harness initial={twoTentative} />);

    fireEvent.click(screen.getByTestId("confirm-tentative"));

    expect(confirmTentativeAssignments).toHaveBeenCalledWith("poll-1");
    expect(screen.getByTestId("statuses")).toHaveTextContent(
      "confirmed,confirmed",
    );
  });

  it("discards every tentative appointment at once", async () => {
    vi.mocked(clearTentativeAssignments).mockResolvedValue(2);
    render(<Harness initial={twoTentative} />);

    fireEvent.click(screen.getByTestId("clear-tentative"));

    expect(clearTentativeAssignments).toHaveBeenCalledWith("poll-1");
    expect(screen.getByTestId("statuses")).toBeEmptyDOMElement();
  });

  it("puts the sketches back when the server refuses", async () => {
    vi.mocked(confirmTentativeAssignments).mockRejectedValue(new Error("no"));
    render(<Harness initial={twoTentative} />);

    fireEvent.click(screen.getByTestId("confirm-tentative"));

    expect(await screen.findByText("tentative,tentative")).toBeInTheDocument();
  });

  it("shows a viewer the count but no bulk actions", () => {
    render(<Harness initial={twoTentative} />, { role: "viewer" });

    expect(screen.getByTestId("tentative-summary")).toHaveTextContent("2");
    expect(screen.queryByTestId("confirm-tentative")).not.toBeInTheDocument();
    expect(screen.queryByTestId("clear-tentative")).not.toBeInTheDocument();
  });
});
