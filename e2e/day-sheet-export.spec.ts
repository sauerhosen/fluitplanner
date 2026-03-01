import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { loadEnvConfig } from "@next/env";

// Load env so Supabase vars are available
loadEnvConfig(process.cwd());

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

test.describe("Day sheet export", () => {
  test.describe.configure({ mode: "serial" });

  const uniqueId = Date.now();
  const pollTitle = `E2E Day Sheet ${uniqueId}`;
  let pollUrl = "";
  let pollId = "";
  let orgId = "";
  let matchIds: string[] = [];
  let setupDone = false;

  test("seed matches, poll and assignments via API", async () => {
    const supabase = getServiceClient();

    // Find the E2E test user and their organization
    const {
      data: { users },
    } = await supabase.auth.admin.listUsers();
    const authUser = users.find(
      (u) => u.email === "e2e-test@fluitplanner.test",
    );
    expect(authUser).toBeTruthy();
    const userId = authUser!.id;

    const { data: membership } = await supabase
      .from("organization_members")
      .select("organization_id")
      .eq("user_id", userId)
      .single();

    expect(membership).toBeTruthy();
    orgId = membership!.organization_id;

    // Create 3 test matches for today
    const today = new Date().toISOString().slice(0, 10);
    const matchInserts = [
      {
        date: today,
        start_time: `${today}T10:00:00`,
        home_team: `E2E Home A ${uniqueId}`,
        away_team: `E2E Away A ${uniqueId}`,
        venue: "Test Venue",
        field: "Field 1",
        competition: "Test League",
        organization_id: orgId,
        created_by: userId,
      },
      {
        date: today,
        start_time: `${today}T12:00:00`,
        home_team: `E2E Home B ${uniqueId}`,
        away_team: `E2E Away B ${uniqueId}`,
        venue: "Test Venue",
        field: "Field 2",
        competition: "Test League",
        organization_id: orgId,
        created_by: userId,
      },
      {
        date: today,
        start_time: `${today}T14:00:00`,
        home_team: `E2E Home C ${uniqueId}`,
        away_team: `E2E Away C ${uniqueId}`,
        venue: "Test Venue",
        field: "Field 1",
        competition: "Test League",
        organization_id: orgId,
        created_by: userId,
      },
    ];

    const { data: matches, error: mErr } = await supabase
      .from("matches")
      .insert(matchInserts)
      .select("id");

    expect(mErr).toBeNull();
    expect(matches).toBeTruthy();
    matchIds = matches!.map((m) => m.id);

    // Create poll (token is required, generate a random one)
    const token = `e2e-${uniqueId}-${Math.random().toString(36).slice(2, 10)}`;
    const { data: poll, error: pErr } = await supabase
      .from("polls")
      .insert({
        title: pollTitle,
        token,
        status: "open",
        organization_id: orgId,
        created_by: userId,
      })
      .select("id")
      .single();

    expect(pErr).toBeNull();
    expect(poll).toBeTruthy();
    pollId = poll!.id;

    // Link matches to poll
    const pollMatches = matchIds.map((matchId) => ({
      poll_id: pollId,
      match_id: matchId,
    }));
    const { error: pmErr } = await supabase
      .from("poll_matches")
      .insert(pollMatches);
    expect(pmErr).toBeNull();

    // Get or create 2 umpires
    let { data: orgUmpires } = await supabase
      .from("organization_umpires")
      .select("umpire_id, umpires(id, name)")
      .eq("organization_id", orgId)
      .limit(2);

    if (!orgUmpires || orgUmpires.length < 2) {
      const names = [`E2E Umpire A ${uniqueId}`, `E2E Umpire B ${uniqueId}`];
      for (const name of names) {
        const { data: umpire } = await supabase
          .from("umpires")
          .insert({ name, email: `${name.replace(/\s/g, ".")}@test.local` })
          .select("id")
          .single();
        if (umpire) {
          await supabase
            .from("organization_umpires")
            .insert({ organization_id: orgId, umpire_id: umpire.id });
        }
      }
      const result = await supabase
        .from("organization_umpires")
        .select("umpire_id, umpires(id, name)")
        .eq("organization_id", orgId)
        .limit(2);
      orgUmpires = result.data;
    }

    expect(orgUmpires!.length).toBeGreaterThanOrEqual(2);
    const umpireIds = orgUmpires!.map((ou) => ou.umpire_id);

    // Create assignments
    const assignments = matchIds.flatMap((matchId) =>
      umpireIds.slice(0, 2).map((umpireId) => ({
        poll_id: pollId,
        match_id: matchId,
        umpire_id: umpireId,
        organization_id: orgId,
      })),
    );

    const { error: aErr } = await supabase
      .from("assignments")
      .insert(assignments);
    expect(aErr).toBeNull();

    pollUrl = `/protected/polls/${pollId}`;
    setupDone = true;
  });

  test("assignments tab shows export dropdown with day sheet section", async ({
    page,
  }) => {
    test.skip(!setupDone, "Setup failed");

    await page.goto(pollUrl);

    // Switch to assignments tab
    const assignmentsTab = page.getByRole("tab", { name: /assignments/i });
    await expect(assignmentsTab).toBeVisible({ timeout: 10000 });
    await assignmentsTab.click();

    // Open the export dropdown
    const exportButton = page.getByRole("button", { name: /export/i });
    await expect(exportButton).toBeVisible();
    await exportButton.click();

    // Verify "Day sheet" label appears in the dropdown
    await expect(page.getByText("Day sheet", { exact: true })).toBeVisible();
  });

  test("day sheet sub-menu shows date entries with format options", async ({
    page,
  }) => {
    test.skip(!setupDone, "Setup failed");

    await page.goto(pollUrl);
    await page.getByRole("tab", { name: /assignments/i }).click();
    await page.getByRole("button", { name: /export/i }).click();
    await expect(page.getByText("Day sheet", { exact: true })).toBeVisible();

    // Hover over the first date sub-trigger
    const subTriggers = page.locator("[role='menuitem'][data-state]");
    const subTriggerCount = await subTriggers.count();
    expect(subTriggerCount).toBeGreaterThan(0);
    await subTriggers.first().hover();

    // Verify sub-menu shows all 4 export format options
    const subMenu = page.locator("[role='menu']").last();
    await expect(subMenu.getByText("Excel (.xlsx)")).toBeVisible();
    await expect(subMenu.getByText("HTML (.html)")).toBeVisible();
    await expect(subMenu.getByText("Markdown (.md)")).toBeVisible();
    await expect(subMenu.getByText("Copy as Markdown")).toBeVisible();
  });

  test("day sheet markdown export downloads a file with umpire names", async ({
    page,
  }) => {
    test.skip(!setupDone, "Setup failed");

    await page.goto(pollUrl);
    await page.getByRole("tab", { name: /assignments/i }).click();
    await page.getByRole("button", { name: /export/i }).click();
    await expect(page.getByText("Day sheet", { exact: true })).toBeVisible();

    const subTriggers = page.locator("[role='menuitem'][data-state]");
    await subTriggers.first().hover();

    // Wait for sub-menu to fully render
    await page.waitForTimeout(300);

    // The sub-menu is the last [role='menu'] portal
    const subMenu = page.locator("[role='menu']").last();
    const mdItem = subMenu.getByText("Markdown (.md)");
    await expect(mdItem).toBeVisible();

    // Hover over the item first to ensure focus stays in sub-menu
    await mdItem.hover();

    const downloadPromise = page.waitForEvent("download");
    await mdItem.click({ force: true });

    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/daysheet.*\.md$/);

    // Read the downloaded file and verify contents
    const stream = await download.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.from(chunk));
    }
    const content = Buffer.concat(chunks).toString("utf-8");

    // Should contain the poll title and a markdown table
    expect(content).toContain(pollTitle);
    expect(content).toContain("##"); // date heading
    expect(content).toContain("|"); // table rows
    expect(content).toContain("Umpire"); // column header
  });

  test("day sheet xlsx export downloads a file", async ({ page }) => {
    test.skip(!setupDone, "Setup failed");

    await page.goto(pollUrl);
    await page.getByRole("tab", { name: /assignments/i }).click();
    await page.getByRole("button", { name: /export/i }).click();

    const subTriggers = page.locator("[role='menuitem'][data-state]");
    await subTriggers.first().hover();
    await page.waitForTimeout(300);

    const subMenu = page.locator("[role='menu']").last();
    const xlsxItem = subMenu.getByText("Excel (.xlsx)");
    await expect(xlsxItem).toBeVisible();
    await xlsxItem.hover();

    const downloadPromise = page.waitForEvent("download");
    await xlsxItem.click({ force: true });

    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/daysheet.*\.xlsx$/);
  });

  test("cleanup: delete test data", async () => {
    test.skip(!setupDone, "Setup failed");

    const supabase = getServiceClient();

    // Delete in dependency order
    await supabase.from("assignments").delete().eq("poll_id", pollId);
    await supabase.from("poll_matches").delete().eq("poll_id", pollId);
    await supabase.from("polls").delete().eq("id", pollId);
    for (const matchId of matchIds) {
      await supabase.from("matches").delete().eq("id", matchId);
    }
  });
});
