import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { render } from "@/__tests__/helpers/render";
import { SharePollButton } from "@/components/polls/share-poll-button";
import { PollShareMenu } from "@/components/polls/poll-share-menu";
import {
  buildPollSharePath,
  pollTitleVersion,
} from "@/lib/domain/poll-share-link";

const writeText = vi.fn();

const NO_EXPORT_DATA = {
  pollTitle: "Herfst",
  slots: [],
  matches: [],
  responses: [],
  assignments: [],
  umpires: [],
};

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
    render(
      <PollShareMenu
        token="abc123"
        title="Herfst"
        canShareLink
        exportData={NO_EXPORT_DATA}
      />,
    );

    await userEvent.click(screen.getByTestId("poll-share-menu"));

    expect(
      screen.getByRole("menuitem", { name: /open poll page/i }),
    ).toHaveAttribute("href", buildPollSharePath("abc123", "Herfst"));
  });

  it("puts the exports in the same menu as the poll link", async () => {
    render(
      <PollShareMenu
        token="abc123"
        title="Herfst"
        canShareLink
        exportData={NO_EXPORT_DATA}
      />,
    );

    await userEvent.click(screen.getByTestId("poll-share-menu"));

    expect(
      screen.getByRole("menuitem", { name: /export all assignments/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("menuitem", { name: /export responses/i }),
    ).toBeInTheDocument();
  });

  it("offers a viewer the exports without the poll link", async () => {
    render(
      <PollShareMenu
        token="abc123"
        title="Herfst"
        canShareLink={false}
        exportData={NO_EXPORT_DATA}
      />,
    );

    await userEvent.click(screen.getByTestId("poll-share-menu"));

    expect(screen.getByTestId("poll-share-menu")).toHaveTextContent(/export/i);
    expect(
      screen.queryByRole("menuitem", { name: /copy link/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("menuitem", { name: /export all assignments/i }),
    ).toBeInTheDocument();
  });

  it("copies the bare link for an untitled poll", async () => {
    render(<SharePollButton token="abc123" title={null} />);

    await userEvent.click(screen.getByRole("button", { name: /copy link/i }));

    expect(writeText).toHaveBeenCalledWith(
      "https://vvv.fluiten.org/poll/abc123",
    );
  });
});
