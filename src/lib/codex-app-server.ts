import { mkdirSync } from "node:fs";
import path from "node:path";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createInterface } from "node:readline";
import type { BoardState, ReasoningEffort } from "@/lib/types";

type JsonRpcResponse = {
  id?: number | string;
  result?: unknown;
  error?: unknown;
  method?: string;
  params?: unknown;
};

type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

export type DeviceLoginStart =
  | {
      type: "chatgptDeviceCode";
      loginId: string;
      verificationUrl: string;
      userCode: string;
    }
  | {
      type: "mock";
      loginId: string;
      verificationUrl: string;
      userCode: string;
    };

export type CodexGeneratedImage = {
  result: string;
  revisedPrompt: string | null;
  savedPath?: string;
};

export type CodexCreateResult = {
  title: string;
  threadId: string;
  model: string | null;
  accountId: string | null;
  items: Array<{
    title: string;
    imagePrompt: string;
    image: CodexGeneratedImage | null;
  }>;
};

export type CodexMutationResult = {
  threadId: string;
  model: string | null;
  accountId: string | null;
  addItems: Array<{
    title: string;
    imagePrompt: string;
    image: CodexGeneratedImage | null;
  }>;
  removeTitles: string[];
  boardTitle: string | null;
};

type NotificationHandler = (message: JsonRpcResponse) => void;

class CodexRpcClient {
  private readonly process: ChildProcessWithoutNullStreams;
  private initialized: Promise<unknown> | null = null;
  private nextId = 1;
  private alive = true;
  private readonly handlers = new Set<NotificationHandler>();
  private readonly pending = new Map<
    number,
    {
      reject: (reason: unknown) => void;
      resolve: (value: unknown) => void;
      timeout: ReturnType<typeof setTimeout>;
    }
  >();

  constructor(private readonly codexHome: string) {
    mkdirSync(codexHome, { recursive: true });
    this.process = spawn("codex", ["app-server", "--listen", "stdio://"], {
      env: {
        ...process.env,
        CODEX_HOME: codexHome,
      },
      stdio: ["pipe", "pipe", "pipe"],
    });

    const output = createInterface({ input: this.process.stdout });
    output.on("line", (line) => {
      if (!line.trim()) {
        return;
      }
      let message: JsonRpcResponse;
      try {
        message = JSON.parse(line) as JsonRpcResponse;
      } catch (error) {
        console.error("[codex app-server] failed to parse message", error);
        return;
      }
      if (typeof message.id === "number") {
        const pending = this.pending.get(message.id);
        if (!pending) {
          return;
        }
        this.pending.delete(message.id);
        clearTimeout(pending.timeout);
        if (message.error) {
          pending.reject(message.error);
        } else {
          pending.resolve(message.result);
        }
      } else if (message.method) {
        this.handlers.forEach((handler) => handler(message));
      }
    });

    this.process.stderr.on("data", (chunk) => {
      console.error("[codex app-server]", chunk.toString());
    });

    this.process.on("exit", (code, signal) => {
      this.alive = false;
      const error = new Error(`Codex app-server exited: code=${code ?? "null"} signal=${signal ?? "null"}`);
      this.pending.forEach((pending) => {
        clearTimeout(pending.timeout);
        pending.reject(error);
      });
      this.pending.clear();
    });
  }

