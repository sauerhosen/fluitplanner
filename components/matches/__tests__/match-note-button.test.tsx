import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { render } from "@/__tests__/helpers/render";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MatchNoteButton } from "../match-note-button";

vi.mock("@/lib/actions/matches", () => ({
  updateMatchNotes: vi.fn(),
}));

import { updateMatchNotes } from "@/lib/actions/matches";
const mockUpdateMatchNotes = vi.mocked(updateMatchNotes);

const match = {
  id: "m-1",
  home_team: "VVV D1",
  away_team: "AMVJ D1",
  notes: "Umpire X would like to be assigned",
};

beforeEach(() => {
  vi.clearAllMocks();
  mockUpdateMatchNotes.mockResolvedValue({ id: "m-1" } as never);
});

describe("MatchNoteButton", () => {
  it("renders nothing in indicator mode when the match has no note", () => {
    const { container } = render(
      <MatchNoteButton
        match={{ ...match, notes: null }}
        variant="indicator"
        onSaved={vi.fn()}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("shows an icon whose accessible name carries the note", () => {
    render(<MatchNoteButton match={match} variant="indicator" />);
    expect(
      screen.getByRole("button", {
        name: /Umpire X would like to be assigned/,
      }),
    ).toBeInTheDocument();
  });

  it("reveals the note in a tooltip on hover", async () => {
    const user = userEvent.setup();
    render(<MatchNoteButton match={match} variant="indicator" />);

    await user.hover(screen.getByRole("button"));

    const tooltip = await screen.findByRole("tooltip");
    expect(tooltip).toHaveTextContent("Umpire X would like to be assigned");
  });

  it("always renders a trigger in editor mode, even without a note", () => {
    render(
      <MatchNoteButton match={{ ...match, notes: null }} variant="editor" />,
    );
    expect(screen.getByRole("button")).toBeInTheDocument();
  });

  it("saves an edited note and reports it back", async () => {
    const user = userEvent.setup();
    const onSaved = vi.fn();
    render(
      <MatchNoteButton
        match={{ ...match, notes: null }}
        variant="editor"
        onSaved={onSaved}
      />,
    );

    await user.click(screen.getByRole("button"));
    await user.type(screen.getByRole("textbox"), "Don't assign Y");
    await user.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() =>
      expect(mockUpdateMatchNotes).toHaveBeenCalledWith(
        "m-1",
        "Don't assign Y",
      ),
    );
    expect(onSaved).toHaveBeenCalledWith("m-1", "Don't assign Y");
  });

  it("clears the note when the delete action is used", async () => {
    const user = userEvent.setup();
    const onSaved = vi.fn();
    render(
      <MatchNoteButton match={match} variant="editor" onSaved={onSaved} />,
    );

    await user.click(screen.getByRole("button", { name: /Umpire X/ }));
    await user.click(screen.getByRole("button", { name: /delete/i }));

    await waitFor(() =>
      expect(mockUpdateMatchNotes).toHaveBeenCalledWith("m-1", ""),
    );
    expect(onSaved).toHaveBeenCalledWith("m-1", null);
  });

  it("does not open an editor when read-only", async () => {
    const user = userEvent.setup();
    render(<MatchNoteButton match={match} variant="indicator" readOnly />);

    await user.click(screen.getByRole("button"));

    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });
});
