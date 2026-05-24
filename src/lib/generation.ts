import type { BoardItem, BoardState, Tier } from "@/lib/types";
import { randomUUID } from "node:crypto";

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

export function createBoard(prompt: string, ownerId: string): BoardState {
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

export function applyMutation(board: BoardState, input: string): BoardState {
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

export function retryImage(board: BoardState, itemId: string): BoardState {
  const item = board.items[itemId];
  if (!item) {
    return board;
  }

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
