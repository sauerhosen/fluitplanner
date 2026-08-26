import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { render } from "@/__tests__/helpers/render";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { UmpireNoteButton } from "../umpire-note-button";

vi.mock("@/lib/actions/umpires", () => ({
  updateUmpireNotes: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), warning: vi.fn() },
}));

import { updateUmpireNotes } from "@/lib/actions/umpires";
import { toast } from "sonner";
const mockUpdateUmpireNotes = vi.mocked(updateUmpireNotes);

const umpire = {
  id: "u-1",
  name: "Jan de Vries",
  notes: "Father of a player in D1",
};

beforeEach(() => {
  vi.clearAllMocks();
  mockUpdateUmpireNotes.mockResolvedValue(undefined);
});

describe("UmpireNoteButton", () => {
  it("renders nothing in indicator mode when the umpire has no note", () => {
    const { container } = render(
      <UmpireNoteButton
        umpire={{ ...umpire, notes: null }}
        variant="indicator"
        onSaved={vi.fn()}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("shows an icon whose accessible name carries the note", () => {
    render(<UmpireNoteButton umpire={umpire} variant="indicator" />);
    expect(
      screen.getByRole("button", { name: /Father of a player in D1/ }),
    ).toBeInTheDocument();
  });

  it("reveals the note in a tooltip on hover", async () => {
    const user = userEvent.setup();
    render(<UmpireNoteButton umpire={umpire} variant="indicator" />);

    await user.hover(screen.getByRole("button"));

    const tooltip = await screen.findByRole("tooltip");
    expect(tooltip).toHaveTextContent("Father of a player in D1");
  });

  it("names the editor after the umpire it belongs to", async () => {
    const user = userEvent.setup();
    render(<UmpireNoteButton umpire={umpire} variant="editor" />);

    await user.click(
      screen.getByRole("button", { name: /Father of a player/ }),
    );

    expect(
      screen.getByRole("heading", { name: "Note — Jan de Vries" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Notes" })).toBeInTheDocument();
  });

  it("always renders a trigger in editor mode, even without a note", () => {
    render(
      <UmpireNoteButton umpire={{ ...umpire, notes: null }} variant="editor" />,
    );
    expect(screen.getByRole("button")).toBeInTheDocument();
  });

  it("saves an edited note and reports it back", async () => {
    const user = userEvent.setup();
    const onSaved = vi.fn();
    render(
      <UmpireNoteButton
        umpire={{ ...umpire, notes: null }}
        variant="editor"
        onSaved={onSaved}
      />,
    );

    await user.click(screen.getByRole("button"));
    await user.type(
      screen.getByRole("textbox"),
      "Not yet ready for this team level",
    );
    await user.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() =>
      expect(mockUpdateUmpireNotes).toHaveBeenCalledWith(
        "u-1",
        "Not yet ready for this team level",
      ),
    );
    expect(onSaved).toHaveBeenCalledWith(
      "u-1",
      "Not yet ready for this team level",
    );
  });

  it("clears the note when the delete action is used", async () => {
    const user = userEvent.setup();
    const onSaved = vi.fn();
    render(
      <UmpireNoteButton umpire={umpire} variant="editor" onSaved={onSaved} />,
    );

    await user.click(
      screen.getByRole("button", { name: /Father of a player/ }),
    );
    await user.click(screen.getByRole("button", { name: /^delete$/i }));

    await waitFor(() =>
      expect(mockUpdateUmpireNotes).toHaveBeenCalledWith("u-1", ""),
    );
    expect(onSaved).toHaveBeenCalledWith("u-1", null);
  });

  it("keeps the dialog open and reports a refetch that fails after saving", async () => {
    const user = userEvent.setup();
    const onSaved = vi.fn().mockRejectedValue(new Error("network"));
    render(
      <UmpireNoteButton umpire={umpire} variant="editor" onSaved={onSaved} />,
    );

    await user.click(
      screen.getByRole("button", { name: /Father of a player/ }),
    );
    await user.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    // Still open, so the planner is not left looking at stale content.
    expect(screen.getByRole("textbox", { name: "Notes" })).toBeInTheDocument();
  });

  it("does not open an editor when read-only", async () => {
    const user = userEvent.setup();
    render(<UmpireNoteButton umpire={umpire} variant="indicator" readOnly />);

    await user.click(screen.getByRole("button"));

    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });
});
