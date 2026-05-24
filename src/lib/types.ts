export type ReasoningEffort = "none" | "minimal" | "low" | "medium" | "high" | "xhigh";

export type ItemStatus = "pending" | "generating" | "ready" | "failed";

export type BoardItem = {
  id: string;
  title: string;
  prompt: string;
  status: ItemStatus;
  imageAssetId: string | null;
  imageUrl: string | null;
  createdAt: string;
  updatedAt: string;
};

export type Tier = {
  id: string;
  label: string;
  itemIds: string[];
};

export type BoardTurn = {
  id: string;
  kind: "create" | "mutation" | "retry";
  input: string;
  status: "pending" | "completed" | "failed";
  createdAt: string;
};

export type BoardState = {
  id: string;
  ownerId: string;
  title: string;
  originalPrompt: string;
  desiredImageQuality: "low";
  visualStyle: "professional studio photography";
  createdAt: string;
  updatedAt: string;
  codex: {
    threadId: string | null;
    authAccountId: string | null;
    model: string | null;
    reasoningEffort: ReasoningEffort;
  };
  tiers: Tier[];
  trayItemIds: string[];
  items: Record<string, BoardItem>;
  turns: BoardTurn[];
};

export type CodexAuthStatus = {
  connected: boolean;
  mode: "mock" | "codex";
  detail: string;
};

