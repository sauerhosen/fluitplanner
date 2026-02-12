import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { LogoutButton } from "@/components/logout-button";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

describe("LogoutButton", () => {
  it("renders a logout button", () => {
    render(<LogoutButton />);
    expect(screen.getByRole("button", { name: /logout/i })).toBeInTheDocument();
  });
});