  async request(method: string, params: unknown, timeoutMs = 30_000) {
    if (method !== "initialize") {
      await this.initialize();
    }
    if (!this.alive) {
      throw new Error("Codex app-server is not running");
    }

    const id = this.nextId++;
    const payload = JSON.stringify({ id, method, params });

    return await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        if (this.pending.delete(id)) {
          reject(new Error(`Timed out waiting for ${method}`));
        }
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timeout });
      this.process.stdin.write(`${payload}\n`);
    });
  }

  onNotification(handler: NotificationHandler) {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  isRunning() {
    return this.alive;
  }

  waitForNotification(
    predicate: (message: JsonRpcResponse) => boolean,
    timeoutMs: number,
  ) {
    return new Promise<JsonRpcResponse>((resolve, reject) => {
      const timeout = setTimeout(() => {
        unsubscribe();
        reject(new Error("Timed out waiting for Codex notification"));
      }, timeoutMs);
      const unsubscribe = this.onNotification((message) => {
        if (!predicate(message)) {
          return;
        }
        clearTimeout(timeout);
        unsubscribe();
        resolve(message);
      });
    });
  }

  private async initialize() {
    this.initialized ??= this.request("initialize", {
      clientInfo: {
        name: "tier-list-gen",
        title: "Tier List Gen",
        version: "0.1.0",
      },
      capabilities: {
        experimentalApi: false,
        requestAttestation: false,
        optOutNotificationMethods: [],
      },
    });

    return this.initialized;
  }
}

const clients = new Map<string, CodexRpcClient>();

function getClient(ownerId: string) {
  const codexHome = codexHomeForOwner(ownerId);
  const existing = clients.get(codexHome);
  if (existing?.isRunning()) {
    return existing;
  }
  clients.delete(codexHome);
  const client = new CodexRpcClient(codexHome);
  clients.set(codexHome, client);
  return client;
}

export async function getCodexAuthStatus(ownerId: string) {
  if (process.env.CODEX_ENABLE_APP_SERVER !== "true") {
    return {
      connected: false,
      mode: "mock" as const,
      detail: "App-server disabled. Set CODEX_ENABLE_APP_SERVER=true after harness validation.",
    };
  }

  try {
    const result = await getClient(ownerId).request("account/read", { refreshToken: true });
    const account = (result as { account?: unknown } | null)?.account;
    return {
      connected: Boolean(account),
      mode: "codex" as const,
      detail: account
        ? "Codex app-server account is connected for this browser session."
        : "Codex app-server is running. Start ChatGPT device login for real imagegen.",
    };
  } catch (error) {
    return {
      connected: false,
      mode: "mock" as const,
      detail: `Codex app-server unavailable: ${formatError(error)}`,
    };
  }
}

export async function startDeviceLogin(ownerId: string): Promise<DeviceLoginStart> {
  if (process.env.CODEX_ENABLE_APP_SERVER !== "true") {
    return {
      type: "mock",
      loginId: "mock-login",
      verificationUrl: "https://chatgpt.com",
      userCode: "MOCK-CODE",
    };
  }

  const result = (await getClient(ownerId).request("account/login/start", {
    type: "chatgptDeviceCode",
  })) as DeviceLoginStart;

  return result;
}

export async function createBoardWithCodex(
  ownerId: string,
  input: string,
): Promise<CodexCreateResult | null> {
  const ready = await getReadyCodexClient(ownerId);
  if (!ready) {
    return null;
  }

  const thread = (await ready.client.request("thread/start", {
    approvalPolicy: "never",
    sandbox: "read-only",
    cwd: process.cwd(),
    baseInstructions: CODEX_BOARD_INSTRUCTIONS,
    developerInstructions: CODEX_BOARD_INSTRUCTIONS,
    ephemeral: false,
    sessionStartSource: "startup",
    threadSource: "user",
  })) as {
    thread?: { id?: string };
    model?: string;
  };

  const threadId = thread.thread?.id;
  if (!threadId) {
    throw new Error("Codex did not return a thread id");
  }

  const result = await runStructuredCodexTurn(ready.client, {
    threadId,
    input: initialBoardPrompt(input),
    schema: createBoardSchema(),
    timeoutMs: 8 * 60_000,
  });
  const parsed = parseJsonObject(result.text) as {
    title?: unknown;
    items?: Array<{ title?: unknown; imagePrompt?: unknown }>;
  };
  const items = normalizeGeneratedItems(parsed.items);

  return {
    title: cleanTitle(typeof parsed.title === "string" ? parsed.title : input),
    threadId,
    model: thread.model ?? null,
    accountId: ready.accountId,
    items: items.map((item, index) => ({
      ...item,
      image: result.images[index] ?? null,
    })),
  };
}

