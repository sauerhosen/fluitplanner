import { screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { render } from "@/__tests__/helpers/render";
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { useState, type ComponentProps } from "react";
import { AssignmentGrid as ControlledGrid } from "@/components/polls/assignment-grid";
import {
  createAssignment,
  deleteAssignment,
  setAssignmentStatus,
} from "@/lib/actions/assignments";
import type {
  Match,
  PollSlot,
  AvailabilityResponse,
  Assignment,
  RosteredUmpire,
} from "@/lib/types/domain";
import { matchColumnDefaults } from "@/__tests__/helpers/fixtures";

/**
 * The grid is controlled by the poll page; this harness plays the page, so a
 * test can render it with initial assignments and watch clicks change them.
 */
function AssignmentGrid(
  props: Omit<ComponentProps<typeof ControlledGrid>, "onAssignmentsChange">,
) {
  const [assignments, setAssignments] = useState(props.assignments);
  return (
    <ControlledGrid
      {...props}
      assignments={assignments}
      onAssignmentsChange={setAssignments}
    />
  );
}

// Mock server actions
vi.mock("@/lib/actions/matches", () => ({
  updateMatchNotes: vi.fn(),
}));

vi.mock("@/lib/actions/umpires", () => ({
  updateUmpireNotes: vi.fn(),
}));

vi.mock("@/lib/actions/assignments", () => ({
  createAssignment: vi.fn(),
  deleteAssignment: vi.fn(),
  setAssignmentStatus: vi.fn(),
  confirmTentativeAssignments: vi.fn(),
  clearTentativeAssignments: vi.fn(),
}));

// Mock sonner
vi.mock("sonner", () => ({
  toast: {
    warning: vi.fn(),
    error: vi.fn(),
    success: vi.fn(),
  },
}));

const mockMatches: Match[] = [
  {
    ...matchColumnDefaults,
    id: "m1",
    date: "2026-03-15",
    start_time: "2026-03-15T11:00:00Z",
    home_team: "HC Amsterdam",
    away_team: "HC Rotterdam",
    competition: "Hoofdklasse",
    venue: "Wagener",
    field: "1",
    notes: null,
    required_level: 2,
    created_by: "user-1",
    created_at: "2026-01-01T00:00:00Z",
    organization_id: "test-org-id",
  },
  {
    ...matchColumnDefaults,
    id: "m2",
    date: "2026-03-15",
    start_time: "2026-03-15T14:30:00Z",
    home_team: "HC Utrecht",
    away_team: "HC Den Bosch",
    competition: "Eerste Klasse",
    venue: "Galgenwaard",
    field: "2",
    notes: null,
    required_level: 1,
    created_by: "user-1",
    created_at: "2026-01-01T00:00:00Z",
    organization_id: "test-org-id",
  },
];

const mockSlots: PollSlot[] = [
  {
    id: "slot-1",
    poll_id: "poll-1",
    start_time: "2026-03-15T10:30:00Z",
    end_time: "2026-03-15T12:30:00Z",
  },
  {
    id: "slot-2",
    poll_id: "poll-1",
    start_time: "2026-03-15T14:00:00Z",
    end_time: "2026-03-15T16:00:00Z",
  },
];

const mockUmpires: RosteredUmpire[] = [
  {
    id: "u1",
    auth_user_id: null,
    name: "Jan de Vries",
    email: "jan@example.com",
    level: 2,
    notes: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  },
  {
    id: "u2",
    auth_user_id: null,
    name: "Piet Bakker",
    email: "piet@example.com",
    level: 1,
    notes: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  },
];

const mockResponses: AvailabilityResponse[] = [
  {
    id: "r1",
    poll_id: "poll-1",
    slot_id: "slot-1",
    participant_name: "Jan de Vries",
    umpire_id: "u1",
    response: "yes",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  },
  {
    id: "r2",
    poll_id: "poll-1",
    slot_id: "slot-2",
    participant_name: "Jan de Vries",
    umpire_id: "u1",
    response: "no",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  },
  {
    id: "r3",
    poll_id: "poll-1",
    slot_id: "slot-1",
    participant_name: "Piet Bakker",
    umpire_id: "u2",
    response: "if_need_be",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  },
  {
    id: "r4",
    poll_id: "poll-1",
    slot_id: "slot-2",
    participant_name: "Piet Bakker",
    umpire_id: "u2",
    response: "yes",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  },
];

describe("AssignmentGrid", () => {
  const defaultProps = {
    pollId: "poll-1",
    matches: mockMatches,
    slots: mockSlots,
    responses: mockResponses,
    assignments: [] as Assignment[],
    umpires: mockUmpires,
  };
  const originalTz = process.env.TZ;

  afterEach(() => {
    process.env.TZ = originalTz;
  });

  it("heads each group with its own date, whatever zone the viewer's browser is in", () => {
    // Noon local time is still the previous day in Amsterdam for a browser
    // far enough east.
    process.env.TZ = "Pacific/Kiritimati";
    render(<AssignmentGrid {...defaultProps} />);

    expect(screen.getAllByText(/Sun, Mar 15/).length).toBeGreaterThan(0);
  });

  it("renders match rows and umpire columns", () => {
    render(<AssignmentGrid {...defaultProps} />);

    expect(
      screen.getByText(
        (_, el) => el?.textContent === "HC Amsterdam \u2013 HC Rotterdam",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        (_, el) => el?.textContent === "HC Utrecht \u2013 HC Den Bosch",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("Jan de Vries")).toBeInTheDocument();
    expect(screen.getByText("Piet Bakker")).toBeInTheDocument();
  });

  it("shows assignment count per match", () => {
    render(<AssignmentGrid {...defaultProps} />);

    const badges = screen.getAllByText("0/2");
    expect(badges).toHaveLength(2);
  });

  it("shows assigned state when assignment exists", () => {
    const assignments: Assignment[] = [
      {
        id: "a1",
        poll_id: "poll-1",
        match_id: "m1",
        umpire_id: "u1",
        created_at: "2026-01-01T00:00:00Z",
        organization_id: "test-org-id",
        status: "confirmed",
      },
    ];

    render(<AssignmentGrid {...defaultProps} assignments={assignments} />);

    expect(screen.getByText("1/2")).toBeInTheDocument();
  });

  it("calls createAssignment when clicking unassigned cell", async () => {
    const { createAssignment } = await import("@/lib/actions/assignments");
    const mockCreate = vi.mocked(createAssignment);
    mockCreate.mockResolvedValue({
      id: "a1",
      poll_id: "poll-1",
      match_id: "m1",
      umpire_id: "u1",
      created_at: "2026-01-01T00:00:00Z",
      organization_id: "test-org-id",
      status: "confirmed",
    });

    render(<AssignmentGrid {...defaultProps} />);

    const cell = screen.getByTestId("cell-m1-u1");
    fireEvent.click(cell);

    expect(mockCreate).toHaveBeenCalledWith("poll-1", "m1", "u1", "confirmed");
  });

  it("calls deleteAssignment when clicking assigned cell", async () => {
    const { deleteAssignment } = await import("@/lib/actions/assignments");
    const mockDelete = vi.mocked(deleteAssignment);
    mockDelete.mockResolvedValue(undefined);

    const assignments: Assignment[] = [
      {
        id: "a1",
        poll_id: "poll-1",
        match_id: "m1",
        umpire_id: "u1",
        created_at: "2026-01-01T00:00:00Z",
        organization_id: "test-org-id",
        status: "confirmed",
      },
    ];

    render(<AssignmentGrid {...defaultProps} assignments={assignments} />);

    const cell = screen.getByTestId("cell-m1-u1");
    fireEvent.click(cell);

    expect(mockDelete).toHaveBeenCalledWith("poll-1", "m1", "u1");
  });

  it("renders transposed view when transposed prop is true", () => {
    render(<AssignmentGrid {...defaultProps} transposed />);

    // In transposed view, the first column header is "Umpire"
    expect(screen.getByText("Umpire")).toBeInTheDocument();
  });

  it("offers a phone-sized umpire name alongside the full one", () => {
    render(<AssignmentGrid {...defaultProps} transposed />);

    // Both are rendered; the breakpoint decides which one is visible.
    expect(screen.getByText("Jan dV")).toBeInTheDocument();
    expect(screen.getByText("Jan de Vries")).toBeInTheDocument();
    expect(screen.getByText("Piet B.")).toBeInTheDocument();
  });

  it("shows no note icon for matches without notes", () => {
    render(<AssignmentGrid {...defaultProps} />);

    expect(
      screen.queryByRole("button", { name: /Don't assign Piet/ }),
    ).not.toBeInTheDocument();
  });

  it("shows a note icon carrying the note for matches that have one", () => {
    const withNote = [
      { ...mockMatches[0], notes: "Don't assign Piet" },
      mockMatches[1],
    ];
    render(<AssignmentGrid {...defaultProps} matches={withNote} />);

    expect(
      screen.getByRole("button", { name: "Don't assign Piet" }),
    ).toBeInTheDocument();
  });

  it("reveals the note on hover in the assignment grid", async () => {
    const user = userEvent.setup();
    const withNote = [
      { ...mockMatches[0], notes: "Don't assign Piet" },
      mockMatches[1],
    ];
    render(<AssignmentGrid {...defaultProps} matches={withNote} />);

    await user.hover(screen.getByRole("button", { name: "Don't assign Piet" }));

    expect(await screen.findByRole("tooltip")).toHaveTextContent(
      "Don't assign Piet",
    );
  });

  it("shows the note icon in the transposed view too", () => {
    const withNote = [
      { ...mockMatches[0], notes: "Don't assign Piet" },
      mockMatches[1],
    ];
    render(<AssignmentGrid {...defaultProps} matches={withNote} transposed />);

    expect(
      screen.getByRole("button", { name: "Don't assign Piet" }),
    ).toBeInTheDocument();
  });

  it("shows no umpire note icon for umpires without notes", () => {
    render(<AssignmentGrid {...defaultProps} />);

    expect(
      screen.queryByRole("button", { name: /add a note/i }),
    ).not.toBeInTheDocument();
  });

  it("shows a note icon carrying the note for umpires that have one", () => {
    const withNote = [
      { ...mockUmpires[0], notes: "Not yet ready for this team level" },
      mockUmpires[1],
    ];
    render(<AssignmentGrid {...defaultProps} umpires={withNote} />);

    expect(
      screen.getByRole("button", { name: "Not yet ready for this team level" }),
    ).toBeInTheDocument();
  });

  it("reveals the umpire note on hover", async () => {
    const user = userEvent.setup();
    const withNote = [
      { ...mockUmpires[0], notes: "Not yet ready for this team level" },
      mockUmpires[1],
    ];
    render(<AssignmentGrid {...defaultProps} umpires={withNote} />);

    await user.hover(
      screen.getByRole("button", { name: "Not yet ready for this team level" }),
    );

    expect(await screen.findByRole("tooltip")).toHaveTextContent(
      "Not yet ready for this team level",
    );
  });

  it("shows the umpire note icon in the transposed view too", () => {
    const withNote = [
      { ...mockUmpires[0], notes: "Not yet ready for this team level" },
      mockUmpires[1],
    ];
    render(<AssignmentGrid {...defaultProps} umpires={withNote} transposed />);

    expect(
      screen.getByRole("button", { name: "Not yet ready for this team level" }),
    ).toBeInTheDocument();
  });

  it("keeps the note icon out of the flow in the transposed header", () => {
    const withNote = [
      { ...mockMatches[0], notes: "Don't assign Piet" },
      mockMatches[1],
    ];
    render(<AssignmentGrid {...defaultProps} matches={withNote} transposed />);

    // An in-flow icon made noted columns taller, knocking their fill bar and
    // the cells beneath it out of line with every other column.
    const note = screen.getByRole("button", { name: "Don't assign Piet" });
    expect(note).toHaveClass("absolute");
    expect(note.closest("th")).toHaveClass("relative");
  });

  it("strips the own club prefix from home teams in the transposed header", () => {
    render(<AssignmentGrid {...defaultProps} transposed clubName="HC" />);

    expect(screen.getByText("Amsterdam")).toBeInTheDocument();
    expect(screen.queryByText("HC Amsterdam")).not.toBeInTheDocument();
    // Opponents keep their full name.
    expect(screen.getByText("HC Rotterdam")).toBeInTheDocument();
  });

  it("leaves team names untouched when no club name is known", () => {
    render(<AssignmentGrid {...defaultProps} transposed />);

    expect(screen.getByText("HC Amsterdam")).toBeInTheDocument();
  });

  it("shows the assignment count as a bar labelled with the exact count", () => {
    const assignments: Assignment[] = [
      {
        id: "a1",
        poll_id: "poll-1",
        match_id: "m1",
        umpire_id: "u1",
        created_at: "2026-01-01T00:00:00Z",
        organization_id: "test-org-id",
        status: "confirmed",
      },
    ];

    render(
      <AssignmentGrid {...defaultProps} assignments={assignments} transposed />,
    );

    expect(screen.getByRole("img", { name: "1/2" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "0/2" })).toBeInTheDocument();
  });
  /* ---------------------------------------------------------------- */
  /*  Tentative appointments                                           */
  /* ---------------------------------------------------------------- */

  function makeAssignment(
    overrides: Partial<Assignment> & { match_id: string; umpire_id: string },
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

  it("creates a tentative assignment while tentative mode is on", async () => {
    const { createAssignment } = await import("@/lib/actions/assignments");
    const mockCreate = vi.mocked(createAssignment);
    mockCreate.mockResolvedValue(
      makeAssignment({ match_id: "m1", umpire_id: "u1", status: "tentative" }),
    );

    render(<AssignmentGrid {...defaultProps} tentativeMode />);

    fireEvent.click(screen.getByTestId("cell-m1-u1"));

    expect(mockCreate).toHaveBeenCalledWith("poll-1", "m1", "u1", "tentative");
  });

  it("makes a definitive assignment on alt-click even in tentative mode", async () => {
    const { createAssignment } = await import("@/lib/actions/assignments");
    const mockCreate = vi.mocked(createAssignment);
    mockCreate.mockResolvedValue(
      makeAssignment({ match_id: "m1", umpire_id: "u1" }),
    );

    render(<AssignmentGrid {...defaultProps} tentativeMode />);

    fireEvent.click(screen.getByTestId("cell-m1-u1"), { altKey: true });

    expect(mockCreate).toHaveBeenCalledWith("poll-1", "m1", "u1", "confirmed");
  });

  it("marks a tentative cell so it reads as unconfirmed", () => {
    const assignments = [
      makeAssignment({ match_id: "m1", umpire_id: "u1", status: "tentative" }),
    ];

    render(<AssignmentGrid {...defaultProps} assignments={assignments} />);

    const cell = screen.getByTestId("cell-m1-u1");
    expect(cell).toHaveAttribute("data-status", "tentative");
    expect(cell.className).toContain("outline-dashed");
  });

  it("does not let a tentative appointment fill a match slot", () => {
    const assignments = [
      makeAssignment({ match_id: "m1", umpire_id: "u1", status: "tentative" }),
    ];

    render(<AssignmentGrid {...defaultProps} assignments={assignments} />);

    // Both matches still count as unfilled; the sketch shows as a +1 aside,
    // once on the match badge and once on the umpire's workload.
    expect(screen.getAllByText("0/2")).toHaveLength(2);
    expect(screen.getAllByText("+1")).toHaveLength(2);
  });

  it("promotes a tentative appointment to confirmed on a plain click", async () => {
    const { setAssignmentStatus } = await import("@/lib/actions/assignments");
    const mockSetStatus = vi.mocked(setAssignmentStatus);
    mockSetStatus.mockResolvedValue(
      makeAssignment({ match_id: "m1", umpire_id: "u1" }),
    );

    const assignments = [
      makeAssignment({ match_id: "m1", umpire_id: "u1", status: "tentative" }),
    ];

    render(<AssignmentGrid {...defaultProps} assignments={assignments} />);
    fireEvent.click(screen.getByTestId("cell-m1-u1"));

    expect(mockSetStatus).toHaveBeenCalledWith(
      "poll-1",
      "m1",
      "u1",
      "confirmed",
    );
  });

  it("demotes a confirmed appointment while tentative mode is on", async () => {
    const { setAssignmentStatus } = await import("@/lib/actions/assignments");
    const mockSetStatus = vi.mocked(setAssignmentStatus);
    mockSetStatus.mockResolvedValue(
      makeAssignment({ match_id: "m1", umpire_id: "u1", status: "tentative" }),
    );

    const assignments = [makeAssignment({ match_id: "m1", umpire_id: "u1" })];

    render(
      <AssignmentGrid
        {...defaultProps}
        assignments={assignments}
        tentativeMode
      />,
    );

    fireEvent.click(screen.getByTestId("cell-m1-u1"));

    expect(mockSetStatus).toHaveBeenCalledWith(
      "poll-1",
      "m1",
      "u1",
      "tentative",
    );
  });

  it("removes a tentative appointment when clicked again in tentative mode", async () => {
    const { deleteAssignment } = await import("@/lib/actions/assignments");
    const mockDelete = vi.mocked(deleteAssignment);
    mockDelete.mockResolvedValue(undefined);

    const assignments = [
      makeAssignment({ match_id: "m1", umpire_id: "u1", status: "tentative" }),
    ];

    render(
      <AssignmentGrid
        {...defaultProps}
        assignments={assignments}
        tentativeMode
      />,
    );

    fireEvent.click(screen.getByTestId("cell-m1-u1"));

    expect(mockDelete).toHaveBeenCalledWith("poll-1", "m1", "u1");
  });
});

describe("AssignmentGrid as a viewer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const tentative: Assignment = {
    id: "a-m1-u1",
    poll_id: "poll-1",
    match_id: "m1",
    umpire_id: "u1",
    created_at: "2026-01-01T00:00:00Z",
    organization_id: "test-org-id",
    status: "tentative",
  };
  const viewerProps = {
    pollId: "poll-1",
    matches: mockMatches,
    slots: mockSlots,
    responses: mockResponses,
    assignments: [tentative],
    umpires: mockUmpires,
  };

  it("renders cells with their state, but not as buttons", () => {
    render(<AssignmentGrid {...viewerProps} />, { role: "viewer" });

    const assigned = screen.getByTestId("cell-m1-u1");
    expect(assigned).toHaveAttribute("data-status", "tentative");
    expect(assigned.tagName).not.toBe("BUTTON");

    fireEvent.click(assigned);
    fireEvent.click(screen.getByTestId("cell-m2-u2"));
    expect(createAssignment).not.toHaveBeenCalled();
    expect(deleteAssignment).not.toHaveBeenCalled();
    expect(setAssignmentStatus).not.toHaveBeenCalled();
  });

  it("does the same in the transposed view", () => {
    render(<AssignmentGrid {...viewerProps} transposed />, { role: "viewer" });

    const cell = screen.getByTestId("cell-m1-u1");
    expect(cell.tagName).not.toBe("BUTTON");
    fireEvent.click(cell);
    expect(deleteAssignment).not.toHaveBeenCalled();
  });
});

describe("AssignmentGrid hidden matches", () => {
  const props = {
    pollId: "poll-1",
    matches: mockMatches,
    slots: mockSlots,
    responses: mockResponses,
    assignments: [] as Assignment[],
    umpires: mockUmpires,
  };

  it("collapses a hidden match into a marker in the transposed view", () => {
    render(<AssignmentGrid {...props} transposed hiddenMatchIds={["m1"]} />);

    expect(screen.queryByText("HC Amsterdam")).not.toBeInTheDocument();
    expect(screen.getByText("HC Utrecht")).toBeInTheDocument();
    expect(screen.getByTestId("hidden-matches-marker")).toHaveAccessibleName(
      "1 hidden match",
    );
    expect(screen.queryByTestId("cell-m1-u1")).not.toBeInTheDocument();
  });

  it("collapses a hidden match into a row marker in the match-per-row view", () => {
    render(<AssignmentGrid {...props} hiddenMatchIds={["m1", "m2"]} />);

    // Both on the same day and adjacent: one marker for the run.
    expect(screen.getAllByTestId("hidden-matches-marker")).toHaveLength(1);
    expect(screen.getByText("2 hidden matches")).toBeInTheDocument();
  });

  it("hides a match from its column header", async () => {
    const onSetHidden = vi.fn();
    render(<AssignmentGrid {...props} transposed onSetHidden={onSetHidden} />);

    await userEvent.click(screen.getByTestId("hide-m2"));
    expect(onSetHidden).toHaveBeenCalledWith(["m2"], true);
  });

  it("unhides one or all matches from the marker", async () => {
    const onSetHidden = vi.fn();
    render(
      <AssignmentGrid
        {...props}
        transposed
        hiddenMatchIds={["m1", "m2"]}
        onSetHidden={onSetHidden}
      />,
    );

    await userEvent.click(screen.getByTestId("hidden-matches-marker"));
    await userEvent.click(await screen.findByTestId("unhide-m1"));
    expect(onSetHidden).toHaveBeenCalledWith(["m1"], false);

    await userEvent.click(screen.getByTestId("hidden-matches-marker"));
    await userEvent.click(await screen.findByTestId("unhide-all"));
    expect(onSetHidden).toHaveBeenLastCalledWith(["m1", "m2"], false);
  });

  it("offers viewers neither hiding nor unhiding", () => {
    render(
      <AssignmentGrid
        {...props}
        transposed
        hiddenMatchIds={["m1"]}
        onSetHidden={vi.fn()}
      />,
      { role: "viewer" },
    );

    expect(screen.queryByTestId("hide-m2")).not.toBeInTheDocument();
    expect(screen.getByTestId("hidden-matches-marker").tagName).not.toBe(
      "BUTTON",
    );
  });

  it("flags a hidden run that still carries umpires", async () => {
    const booked = [
      {
        id: "a1",
        poll_id: "poll-1",
        match_id: "m1",
        umpire_id: "u1",
        status: "confirmed",
        created_at: "2026-01-01T00:00:00Z",
      },
      {
        id: "a2",
        poll_id: "poll-1",
        match_id: "m2",
        umpire_id: "u2",
        status: "tentative",
        created_at: "2026-01-01T00:00:00Z",
      },
    ] as Assignment[];
    render(
      <AssignmentGrid
        {...props}
        assignments={booked}
        transposed
        hiddenMatchIds={["m1", "m2"]}
        onSetHidden={vi.fn()}
      />,
    );

    const marker = screen.getByTestId("hidden-matches-marker");
    expect(marker).toHaveAccessibleName(
      "2 hidden matches · 1 confirmed, 1 tentative",
    );
    expect(screen.getByTestId("hidden-assigned-dot")).toBeInTheDocument();

    await userEvent.click(marker);
    expect(await screen.findByTestId("unhide-m1")).toHaveTextContent("1/2");
    expect(screen.getByTestId("unhide-m2")).toHaveTextContent("0/2 (+1)");
  });

  it("shows no assignment flag on a hidden run with nobody on it", () => {
    render(<AssignmentGrid {...props} transposed hiddenMatchIds={["m1"]} />);
    expect(screen.queryByTestId("hidden-assigned-dot")).not.toBeInTheDocument();
  });
});

describe("AssignmentGrid closed days", () => {
  const props = {
    pollId: "poll-1",
    matches: mockMatches,
    slots: mockSlots,
    responses: mockResponses,
    assignments: [] as Assignment[],
    umpires: mockUmpires,
  };

  it.each([true, false])(
    "marks a closed day in its date header (transposed: %s)",
    (transposed) => {
      render(
        <AssignmentGrid
          {...props}
          transposed={transposed}
          closedDays={["2026-03-15"]}
        />,
      );

      expect(screen.getByTestId("closed-day-2026-03-15")).toHaveAccessibleName(
        "Closed",
      );
      // Still plannable: the day's cells stay in the grid.
      expect(screen.getByTestId("cell-m1-u1")).toBeInTheDocument();
    },
  );

  it("marks nothing when no day is closed", () => {
    render(<AssignmentGrid {...props} />);
    expect(screen.queryByTestId("closed-day-2026-03-15")).toBeNull();
  });

  it.each([true, false])(
    "marks a match date whose slot falls on a closed day (transposed: %s)",
    (transposed) => {
      // 00:10 Amsterdam on the 16th: its slot starts 23:45 on the 15th.
      const afterMidnight: Match = {
        ...mockMatches[0],
        id: "m3",
        date: "2026-03-16",
        start_time: "2026-03-15T23:10:00Z",
      };
      const lateSlot: PollSlot = {
        id: "slot-3",
        poll_id: "poll-1",
        start_time: "2026-03-15T22:45:00Z",
        end_time: "2026-03-16T00:45:00Z",
      };
      render(
        <AssignmentGrid
          {...props}
          matches={[afterMidnight]}
          slots={[lateSlot]}
          transposed={transposed}
          closedDays={["2026-03-15"]}
        />,
      );

      expect(screen.getByTestId("closed-day-2026-03-16")).toBeInTheDocument();
    },
  );

  it("does not mark a match date whose slot is on an open day", () => {
    const afterMidnight: Match = {
      ...mockMatches[0],
      id: "m3",
      date: "2026-03-16",
      start_time: "2026-03-15T23:10:00Z",
    };
    const lateSlot: PollSlot = {
      id: "slot-3",
      poll_id: "poll-1",
      start_time: "2026-03-15T22:45:00Z",
      end_time: "2026-03-16T00:45:00Z",
    };
    render(
      <AssignmentGrid
        {...props}
        matches={[afterMidnight]}
        slots={[lateSlot]}
        closedDays={["2026-03-16"]}
      />,
    );

    expect(screen.queryByTestId("closed-day-2026-03-16")).toBeNull();
  });
});
