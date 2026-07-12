import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { List } from "./types";

type Store = {
  lists: Record<string, List>;
  deleted: Record<string, number>;
};

const emptyStore = (): Store => ({ lists: {}, deleted: {} });
const defaultDataDir = process.env.TIERLISTGEN_FORCE_MOCK
  ? path.join(tmpdir(), `tierlistgen-test-${process.pid}`)
  : path.join(process.cwd(), ".tierlistgen-data");
const dataDir = process.env.TIERLISTGEN_DATA_DIR || defaultDataDir;
const storePath = path.join(dataDir, "lists.json");
let writeQueue: Promise<unknown> = Promise.resolve();

async function readStore(): Promise<Store> {
  try {
    const raw = JSON.parse(await readFile(storePath, "utf8")) as Partial<Store>;
    return { lists: raw.lists ?? {}, deleted: raw.deleted ?? {} };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return emptyStore();
    throw error;
  }
}

async function writeStore(store: Store) {
  await mkdir(dataDir, { recursive: true, mode: 0o700 });
  const temporaryPath = `${storePath}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temporaryPath, JSON.stringify(store), { encoding: "utf8", mode: 0o600 });
  await rename(temporaryPath, storePath);
}

function updateStore<T>(operation: (store: Store) => Promise<T> | T): Promise<T> {
  const next = writeQueue.then(async () => {
    const store = await readStore();
    const result = await operation(store);
    await writeStore(store);
    return result;
  });
  writeQueue = next.catch(() => undefined);
  return next;
}

export async function readSharedLists() {
  const store = await readStore();
  return { lists: Object.values(store.lists), deleted: store.deleted };
}

export function saveSharedList(list: List) {
  return updateStore(store => {
    if (store.deleted[list.id]) return false;
    const current = store.lists[list.id];
    if (!current || list.updatedAt >= current.updatedAt) store.lists[list.id] = list;
    return true;
  });
}

export function deleteSharedList(id: string) {
  return updateStore(store => {
    delete store.lists[id];
    store.deleted[id] = Date.now();
  });
}