export async function mutateBoardWithCodex(
  ownerId: string,
  board: BoardState,
  input: string,
): Promise<CodexMutationResult | null> {
  const ready = await getReadyCodexClient(ownerId);
  if (!ready || !board.codex.threadId) {
    return null;
  }

  const result = await runStructuredCodexTurn(ready.client, {
    threadId: board.codex.threadId,
    input: mutationPrompt(board, input),
    schema: mutationSchema(),
    timeoutMs: 8 * 60_000,
  });
  const parsed = parseJsonObject(result.text) as {
    addItems?: Array<{ title?: unknown; imagePrompt?: unknown }>;
    removeTitles?: unknown[];
    boardTitle?: unknown;
  };
  const addItems = normalizeGeneratedItems(parsed.addItems);

  return {
    threadId: board.codex.threadId,
    model: board.codex.model,
    accountId: ready.accountId,
    addItems: addItems.map((item, index) => ({
      ...item,
      image: result.images[index] ?? null,
    })),
    removeTitles: (parsed.removeTitles ?? [])
      .filter((title): title is string => typeof title === "string")
      .map(cleanTitle)
      .filter(Boolean),
    boardTitle: typeof parsed.boardTitle === "string" && parsed.boardTitle.trim()
      ? cleanTitle(parsed.boardTitle)
      : null,
  };
}

export async function retryImageWithCodex(
  ownerId: string,
  board: BoardState,
  itemId: string,
): Promise<CodexGeneratedImage | null> {
  const ready = await getReadyCodexClient(ownerId);
  const item = board.items[itemId];
  if (!ready || !item || !board.codex.threadId) {
    return null;
  }

  const result = await runStructuredCodexTurn(ready.client, {
    threadId: board.codex.threadId,
    input: retryPrompt(item.title, item.prompt),
    schema: retrySchema(),
    timeoutMs: 5 * 60_000,
  });

  return result.images[0] ?? null;
}

async function getReadyCodexClient(ownerId: string) {
  if (process.env.CODEX_ENABLE_APP_SERVER !== "true") {
    return null;
  }

  const client = getClient(ownerId);
  const [accountResult, capabilities] = await Promise.all([
    client.request("account/read", { refreshToken: true }),
    client.request("modelProvider/capabilities/read", {}),
  ]);
  const account = (accountResult as { account?: { type?: string; email?: string } | null }).account;
  const imageGeneration = Boolean(
    (capabilities as { imageGeneration?: boolean } | null)?.imageGeneration,
  );

  if (!account || !imageGeneration) {
    return null;
  }

  return {
    client,
    accountId: account.email ?? account.type ?? null,
  };
}

async function runStructuredCodexTurn(
  client: CodexRpcClient,
  options: {
    threadId: string;
    input: string;
    schema: JsonValue;
    timeoutMs: number;
  },
) {
  const images: CodexGeneratedImage[] = [];
  const texts: string[] = [];

  const unsubscribe = client.onNotification((message) => {
    collectNotification(message, options.threadId, images, texts);
  });

  try {
    const started = (await client.request("turn/start", {
      threadId: options.threadId,
      input: [{ type: "text", text: options.input, text_elements: [] }],
      approvalPolicy: "never",
      effort: "low" satisfies ReasoningEffort,
      summary: "none",
      personality: "none",
      outputSchema: options.schema,
    }, options.timeoutMs)) as { turn?: { id?: string } };

    const turnId = started.turn?.id;
    if (!turnId) {
      throw new Error("Codex did not return a turn id");
    }

    const completed = await client.waitForNotification(
      (message) => {
        const params = message.params as { threadId?: string; turn?: { id?: string } } | undefined;
        return (
          message.method === "turn/completed" &&
          params?.threadId === options.threadId &&
          params.turn?.id === turnId
        );
      },
      options.timeoutMs,
    );

    collectTurnItems((completed.params as { turn?: { items?: unknown[] } }).turn?.items, images, texts);

    try {
      const thread = (await client.request("thread/read", {
        threadId: options.threadId,
        includeTurns: true,
      })) as { thread?: { turns?: Array<{ id?: string; items?: unknown[] }> } };
      const finishedTurn = thread.thread?.turns?.find((turn) => turn.id === turnId);
      collectTurnItems(finishedTurn?.items, images, texts);
    } catch (error) {
      console.error("[codex app-server] failed to read completed turn", error);
    }

    const text = texts.find((candidate) => candidate.trim().startsWith("{")) ?? texts.at(-1);
    if (!text) {
      throw new Error("Codex did not return structured JSON text");
    }

    return {
      text,
      images: dedupeImages(images),
    };
  } finally {
    unsubscribe();
  }
}

