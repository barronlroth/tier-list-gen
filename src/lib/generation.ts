import type { BoardItem, BoardState, Tier } from "@/lib/types";
import { randomUUID } from "node:crypto";
import {
  createBoardWithCodex,
  mutateBoardWithCodex,
  retryImageWithCodex,
  type CodexGeneratedImage,
  type CodexProgress,
} from "@/lib/codex-app-server";
import { saveGeneratedImageAsset } from "@/lib/assets";

const DEFAULT_TIERS: Tier[] = ["S", "A", "B", "C", "D", "F"].map((label) => ({
  id: `tier_${label.toLowerCase()}`,
  label,
  itemIds: [],
}));

const CHEESES = [
  "Brie",
  "Gouda",
  "Mozzarella",
  "Cheddar",
  "Manchego",
  "Roquefort",
  "Gruyere",
  "Feta",
  "Goat Cheese",
  "Camembert",
];

const MOVIES = [
  "Jurassic Park",
  "Alien",
  "The Matrix",
  "Blade Runner",
  "Arrival",
  "Interstellar",
  "The Thing",
  "Dune",
  "RoboCop",
  "Terminator 2",
];

const GENERIC = [
  "Classic Pick",
  "Wildcard",
  "Crowd Favorite",
  "Underrated Option",
  "Premium Choice",
  "Budget Choice",
  "Cult Favorite",
  "Safe Bet",
  "Chaotic Entry",
  "Sleeper Hit",
];

export function createPendingBoard(prompt: string, ownerId: string): BoardState {
  const now = new Date().toISOString();
  return {
    id: makeId("board"),
    ownerId,
    title: titleFromPrompt(prompt),
    originalPrompt: prompt,
    desiredImageQuality: "low",
    visualStyle: "professional studio photography",
    createdAt: now,
    updatedAt: now,
    codex: {
      threadId: null,
      authAccountId: null,
      model: null,
      reasoningEffort: "low",
    },
    tiers: DEFAULT_TIERS.map((tier) => ({ ...tier, itemIds: [] })),
    trayItemIds: [],
    items: {},
    turns: [
      {
        id: makeId("turn"),
        kind: "create",
        input: prompt,
        status: "pending",
        phase: "queued",
        detail: "Queued board generation.",
        createdAt: now,
      },
    ],
  };
}

export async function createBoard(
  prompt: string,
  ownerId: string,
  onProgress?: CodexProgress,
): Promise<BoardState> {
  try {
    const codexResult = await createBoardWithCodex(ownerId, prompt, onProgress);
    if (codexResult?.items.length) {
      return await boardFromCodexResult(prompt, ownerId, codexResult);
    }
  } catch (error) {
    console.error("[generation] falling back to mock board generation", error);
    await onProgress?.("fallback", `Codex generation failed; using fallback generator. ${formatError(error)}`);
  }

  await onProgress?.("fallback", "Using local fallback generator.");
  return createMockBoard(prompt, ownerId);
}

function createMockBoard(prompt: string, ownerId: string): BoardState {
  const titles = chooseInitialItems(prompt);
  const items = Object.fromEntries(
    titles.map((title) => {
      const id = makeId("item");
      return [id, makeItem(id, title)];
    }),
  );
  const itemIds = Object.keys(items);

  return {
    id: makeId("board"),
    ownerId,
    title: titleFromPrompt(prompt),
    originalPrompt: prompt,
    desiredImageQuality: "low",
    visualStyle: "professional studio photography",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    codex: {
      threadId: null,
      authAccountId: null,
      model: null,
      reasoningEffort: "low",
    },
    tiers: DEFAULT_TIERS.map((tier) => ({ ...tier, itemIds: [] })),
    trayItemIds: itemIds,
    items,
    turns: [
      {
        id: makeId("turn"),
        kind: "create",
        input: prompt,
        status: "completed",
        createdAt: new Date().toISOString(),
      },
    ],
  };
}

export async function applyMutation(
  board: BoardState,
  input: string,
  ownerId: string,
  onProgress?: CodexProgress,
): Promise<BoardState> {
  try {
    const codexResult = await mutateBoardWithCodex(ownerId, board, input, onProgress);
    if (codexResult) {
      return await applyCodexMutation(board, input, codexResult);
    }
  } catch (error) {
    console.error("[generation] falling back to mock board mutation", error);
    await onProgress?.("fallback", `Codex mutation failed; using fallback patcher. ${formatError(error)}`);
  }

  await onProgress?.("fallback", "Using local fallback patcher.");
  return applyMockMutation(board, input);
}

