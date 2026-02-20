import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import messages from "@/messages/en.json";

// Mock next-intl/server for server components
vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(async (namespace?: string) => {
    const ns = namespace as keyof typeof messages | undefined;
    const nsMessages = ns ? (messages[ns] as Record<string, string>) : {};
    return (key: string, params?: Record<string, string | number>) => {
      let msg = nsMessages?.[key] ?? key;
      if (params) {
        for (const [k, v] of Object.entries(params)) {
          msg = msg.replace(new RegExp(`\\{${k}\\}`, "g"), String(v));
          // Handle simple ICU plural: {key, plural, one {#...} other {#...}}
          const pluralRe = new RegExp(
            `\\{${k},\\s*plural,\\s*one\\s*\\{([^}]*)\\}\\s*other\\s*\\{([^}]*)\\}\\}`,
          );
          const match = msg.match(pluralRe);
          if (match) {
            const replacement = Number(v) === 1 ? match[1] : match[2];
            msg = msg.replace(match[0], replacement.replace("#", String(v)));
          }
        }
      }
      return msg;
    };
  }),
  getLocale: vi.fn(async () => "en"),
  getMessages: vi.fn(async () => messages),
}));

// Mock the dashboard actions
vi.mock("@/lib/actions/dashboard", () => ({
  getDashboardStats: vi.fn(),
  getActionItems: vi.fn(),
  getRecentActivity: vi.fn(),
}));

import { StatsSection } from "@/components/dashboard/stats-section";
import { ActionItemsSection } from "@/components/dashboard/action-items-section";
import { RecentActivitySection } from "@/components/dashboard/recent-activity-section";
import {
  getDashboardStats,
  getActionItems,
  getRecentActivity,
} from "@/lib/actions/dashboard";

describe("StatsSection", () => {
  it("renders all 4 stat cards with correct values", async () => {
    vi.mocked(getDashboardStats).mockResolvedValue({
      upcomingMatches: 5,
      openPolls: 2,
      unassignedMatches: 3,
      activeUmpires: 8,
    });

    const jsx = await StatsSection();
    render(jsx);

    expect(screen.getByText("Upcoming matches")).toBeInTheDocument();
    expect(screen.getByText("Open polls")).toBeInTheDocument();
    expect(screen.getByText("Unassigned")).toBeInTheDocument();
    expect(screen.getByText("Active umpires")).toBeInTheDocument();

    expect(screen.getByText("5")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("8")).toBeInTheDocument();
  });
});

describe("ActionItemsSection", () => {
  it("renders action items as links", async () => {
    vi.mocked(getActionItems).mockResolvedValue([
      {
        type: "unassigned_match",
        label: "3 unassigned matches in Weekend Poll",
        href: "/protected/polls/p1?tab=assignments",
      },
      {
        type: "unpolled_match",
        label: "HC A vs HC B (2026-03-15) not in any poll",
        href: "/protected/polls/new",
      },
    ]);

    const jsx = await ActionItemsSection();
    render(jsx);

    expect(screen.getByText("Needs attention")).toBeInTheDocument();
    expect(
      screen.getByText("3 unassigned matches in Weekend Poll"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("HC A vs HC B (2026-03-15) not in any poll"),
    ).toBeInTheDocument();

    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(2);
    expect(links[0]).toHaveAttribute(
      "href",
      "/protected/polls/p1?tab=assignments",
    );
    expect(links[1]).toHaveAttribute("href", "/protected/polls/new");
  });

  it("shows 'all caught up' when there are no action items", async () => {
    vi.mocked(getActionItems).mockResolvedValue([]);

    const jsx = await ActionItemsSection();
    render(jsx);

    expect(screen.getByText("You're all caught up")).toBeInTheDocument();
    expect(screen.queryAllByRole("link")).toHaveLength(0);
  });
});

describe("RecentActivitySection", () => {
  it("renders activity events", async () => {
    vi.mocked(getRecentActivity).mockResolvedValue([
      {
        type: "response",
        participant: "Jan",
        pollTitle: "Weekend Poll",
        timestamp: new Date().toISOString(),
      },
      {
        type: "assignment",
        umpire: "Piet",
        homeTeam: "HC A",
        awayTeam: "HC B",
        timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
      },
    ]);

    const jsx = await RecentActivitySection();
    render(jsx);

    expect(screen.getByText("Recent activity")).toBeInTheDocument();
    expect(
      screen.getByText("Jan responded to Weekend Poll"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Piet assigned to HC A vs HC B"),
    ).toBeInTheDocument();
  });

  it("shows 'No recent activity' when there are no events", async () => {
    vi.mocked(getRecentActivity).mockResolvedValue([]);

    const jsx = await RecentActivitySection();
    render(jsx);

    expect(screen.getByText("No recent activity.")).toBeInTheDocument();
  });
});
