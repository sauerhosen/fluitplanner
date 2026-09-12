import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { render } from "@/__tests__/helpers/render";
import { SharePollButton } from "@/components/polls/share-poll-button";
import {
  buildPollSharePath,
  pollTitleVersion,
} from "@/lib/domain/poll-share-link";

const writeText = vi.fn();

beforeEach(() => {
  writeText.mockReset();
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText },
    configurable: true,
  });
  Object.defineProperty(window, "location", {
    value: { origin: "https://vvv.fluiten.org" },
    configurable: true,
  });
});

describe("SharePollButton", () => {
  it("copies a link stamped with the current title, so a rename re-unfurls", async () => {
    render(
      <SharePollButton token="abc123" title="Poll #2 - 19 en 26 september" />,
    );

    await userEvent.click(screen.getByRole("button", { name: /copy link/i }));

    expect(writeText).toHaveBeenCalledWith(
      `https://vvv.fluiten.org/poll/abc123?v=${pollTitleVersion("Poll #2 - 19 en 26 september")}`,
    );
  });

  it("copies a different link once the poll is renamed", async () => {
    const { rerender } = render(
      <SharePollButton token="abc123" title="Poll #2 - 13 en 19 september" />,
    );
    await userEvent.click(screen.getByRole("button", { name: /copy link/i }));
    const before = writeText.mock.calls[0][0];

    rerender(
      <SharePollButton token="abc123" title="Poll #2 - 19 en 26 september" />,
    );
    await userEvent.click(
      screen.getByRole("button", { name: /copied|copy link/i }),
    );

    expect(writeText.mock.calls[1][0]).not.toBe(before);
  });

  it("points the open-poll-page link at the stamped URL too, so copying it out of the address bar still unfurls fresh", async () => {
    render(<SharePollButton token="abc123" title="Herfst" variant="menu" />);

    await userEvent.click(screen.getByRole("button", { name: /share/i }));

    expect(
      screen.getByRole("menuitem", { name: /open poll page/i }),
    ).toHaveAttribute("href", buildPollSharePath("abc123", "Herfst"));
  });

  it("copies the bare link for an untitled poll", async () => {
    render(<SharePollButton token="abc123" title={null} />);

    await userEvent.click(screen.getByRole("button", { name: /copy link/i }));

    expect(writeText).toHaveBeenCalledWith(
      "https://vvv.fluiten.org/poll/abc123",
    );
  });
});
