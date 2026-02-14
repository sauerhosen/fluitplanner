import { screen, fireEvent } from "@testing-library/react";
import { render } from "@/__tests__/helpers/render";
import { describe, it, expect, vi } from "vitest";
import { AssignmentGrid } from "@/components/polls/assignment-grid";
import type {
  Match,
  PollSlot,
  AvailabilityResponse,
  Assignment,
  Umpire,
} from "@/lib/types/domain";

// Mock server actions
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
    id: "m1",
    date: "2026-03-15",
    start_time: "2026-03-15T11:00:00Z",
    home_team: "HC Amsterdam",
    away_team: "HC Rotterdam",
    competition: "Hoofdklasse",
    venue: "Wagener",
    field: "1",
    required_level: 2,
    created_by: "user-1",
    created_at: "2026-01-01T00:00:00Z",
  },
  {
    id: "m2",
    date: "2026-03-15",
    start_time: "2026-03-15T14:30:00Z",
    home_team: "HC Utrecht",
    away_team: "HC Den Bosch",
    competition: "Eerste Klasse",
    venue: "Galgenwaard",
    field: "2",
    required_level: 1,
    created_by: "user-1",
    created_at: "2026-01-01T00:00:00Z",
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

const mockUmpires: Umpire[] = [
  {
    id: "u1",
    auth_user_id: null,
    name: "Jan de Vries",
    email: "jan@example.com",
    level: 2,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  },
  {
    id: "u2",
    auth_user_id: null,
    name: "Piet Bakker",
    email: "piet@example.com",
    level: 1,
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
});
