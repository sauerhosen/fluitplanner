import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { render } from "@/__tests__/helpers/render";
import { DiscardedAnswersWarning } from "@/components/polls/discarded-answers-warning";

describe("DiscardedAnswersWarning", () => {
  it("renders nothing when no answers would be lost", () => {
    const { container } = render(<DiscardedAnswersWarning count={0} />);

    expect(container).toBeEmptyDOMElement();
  });

  it("says how many answers saving would discard", () => {
    render(<DiscardedAnswersWarning count={3} />);

    expect(screen.getByRole("status")).toHaveTextContent(
      /3 availability answers/,
    );
  });

  it("uses the singular for one answer", () => {
    render(<DiscardedAnswersWarning count={1} />);

    expect(screen.getByRole("status")).toHaveTextContent(
      /1 availability answer\b/,
    );
  });
});
