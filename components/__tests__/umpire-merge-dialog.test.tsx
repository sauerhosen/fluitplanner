import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { render } from "@/__tests__/helpers/render";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { UmpireMergeDialog } from "@/components/umpires/umpire-merge-dialog";
import { toast } from "sonner";
import type { RosteredUmpire } from "@/lib/types/domain";

const getUmpires = vi.fn();
const getUmpireMergePreview = vi.fn();
const mergeUmpires = vi.fn();

vi.mock("@/lib/actions/umpires", () => ({
  getUmpires: (...args: unknown[]) => getUmpires(...args),
  getUmpireMergePreview: (...args: unknown[]) => getUmpireMergePreview(...args),
  mergeUmpires: (...args: unknown[]) => mergeUmpires(...args),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));

function umpire(overrides: Partial<RosteredUmpire>): RosteredUmpire {
  return {
    id: "keep-1",
    auth_user_id: null,
    name: "Anna Visser",
    email: "anna.visser@example.com",
    level: 1,
    notes: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

const survivor = umpire({});
const duplicate = umpire({
  id: "drop-1",
  name: "Anna.vissre@example.com",
  email: "anna.vissre@example.com",
});

function renderDialog(onMerged = vi.fn(), onOpenChange = vi.fn()) {
  return render(
    <UmpireMergeDialog
      umpire={survivor}
      open={true}
      onOpenChange={onOpenChange}
      onMerged={onMerged}
    />,
  );
}

/** Walk the dialog from open to the confirm step with the duplicate chosen. */
async function pickDuplicate(user: ReturnType<typeof userEvent.setup>) {
  await screen.findByRole("button", { name: /anna\.vissre@example\.com/i });
  await user.click(
    screen.getByRole("button", { name: /anna\.vissre@example\.com/i }),
  );
}

describe("UmpireMergeDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getUmpires.mockResolvedValue([survivor, duplicate]);
    getUmpireMergePreview.mockResolvedValue({ responses: 12, assignments: 3 });
    mergeUmpires.mockResolvedValue({
      responsesMoved: 12,
      responsesDropped: 0,
      assignmentsMoved: 3,
      assignmentsDropped: 0,
    });
  });

  it("never offers the umpire it was opened from as their own duplicate", async () => {
    renderDialog();

    await screen.findByRole("button", { name: /anna\.vissre@example\.com/i });
    expect(
      screen.queryByRole("button", { name: /Anna Visser/ }),
    ).not.toBeInTheDocument();
  });

  it("merges into the row it was opened from", async () => {
    const user = userEvent.setup();
    const onMerged = vi.fn();
    renderDialog(onMerged);

    await pickDuplicate(user);
    await user.click(screen.getByRole("button", { name: "Merge" }));

    await waitFor(() =>
      expect(mergeUmpires).toHaveBeenCalledWith("keep-1", "drop-1"),
    );
    expect(onMerged).toHaveBeenCalled();
  });

  it("swaps which record survives", async () => {
    const user = userEvent.setup();
    renderDialog();

    await pickDuplicate(user);
    await user.click(screen.getByRole("button", { name: /Swap direction/i }));
    await user.click(screen.getByRole("button", { name: "Merge" }));

    await waitFor(() =>
      expect(mergeUmpires).toHaveBeenCalledWith("drop-1", "keep-1"),
    );
  });

  it("recounts what moves when the direction is swapped", async () => {
    const user = userEvent.setup();
    renderDialog();

    await pickDuplicate(user);
    await waitFor(() =>
      expect(getUmpireMergePreview).toHaveBeenCalledWith("drop-1"),
    );

    await user.click(screen.getByRole("button", { name: /Swap direction/i }));

    await waitFor(() =>
      expect(getUmpireMergePreview).toHaveBeenCalledWith("keep-1"),
    );
  });

  it("keeps the dialog open and shows why when the merge is refused", async () => {
    const user = userEvent.setup();
    mergeUmpires.mockRejectedValue(
      new Error("Both umpires must be on this organization's roster"),
    );
    const onMerged = vi.fn();
    renderDialog(onMerged);

    await pickDuplicate(user);
    await user.click(screen.getByRole("button", { name: "Merge" }));

    expect(await screen.findByText(/roster/)).toBeInTheDocument();
    expect(onMerged).not.toHaveBeenCalled();
  });

  it("does not report a merge that succeeded as a failure when the list behind it cannot be reloaded", async () => {
    const user = userEvent.setup();
    const onMerged = vi.fn().mockRejectedValue(new Error("refresh failed"));
    const onOpenChange = vi.fn();
    renderDialog(onMerged, onOpenChange);

    await pickDuplicate(user);
    await user.click(screen.getByRole("button", { name: "Merge" }));

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(screen.queryByText(/refresh failed/)).not.toBeInTheDocument();
  });

  it("warns when an appointment had to be dropped, so the match is not left short", async () => {
    const user = userEvent.setup();
    mergeUmpires.mockResolvedValue({
      responsesMoved: 0,
      responsesDropped: 0,
      assignmentsMoved: 0,
      assignmentsDropped: 1,
    });
    renderDialog();

    await pickDuplicate(user);
    await user.click(screen.getByRole("button", { name: "Merge" }));

    await waitFor(() => expect(toast.warning).toHaveBeenCalled());
    expect(vi.mocked(toast.warning).mock.calls[0][0]).toMatch(/same match/i);
  });

  it("says the roster could not be read rather than loading forever", async () => {
    getUmpires.mockRejectedValue(new Error("offline"));
    renderDialog();

    expect(await screen.findByText(/an error occurred/i)).toBeInTheDocument();
  });

  it("searches the whole roster rather than only the rows on screen", async () => {
    const user = userEvent.setup();
    renderDialog();

    await screen.findByRole("button", { name: /anna\.vissre@example\.com/i });
    await user.type(screen.getByRole("textbox"), "berk");

    await waitFor(() =>
      expect(getUmpires).toHaveBeenLastCalledWith({ search: "berk" }),
    );
  });

  it("says the counts are unavailable rather than spinning for good", async () => {
    const user = userEvent.setup();
    getUmpireMergePreview.mockRejectedValue(new Error("network"));
    renderDialog();

    await pickDuplicate(user);

    expect(
      await screen.findByText(/could not count what the duplicate holds/i),
    ).toBeInTheDocument();
    // The merge does not depend on the counts, so it stays available.
    expect(screen.getByRole("button", { name: "Merge" })).toBeEnabled();
  });
});