function collectNotification(
  message: JsonRpcResponse,
  threadId: string,
  images: CodexGeneratedImage[],
  texts: string[],
) {
  const params = message.params as
    | { threadId?: string; item?: unknown; turn?: { items?: unknown[] } }
    | undefined;
  if (params?.threadId !== threadId) {
    return;
  }
  if (message.method === "rawResponseItem/completed") {
    collectRawResponseItem(params.item, images, texts);
  }
  if (message.method === "item/completed") {
    collectThreadItem(params.item, images, texts);
  }
  if (message.method === "turn/completed") {
    collectTurnItems(params.turn?.items, images, texts);
  }
}

function collectTurnItems(items: unknown[] | undefined, images: CodexGeneratedImage[], texts: string[]) {
  for (const item of items ?? []) {
    collectThreadItem(item, images, texts);
  }
}

function collectThreadItem(item: unknown, images: CodexGeneratedImage[], texts: string[]) {
  if (!item || typeof item !== "object") {
    return;
  }
  const record = item as Record<string, unknown>;
  if (record.type === "agentMessage" && typeof record.text === "string") {
    texts.push(record.text);
  }
  if (record.type === "imageGeneration" && typeof record.result === "string") {
    images.push({
      result: record.result,
      revisedPrompt: typeof record.revisedPrompt === "string" ? record.revisedPrompt : null,
      savedPath: typeof record.savedPath === "string" ? record.savedPath : undefined,
    });
  }
}

function collectRawResponseItem(item: unknown, images: CodexGeneratedImage[], texts: string[]) {
  if (!item || typeof item !== "object") {
    return;
  }
  const record = item as Record<string, unknown>;
  if (record.type === "image_generation_call" && typeof record.result === "string") {
    images.push({
      result: record.result,
      revisedPrompt: typeof record.revised_prompt === "string" ? record.revised_prompt : null,
    });
  }
  if (record.type === "message" && Array.isArray(record.content)) {
    for (const content of record.content) {
      if (
        content &&
        typeof content === "object" &&
        (content as Record<string, unknown>).type === "output_text" &&
        typeof (content as Record<string, unknown>).text === "string"
      ) {
        texts.push((content as { text: string }).text);
      }
    }
  }
}

