import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createInterface } from "node:readline";

type JsonRpcResponse = {
  id?: number | string;
  result?: unknown;
  error?: unknown;
  method?: string;
  params?: unknown;
};

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

class CodexRpcClient {
  private readonly process: ChildProcessWithoutNullStreams;
  private initialized: Promise<unknown> | null = null;
  private nextId = 1;
  private readonly pending = new Map<
    number,
    { resolve: (value: unknown) => void; reject: (reason: unknown) => void }
  >();

  constructor() {
    this.process = spawn("codex", ["app-server", "--listen", "stdio://"], {
      env: {
        ...process.env,
        CODEX_HOME: process.env.CODEX_HOME ?? `${process.cwd()}/data/codex-home`,
      },
      stdio: ["pipe", "pipe", "pipe"],
    });

    const output = createInterface({ input: this.process.stdout });
    output.on("line", (line) => {
      if (!line.trim()) {
        return;
      }
      const message = JSON.parse(line) as JsonRpcResponse;
      if (typeof message.id === "number") {
        const pending = this.pending.get(message.id);
        if (!pending) {
          return;
        }
        this.pending.delete(message.id);
        if (message.error) {
          pending.reject(message.error);
        } else {
          pending.resolve(message.result);
        }
      }
    });

    this.process.stderr.on("data", (chunk) => {
      console.error("[codex app-server]", chunk.toString());
    });
  }

  async request(method: string, params: unknown) {
    if (method !== "initialize") {
      await this.initialize();
    }

    const id = this.nextId++;
    const payload = JSON.stringify({ id, method, params });

    return await new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.process.stdin.write(`${payload}\n`);
      setTimeout(() => {
        if (this.pending.delete(id)) {
          reject(new Error(`Timed out waiting for ${method}`));
        }
      }, 30_000);
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

let client: CodexRpcClient | null = null;

function getClient() {
  client ??= new CodexRpcClient();
  return client;
}

export async function getCodexAuthStatus() {
  if (process.env.CODEX_ENABLE_APP_SERVER !== "true") {
    return {
      connected: false,
      mode: "mock" as const,
      detail: "App-server disabled. Set CODEX_ENABLE_APP_SERVER=true after harness validation.",
    };
  }

  const result = await getClient().request("account/read", { refreshToken: true });
  return {
    connected: Boolean((result as { account?: unknown } | null)?.account),
    mode: "codex" as const,
    detail: "Codex app-server account status read.",
  };
}

export async function startDeviceLogin(): Promise<DeviceLoginStart> {
  if (process.env.CODEX_ENABLE_APP_SERVER !== "true") {
    return {
      type: "mock",
      loginId: "mock-login",
      verificationUrl: "https://chatgpt.com",
      userCode: "MOCK-CODE",
    };
  }

  const result = (await getClient().request("account/login/start", {
    type: "chatgptDeviceCode",
  })) as DeviceLoginStart;

  return result;
}