function applyMockMutation(board: BoardState, input: string): BoardState {
  const lowered = input.toLowerCase();
  const removeMatches = parseRemovalTargets(input);
  const addTitles = parseAddTargets(input);

  let next = removeMatches.reduce(removeItem, board);

  if (addTitles.length > 0) {
    const newItems = Object.fromEntries(
      addTitles.map((title) => {
        const id = makeId("item");
        return [id, makeItem(id, title)];
      }),
    );
    next = {
      ...next,
      items: { ...next.items, ...newItems },
      trayItemIds: [...next.trayItemIds, ...Object.keys(newItems)],
    };
  } else if (!lowered.includes("remove") && !lowered.includes("delete")) {
    const title = cleanupTitle(input);
    const id = makeId("item");
    next = {
      ...next,
      items: { ...next.items, [id]: makeItem(id, title) },
      trayItemIds: [...next.trayItemIds, id],
    };
  }

  return {
    ...next,
    updatedAt: new Date().toISOString(),
    turns: [
      ...next.turns,
      {
        id: makeId("turn"),
        kind: "mutation",
        input,
        status: "completed",
        createdAt: new Date().toISOString(),
      },
    ],
  };
}

export async function retryImage(
  board: BoardState,
  itemId: string,
  ownerId: string,
  onProgress?: CodexProgress,
): Promise<BoardState> {
  const item = board.items[itemId];
  if (!item) {
    return board;
  }

  try {
    const image = await retryImageWithCodex(ownerId, board, itemId, onProgress);
    if (image) {
      const asset = await saveGeneratedImageAsset(image);
      return {
        ...board,
        updatedAt: new Date().toISOString(),
        items: {
          ...board.items,
          [itemId]: {
            ...item,
            status: "ready",
            imageAssetId: asset.assetId,
            imageUrl: asset.imageUrl,
            updatedAt: new Date().toISOString(),
          },
        },
        turns: [
          ...board.turns,
          {
            id: makeId("turn"),
            kind: "retry",
            input: item.title,
            status: "completed",
            createdAt: new Date().toISOString(),
          },
        ],
      };
    }
  } catch (error) {
    console.error("[generation] falling back to mock image retry", error);
    await onProgress?.("fallback", `Codex retry failed; using fallback image. ${formatError(error)}`);
  }

  await onProgress?.("fallback", "Using local fallback image.");
  return {
    ...board,
    updatedAt: new Date().toISOString(),
    items: {
      ...board.items,
      [itemId]: {
        ...item,
        status: "ready",
        imageAssetId: makeId("asset"),
        imageUrl: placeholderImageUrl(item.title),
        updatedAt: new Date().toISOString(),
      },
    },
  };
}