function dedupeImages(images: CodexGeneratedImage[]) {
  const seen = new Set<string>();
  return images.filter((image) => {
    const key = image.savedPath ?? image.result.slice(0, 80);
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function normalizeGeneratedItems(items: unknown) {
  if (!Array.isArray(items)) {
    return [];
  }
  return items
    .map((item) => {
      if (!item || typeof item !== "object") {
        return null;
      }
      const record = item as Record<string, unknown>;
      const title = typeof record.title === "string" ? cleanTitle(record.title) : "";
      const imagePrompt =
        typeof record.imagePrompt === "string" && record.imagePrompt.trim()
          ? record.imagePrompt.trim()
          : imagePromptForTitle(title);
      return title ? { title, imagePrompt } : null;
    })
    .filter((item): item is { title: string; imagePrompt: string } => Boolean(item));
}

function parseJsonObject(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) {
      throw new Error("Codex JSON response was not parseable");
    }
    return JSON.parse(match[0]);
  }
}

function initialBoardPrompt(input: string) {
  return `Create a tier-list item set for this request: ${JSON.stringify(input)}.

Choose 8 to 10 concrete rankable items unless the request explicitly asks for a different count.
For every item, generate exactly one image before the final JSON. Use professional studio photography, square crop, single centered subject, clear lighting, neutral background, no text, no watermark. Use the fastest or lowest-quality image generation setting if one is available.

After generating images, return only JSON with this shape:
{"title":"...","items":[{"title":"...","imagePrompt":"..."}]}`;
}

function mutationPrompt(board: BoardState, input: string) {
  const currentItems = Object.values(board.items).map((item) => item.title).join(", ");
  return `Patch this tier-list item set.

Board title: ${board.title}
Current items: ${currentItems}
User mutation: ${JSON.stringify(input)}

Decide the smallest useful patch. Remove matching items when asked. Add off-theme items when asked; do not enforce theme coherence. Generate exactly one image for each added item and no images for removed items. Use professional studio photography, square crop, single centered subject, clear lighting, neutral background, no text, no watermark, and the fastest or lowest-quality image generation setting if one is available.

Return only JSON with this shape:
{"addItems":[{"title":"...","imagePrompt":"..."}],"removeTitles":["..."],"boardTitle":null}`;
}

function retryPrompt(title: string, previousPrompt: string) {
  return `Regenerate exactly one image for this tier-list item.

Title: ${title}
Image prompt: ${previousPrompt}

Use professional studio photography, square crop, single centered subject, clear lighting, neutral background, no text, no watermark, and the fastest or lowest-quality image generation setting if one is available.

Return only JSON: {"ok":true}`;
}

function createBoardSchema(): JsonValue {
  return {
    type: "object",
    additionalProperties: false,
    required: ["title", "items"],
    properties: {
      title: { type: "string" },
      items: {
        type: "array",
        minItems: 1,
        maxItems: 12,
        items: generatedItemSchema(),
      },
    },
  };
}

function mutationSchema(): JsonValue {
  return {
    type: "object",
    additionalProperties: false,
    required: ["addItems", "removeTitles", "boardTitle"],
    properties: {
      addItems: {
        type: "array",
        maxItems: 12,
        items: generatedItemSchema(),
      },
      removeTitles: {
        type: "array",
        items: { type: "string" },
      },
      boardTitle: {
        anyOf: [{ type: "string" }, { type: "null" }],
      },
    },
  };
}

function retrySchema(): JsonValue {
  return {
    type: "object",
    additionalProperties: false,
    required: ["ok"],
    properties: {
      ok: { type: "boolean" },
    },
  };
}

function generatedItemSchema(): JsonValue {
  return {
    type: "object",
    additionalProperties: false,
    required: ["title", "imagePrompt"],
    properties: {
      title: { type: "string" },
      imagePrompt: { type: "string" },
    },
  };
}

function imagePromptForTitle(title: string) {
  return `Professional studio photograph of ${title} for a tier-list tile. Clear single subject, recognizable, centered composition, simple neutral background, clean lighting, high visual clarity, no text, no watermark, square crop. Use low image quality or fastest generation settings if supported.`;
}

function cleanTitle(title: string) {
  return title.replace(/\s+/g, " ").trim();
}

function codexHomeForOwner(ownerId: string) {
  const root = process.env.CODEX_HOME ?? path.join(process.cwd(), "data", "codex-home");
  const safeOwner = ownerId.replace(/[^a-zA-Z0-9_-]/g, "_");
  return path.join(root, "sessions", safeOwner);
}

function formatError(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

const CODEX_BOARD_INSTRUCTIONS = `You are a backend worker for Tier List Gen.

Your job is to create and patch title+image tier-list item sets.
Do not edit files. Do not run shell commands. Do not explain your work to the user.
Use image generation when asked for images, then return only structured JSON matching the caller schema.
Image style is always professional studio photography for visual clarity.`;
