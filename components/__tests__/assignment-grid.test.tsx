import { screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { render } from "@/__tests__/helpers/render";
import { describe, it, expect, vi } from "vitest";
import { AssignmentGrid } from "@/components/polls/assignment-grid";
import type {
  Match,
  PollSlot,
  AvailabilityResponse,
  Assignment,
  RosteredUmpire,
} from "@/lib/types/domain";
import { matchSyncDefaults } from "@/__tests__/helpers/fixtures";

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
}));

// Mock sonner
vi.mock("sonner", () => ({
  toast: {
    warning: vi.fn(),
    error: vi.fn(),
  },
}));

const mockMatches: Match[] = [
  {
    ...matchSyncDefaults,
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
    ...matchSyncDefaults,
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
    });

    render(<AssignmentGrid {...defaultProps} />);

    const cell = screen.getByTestId("cell-m1-u1");
    fireEvent.click(cell);

    expect(mockCreate).toHaveBeenCalledWith("poll-1", "m1", "u1");
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
      },
    ];

    render(
      <AssignmentGrid {...defaultProps} assignments={assignments} transposed />,
    );

    expect(screen.getByRole("img", { name: "1/2" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "0/2" })).toBeInTheDocument();
  });
});
