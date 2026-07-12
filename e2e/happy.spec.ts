import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { inflateSync } from "node:zlib";

async function expectPngHasVisibleContent(path: string) {
  const png = await readFile(path);
  let offset = 8;
  let width = 0;
  let height = 0;
  let colorType = 0;
  const imageData: Buffer[] = [];
  while (offset < png.length) {
    const length = png.readUInt32BE(offset);
    const type = png.toString("ascii", offset + 4, offset + 8);
    const data = png.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      expect(data[8]).toBe(8);
      colorType = data[9];
    }
    if (type === "IDAT") imageData.push(data);
    offset += length + 12;
  }
  const bytesPerPixel = colorType === 6 ? 4 : colorType === 2 ? 3 : 0;
  expect(bytesPerPixel).toBeGreaterThan(0);
  expect(width).toBeGreaterThan(500);
  expect(height).toBeGreaterThan(500);
  const packed = inflateSync(Buffer.concat(imageData));
  const rowBytes = width * bytesPerPixel;
  const pixels = Buffer.alloc(rowBytes * height);
  const paeth = (a: number, b: number, c: number) => {
    const p = a + b - c;
    const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
    return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
  };
  for (let y = 0; y < height; y++) {
    const source = y * (rowBytes + 1);
    const target = y * rowBytes;
    const filter = packed[source];
    for (let x = 0; x < rowBytes; x++) {
      const value = packed[source + x + 1];
      const left = x >= bytesPerPixel ? pixels[target + x - bytesPerPixel] : 0;
      const up = y ? pixels[target + x - rowBytes] : 0;
      const upperLeft = y && x >= bytesPerPixel ? pixels[target + x - rowBytes - bytesPerPixel] : 0;
      const predictor = filter === 1 ? left : filter === 2 ? up : filter === 3 ? Math.floor((left + up) / 2) : filter === 4 ? paeth(left, up, upperLeft) : 0;
      pixels[target + x] = (value + predictor) & 255;
    }
  }
  const colors = new Set<string>();
  const pixelStride = Math.max(1, Math.floor(width * height / 20_000));
  for (let pixel = 0; pixel < width * height; pixel += pixelStride) {
    const index = pixel * bytesPerPixel;
    colors.add(`${pixels[index]},${pixels[index + 1]},${pixels[index + 2]}`);
    if (colors.size > 20) break;
  }
  expect(colors.size).toBeGreaterThan(20);
}

test("adds one-off, sorts tiers, exports a titled PNG, saves, and reopens", async ({ page, browser }) => {
  await page.goto("/");
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
  await expect(page.getByRole("button", { name: "Add one item", exact: true })).toBeEnabled();
  await expect(page.locator(".tray .card")).toHaveCount(37);

  const trayCards = page.locator(".tray .card").filter({ has: page.locator("select") });
  const firstName = await trayCards.first().locator("b").textContent();
  await trayCards.first().locator("select").selectOption("S");
  const secondName = await trayCards.first().locator("b").textContent();
  await trayCards.first().locator("select").selectOption("S");

  const tierCards = page.locator(".export-canvas .tier-S .card");
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
  await page.waitForTimeout(300);

  await expect(page.locator(".export-title h2")).toHaveText("potato dishes");
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: /export png/i }).click();
  const download = await downloadPromise;
  const downloadedPath = await download.path();
  expect(downloadedPath).not.toBeNull();
  await expectPngHasVisibleContent(downloadedPath!);

  await page.getByRole("button", { name: /lists/i }).click();
  await expect(page.locator(".recent article b")).toHaveText("potato dishes");
  await page.getByRole("button", { name: "OPEN", exact: true }).click();
  const reopenedTierCards = page.locator(".export-canvas .tier-S .card");
  await expect(reopenedTierCards).toHaveCount(2);
  await expect(reopenedTierCards.first().locator("b")).toHaveText(secondName!);

  const phone = await browser.newContext({ baseURL: new URL(page.url()).origin, viewport: { width: 390, height: 844 }, hasTouch: true });
  const phonePage = await phone.newPage();
  await phonePage.goto("/");
  await expect(phonePage.locator(".recent article b")).toHaveText("potato dishes");
  await phone.close();
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
