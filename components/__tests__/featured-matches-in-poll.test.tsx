import { screen } from "@testing-library/react";
import { render } from "@/__tests__/helpers/render";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { AvailabilityForm } from "@/components/poll-response/availability-form";
import type {
  AvailabilityResponse,
  FeaturedMatch,
  PollAssignmentContext,
  PollSlot,
} from "@/lib/types/domain";

vi.mock("@/lib/actions/public-polls", () => ({
  submitResponses: vi.fn(),
}));

const FUTURE_SLOT = "2030-02-15T10:00:00Z";
const PAST_SLOT = "2020-02-15T10:00:00Z";

function slot(id: string, startTime: string): PollSlot {
  const start = new Date(startTime);
  return {
    id,
    poll_id: "poll-1",
    start_time: startTime,
    end_time: new Date(start.getTime() + 2 * 60 * 60 * 1000).toISOString(),
  };
}

function featured(slotId: string, overrides?: Partial<FeaturedMatch>) {
  return {
    matchId: `match-of-${slotId}`,
    slotId,
    homeTeam: "HIC H1",
    awayTeam: "Bloemendaal H1",
    ...overrides,
  };
}

const baseProps = {
  pollId: "poll-1",
  umpireId: "ump-1",
  umpireName: "Jan",
  existingResponses: [] as AvailabilityResponse[],
};

describe("featured matches on the poll response page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows the teams of a featured match on its slot", () => {
    render(
      <AvailabilityForm
        {...baseProps}
        slots={[slot("slot-1", FUTURE_SLOT)]}
        featuredMatches={[featured("slot-1")]}
      />,
    );

    expect(screen.getByText("HIC H1 – Bloemendaal H1")).toBeInTheDocument();
  });

  it("lists every featured match sharing one slot", () => {
    render(
      <AvailabilityForm
        {...baseProps}
        slots={[slot("slot-1", FUTURE_SLOT)]}
        featuredMatches={[
          featured("slot-1", { matchId: "m1" }),
          featured("slot-1", {
            matchId: "m2",
            homeTeam: "HIC D2",
            awayTeam: "Kampong D3",
          }),
        ]}
      />,
    );

    expect(screen.getByText("HIC H1 – Bloemendaal H1")).toBeInTheDocument();
    expect(screen.getByText("HIC D2 – Kampong D3")).toBeInTheDocument();
  });

  it("shows nothing extra when no match is featured", () => {
    render(
      <AvailabilityForm
        {...baseProps}
        slots={[slot("slot-1", FUTURE_SLOT)]}
        featuredMatches={[]}
      />,
    );

    expect(
      screen.queryByText("HIC H1 – Bloemendaal H1"),
    ).not.toBeInTheDocument();
  });

  it("leaves a featured match on another poll's slot unrendered", () => {
    render(
      <AvailabilityForm
        {...baseProps}
        slots={[slot("slot-1", FUTURE_SLOT)]}
        featuredMatches={[featured("slot-other")]}
      />,
    );

    expect(
      screen.queryByText("HIC H1 – Bloemendaal H1"),
    ).not.toBeInTheDocument();
  });

  it("withholds it in the read-only past section", () => {
    // Past slots are collapsed and unanswerable, so there is nobody to entice.
    render(
      <AvailabilityForm
        {...baseProps}
        slots={[slot("slot-past", PAST_SLOT)]}
        featuredMatches={[featured("slot-past")]}
      />,
    );

    expect(
      screen.queryByText("HIC H1 – Bloemendaal H1"),
    ).not.toBeInTheDocument();
  });

  it("withholds it on a slot this umpire is already assigned to", () => {
    const assignmentContext: PollAssignmentContext = {
      lockMode: "warn",
      assignedSlots: [
        {
          slotId: "slot-1",
          matches: [
            {
              matchId: "assigned-1",
              homeTeam: "HIC H3",
              awayTeam: "Craeyenhout H2",
            },
          ],
        },
      ],
    };

    render(
      <AvailabilityForm
        {...baseProps}
        slots={[slot("slot-1", FUTURE_SLOT)]}
        featuredMatches={[featured("slot-1")]}
        assignmentContext={assignmentContext}
      />,
    );

    expect(
      screen.queryByText("HIC H1 – Bloemendaal H1"),
    ).not.toBeInTheDocument();
  });

  it("withholds it on a locked slot", () => {
    const assignmentContext: PollAssignmentContext = {
      lockMode: "lock",
      assignedSlots: [
        {
          slotId: "slot-1",
          matches: [
            {
              matchId: "assigned-1",
              homeTeam: "HIC H3",
              awayTeam: "Craeyenhout H2",
            },
          ],
        },
      ],
    };

    render(
      <AvailabilityForm
        {...baseProps}
        slots={[slot("slot-1", FUTURE_SLOT)]}
        featuredMatches={[featured("slot-1")]}
        assignmentContext={assignmentContext}
      />,
    );

    expect(
      screen.queryByText("HIC H1 – Bloemendaal H1"),
    ).not.toBeInTheDocument();
  });

  it("still shows it on an unaffected slot when another is assigned", () => {
    const assignmentContext: PollAssignmentContext = {
      lockMode: "warn",
      assignedSlots: [
        {
          slotId: "slot-1",
          matches: [
            {
              matchId: "assigned-1",
              homeTeam: "HIC H3",
              awayTeam: "Craeyenhout H2",
            },
          ],
        },
      ],
    };

    render(
      <AvailabilityForm
        {...baseProps}
        slots={[
          slot("slot-1", FUTURE_SLOT),
          slot("slot-2", "2030-02-15T14:00:00Z"),
        ]}
        featuredMatches={[
          featured("slot-1"),
          featured("slot-2", {
            matchId: "m2",
            homeTeam: "HIC D2",
            awayTeam: "Kampong D3",
          }),
        ]}
        assignmentContext={assignmentContext}
      />,
    );

    expect(
      screen.queryByText("HIC H1 – Bloemendaal H1"),
    ).not.toBeInTheDocument();
    expect(screen.getByText("HIC D2 – Kampong D3")).toBeInTheDocument();
  });
});
