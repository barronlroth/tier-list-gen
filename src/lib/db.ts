import { openDB } from "idb";
import type { List } from "./types";

type SharedLists = { lists: List[]; deleted: Record<string, number> };
const db = () => openDB("tierlistgen", 1, { upgrade(database) { database.createObjectStore("lists", { keyPath: "id" }); } });

async function getLocalLists() {
  return (await db()).getAll("lists") as Promise<List[]>;
}

async function putRemote(list: List) {
  const response = await fetch("/api/lists", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(list),
  });
  if (!response.ok) throw new Error("Shared save failed");
}

export async function saveList(list: List) {
  await (await db()).put("lists", list);
  await putRemote(list).catch(() => undefined);
}

export async function getLists() {
  const local = await getLocalLists();
  let shared: SharedLists;
  try {
    const response = await fetch("/api/lists", { cache: "no-store" });
    if (!response.ok) throw new Error("Shared load failed");
    shared = await response.json() as SharedLists;
  } catch {
    return local;
  }

  const database = await db();
  const merged = new Map(shared.lists.map(list => [list.id, list]));
  const uploads: Promise<void>[] = [];

  for (const list of local) {
    if (shared.deleted[list.id]) {
      await database.delete("lists", list.id);
      continue;
    }
    const remote = merged.get(list.id);
    if (!remote || list.updatedAt > remote.updatedAt) {
      merged.set(list.id, list);
      uploads.push(putRemote(list));
    }
  }

  await Promise.allSettled(uploads);
  await Promise.all([...merged.values()].map(list => database.put("lists", list)));
  return [...merged.values()];
}

export async function deleteList(id: string) {
  await (await db()).delete("lists", id);
  await fetch("/api/lists", {
    method: "DELETE",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id }),
  }).catch(() => undefined);
}