function formatError(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

async function boardFromCodexResult(
  prompt: string,
  ownerId: string,
  result: {
    title: string;
    threadId: string;
    model: string | null;
    accountId: string | null;
    items: Array<{ title: string; imagePrompt: string; image: CodexGeneratedImage | null }>;
  },
): Promise<BoardState> {
  const itemPairs = await Promise.all(
    result.items.map(async (item) => {
      const id = makeId("item");
      return [id, await makeGeneratedItem(id, item.title, item.imagePrompt, item.image)] as const;
    }),
  );
  const items = Object.fromEntries(itemPairs);

  return {
    id: makeId("board"),
    ownerId,
    title: result.title || titleFromPrompt(prompt),
    originalPrompt: prompt,
    desiredImageQuality: "low",
    visualStyle: "professional studio photography",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    codex: {
      threadId: result.threadId,
      authAccountId: result.accountId,
      model: result.model,
      reasoningEffort: "low",
    },
    tiers: DEFAULT_TIERS.map((tier) => ({ ...tier, itemIds: [] })),
    trayItemIds: Object.keys(items),
    items,
    turns: [
      {
        id: makeId("turn"),
        kind: "create",
        input: prompt,
        status: "completed",
        createdAt: new Date().toISOString(),
      },
    ],
  };
}

async function applyCodexMutation(
  board: BoardState,
  input: string,
  result: {
    threadId: string;
    model: string | null;
    accountId: string | null;
    addItems: Array<{ title: string; imagePrompt: string; image: CodexGeneratedImage | null }>;
    removeTitles: string[];
    boardTitle: string | null;
  },
): Promise<BoardState> {
  let next = result.removeTitles.reduce(removeItem, board);

  if (result.addItems.length > 0) {
    const newItemPairs = await Promise.all(
      result.addItems.map(async (item) => {
        const id = makeId("item");
        return [id, await makeGeneratedItem(id, item.title, item.imagePrompt, item.image)] as const;
      }),
    );
    const newItems = Object.fromEntries(newItemPairs);
    next = {
      ...next,
      items: { ...next.items, ...newItems },
      trayItemIds: [...next.trayItemIds, ...Object.keys(newItems)],
    };
  }

  return {
    ...next,
    title: result.boardTitle ?? next.title,
    updatedAt: new Date().toISOString(),
    codex: {
      ...next.codex,
      threadId: result.threadId,
      authAccountId: result.accountId,
      model: result.model,
    },
    turns: [
      ...next.turns,
      {
        id: makeId("turn"),
        kind: "mutation",
        input,
        status: "completed",
        createdAt: new Date().toISOString(),
      },
    ],
  };
}

async function makeGeneratedItem(
  id: string,
  title: string,
  prompt: string,
  image: CodexGeneratedImage | null,
): Promise<BoardItem> {
  const now = new Date().toISOString();
  if (!image) {
    return {
      id,
      title,
      prompt,
      status: "failed",
      imageAssetId: null,
      imageUrl: null,
      createdAt: now,
      updatedAt: now,
    };
  }

  try {
    const asset = await saveGeneratedImageAsset(image);
    return {
      id,
      title,
      prompt,
      status: "ready",
      imageAssetId: asset.assetId,
      imageUrl: asset.imageUrl,
      createdAt: now,
      updatedAt: now,
    };
  } catch (error) {
    console.error("[generation] failed to save generated image asset", error);
    return {
      id,
      title,
      prompt,
      status: "failed",
      imageAssetId: null,
      imageUrl: null,
      createdAt: now,
      updatedAt: now,
    };
  }
}

function chooseInitialItems(prompt: string) {
  const lowered = prompt.toLowerCase();
  if (lowered.includes("cheese")) {
    return CHEESES;
  }
  if (lowered.includes("movie") || lowered.includes("sci-fi") || lowered.includes("film")) {
    return MOVIES;
  }
  return GENERIC.map((name) => `${name} ${topicFromPrompt(prompt)}`);
}

function titleFromPrompt(prompt: string) {
  const cleaned = prompt
    .replace(/^make\s+(a\s+)?/i, "")
    .replace(/^create\s+(a\s+)?/i, "")
    .replace(/^rank\s+/i, "")
    .trim();
  const title = cleaned.length > 0 ? cleaned : "Tier List";
  return title
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
    .replace(/\s+/g, " ");
}

function topicFromPrompt(prompt: string) {
  return prompt
    .replace(/make|create|tier|list|rank|of|the|a|an/gi, "")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .slice(0, 2)
    .join(" ");
}

function parseAddTargets(input: string) {
  const addMatch = input.match(/(?:add|include|bring in)\s+(.+?)(?:\s+(?:and|but)\s+remove|\s*$)/i);
  if (!addMatch) {
    return [];
  }
  return splitTargets(addMatch[1]);
}

function parseRemovalTargets(input: string) {
  const removeMatch = input.match(/(?:remove|delete|drop)\s+(.+)$/i);
  if (!removeMatch) {
    return [];
  }
  return splitTargets(removeMatch[1]);
}

function splitTargets(value: string) {
  return value
    .split(/,| and /i)
    .map(cleanupTitle)
    .filter(Boolean);
}

function cleanupTitle(value: string) {
  return value
    .replace(/\b(add|include|remove|delete|drop|please|also)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function removeItem(board: BoardState, match: string): BoardState {
  const lowered = match.toLowerCase();
  const idsToRemove = Object.values(board.items)
    .filter((item) => item.title.toLowerCase().includes(lowered))
    .map((item) => item.id);

  if (idsToRemove.length === 0) {
    return board;
  }

  const removeSet = new Set(idsToRemove);
  const items = { ...board.items };
  idsToRemove.forEach((id) => {
    delete items[id];
  });

  return {
    ...board,
    items,
    trayItemIds: board.trayItemIds.filter((id) => !removeSet.has(id)),
    tiers: board.tiers.map((tier) => ({
      ...tier,
      itemIds: tier.itemIds.filter((id) => !removeSet.has(id)),
    })),
  };
}

function makeItem(id: string, title: string): BoardItem {
  const now = new Date().toISOString();
  return {
    id,
    title,
    prompt: `Professional studio photograph of ${title} for a tier-list tile. Clear single subject, recognizable, centered composition, simple neutral background, clean lighting, high visual clarity, no text, no watermark, square crop. Use low image quality or fastest generation settings if supported.`,
    status: "ready",
    imageAssetId: makeId("asset"),
    imageUrl: placeholderImageUrl(title),
    createdAt: now,
    updatedAt: now,
  };
}

function placeholderImageUrl(title: string) {
  return `/api/placeholders/${encodeURIComponent(title)}`;
}

function makeId(prefix: string) {
  return `${prefix}_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
}
