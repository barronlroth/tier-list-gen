import { expect, test } from "@playwright/test";

test("adds one-off, sorts tiers, exports a titled PNG, saves, and reopens", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Access code").fill("demo");
  await page.getByRole("button", { name: /enter/i }).click();
  await page.getByLabel("List topic").fill("potato dishes");
  await page.getByRole("button", { name: /build my list/i }).click();
  await expect(page.getByText("WHO MAKES", { exact: false })).toBeVisible();
  await expect(page.locator(".edit")).toHaveCount(10);

  for (const total of [15, 20, 25, 30, 35]) {
    await page.getByRole("button", { name: /generate 5 more/i }).click();
    await expect(page.locator(".edit")).toHaveCount(total);
  }

  await page.getByRole("button", { name: /confirm/i }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await page.getByRole("button", { name: "Add one item", exact: true }).click();
  await page.getByLabel("One-off contender name").fill("Potato tornado");
  await page.getByRole("button", { name: "GENERATE", exact: true }).click();
  await expect(page.getByLabel("Move Potato tornado")).toBeVisible();
  await expect(page.locator(".card").filter({ hasText: "Potato tornado" }).locator("img")).toHaveCount(1);
  await expect(page.locator(".tray .card")).toHaveCount(37);

  const trayCards = page.locator(".tray .card").filter({ has: page.locator("select") });
  const firstName = await trayCards.first().locator("b").textContent();
  await trayCards.first().locator("select").selectOption("S");
  const secondName = await trayCards.first().locator("b").textContent();
  await trayCards.first().locator("select").selectOption("S");

  const tierCards = page.locator(".export-canvas:not(.png-export) .tier-S .card");
  await expect(tierCards).toHaveCount(2);
  await tierCards.nth(1).scrollIntoViewIfNeeded();
  const from = await tierCards.nth(1).getByRole("button", { name: /^Drag / }).boundingBox();
  const to = await tierCards.nth(0).boundingBox();
  expect(from).not.toBeNull();
  expect(to).not.toBeNull();
  await page.mouse.move(from!.x + from!.width / 2, from!.y + from!.height / 2);
  await page.mouse.down();
  await page.mouse.move(to!.x + to!.width / 2, to!.y + to!.height / 2, { steps: 12 });
  await page.mouse.up();
  await expect(tierCards.first().locator("b")).toHaveText(secondName!);
  await expect(tierCards.nth(1).locator("b")).toHaveText(firstName!);

  await expect(page.locator(".export-title h2")).toHaveText("potato dishes");
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: /export png/i }).click();
  await downloadPromise;

  await page.getByRole("button", { name: /lists/i }).click();
  await expect(page.locator(".recent article b")).toHaveText("potato dishes");
  await page.getByRole("button", { name: "OPEN", exact: true }).click();
  const reopenedTierCards = page.locator(".export-canvas:not(.png-export) .tier-S .card");
  await expect(reopenedTierCards).toHaveCount(2);
  await expect(reopenedTierCards.first().locator("b")).toHaveText(secondName!);
});

test("cancels image generation and keeps the mobile ranking board usable", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route("**/api/image", async route => {
    await new Promise(resolve => setTimeout(resolve, 1000));
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ url: "https://placehold.co/640x480" }),
    });
  });
  await page.goto("/");
  await page.getByLabel("Access code").fill("demo");
  await page.getByRole("button", { name: /enter/i }).click();
  await page.getByLabel("List topic").fill("potato dishes");
  await page.getByRole("button", { name: /build my list/i }).click();
  await page.getByRole("button", { name: /confirm/i }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByText("0 / 10 images ready")).toBeVisible();
  await expect(page.getByRole("button", { name: /cancel generation/i })).toBeVisible();
  await page.getByRole("button", { name: /cancel generation/i }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(page.getByRole("heading", { name: /UNRANKED/ })).toBeVisible();
  await expect(page.locator(".pic").filter({ hasText: "!" })).toHaveCount(10);
});
