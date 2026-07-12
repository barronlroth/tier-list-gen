import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { emptyRanking, type List } from "./types";

let dataDir: string | undefined;

afterEach(async () => {
  if (dataDir) await rm(dataDir, { recursive: true, force: true });
  delete process.env.TIERLISTGEN_DATA_DIR;
  dataDir = undefined;
  vi.resetModules();
});

describe("shared list store", () => {
  it("persists lists and prevents a deleted list from being resurrected", async () => {
    dataDir = await mkdtemp(path.join(tmpdir(), "tierlistgen-store-"));
    process.env.TIERLISTGEN_DATA_DIR = dataDir;
    const store = await import("./server-list-store");
    const list: List = {
      id: "list-1",
      topic: "potato dishes",
      items: [{ id: "item-1", name: "French fries", image: "data:image/png;base64,abc" }],
      ranking: { ...emptyRanking(), S: ["item-1"] },
      updatedAt: 10,
    };

    await expect(store.saveSharedList(list)).resolves.toBe(true);
    await expect(store.readSharedLists()).resolves.toMatchObject({ lists: [list] });
    await store.deleteSharedList(list.id);
    await expect(store.saveSharedList({ ...list, updatedAt: 20 })).resolves.toBe(false);
    await expect(store.readSharedLists()).resolves.toMatchObject({ lists: [], deleted: { "list-1": expect.any(Number) } });
  });
});
