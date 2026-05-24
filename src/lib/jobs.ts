import { createBoard, applyMutation, retryImage } from "@/lib/generation";
import { getBoard, saveBoard, updateBoard } from "@/lib/store";
import type { BoardState, BoardTurn } from "@/lib/types";

const activeJobs = new Set<string>();

export function startCreateBoardJob(ownerId: string, board: BoardState) {
  startJob(`create:${board.id}`, async () => {
    const turnId = board.turns[0]?.id;
    await updateTurn(ownerId, board.id, turnId, {
      phase: "checking-auth",
      detail: "Checking whether this session can use Codex image generation.",
    });

    try {
      const generated = await createBoard(board.originalPrompt, ownerId, (phase, detail) =>
        updateTurn(ownerId, board.id, turnId, { phase: normalizePhase(phase), detail }),
      );
      const latest = await getBoard(ownerId, board.id);
      await saveBoard({
        ...generated,
        id: board.id,
        ownerId,
        createdAt: board.createdAt,
        updatedAt: new Date().toISOString(),
        turns: [
          ...latest.turns.filter((turn) => turn.id !== turnId),
          completeTurn(latest.turns.find((turn) => turn.id === turnId), {
            phase: generated.codex.threadId ? "completed" : "fallback",
            detail: generated.codex.threadId
              ? "Generated through Codex app-server."
              : "Completed with the fallback generator. No Codex images were returned.",
          }),
        ],
      });
    } catch (error) {
      await failTurn(ownerId, board.id, turnId, error);
    }
  });
}

export function startMutationJob(ownerId: string, board: BoardState, turnId: string, input: string) {
  startJob(`mutation:${board.id}:${turnId}`, async () => {
    try {
      const result = await applyMutation(board, input, ownerId, (phase, detail) =>
        updateTurn(ownerId, board.id, turnId, { phase: normalizePhase(phase), detail }),
      );
      const latest = await getBoard(ownerId, board.id);
      const generatedTurnIds = new Set(result.turns.map((turn) => turn.id));
      await saveBoard({
        ...result,
        turns: [
          ...latest.turns
            .filter((turn) => turn.id !== turnId)
            .filter((turn) => generatedTurnIds.has(turn.id)),
          completeTurn(latest.turns.find((turn) => turn.id === turnId), {
            phase: result.codex.threadId ? "completed" : "fallback",
            detail: result.codex.threadId
              ? "Mutation completed through Codex app-server."
              : "Mutation completed with the fallback patcher.",
          }),
        ],
      });
    } catch (error) {
      await failTurn(ownerId, board.id, turnId, error);
    }
  });
}

export function startRetryImageJob(ownerId: string, board: BoardState, turnId: string, itemId: string) {
  startJob(`retry:${board.id}:${turnId}`, async () => {
    try {
      const result = await retryImage(board, itemId, ownerId, (phase, detail) =>
        updateTurn(ownerId, board.id, turnId, { phase: normalizePhase(phase), detail }),
      );
      const latest = await getBoard(ownerId, board.id);
      const generatedTurnIds = new Set(result.turns.map((turn) => turn.id));
      await saveBoard({
        ...result,
        turns: [
          ...latest.turns
            .filter((turn) => turn.id !== turnId)
            .filter((turn) => generatedTurnIds.has(turn.id)),
          completeTurn(latest.turns.find((turn) => turn.id === turnId), {
            phase: result.codex.threadId ? "completed" : "fallback",
            detail: result.codex.threadId
              ? "Image retry completed through Codex app-server."
              : "Image retry completed with the fallback image.",
          }),
        ],
      });
    } catch (error) {
      await failTurn(ownerId, board.id, turnId, error);
    }
  });
}

export function appendPendingTurn(
  board: BoardState,
  turn: Omit<BoardTurn, "createdAt" | "id" | "status"> & { id: string },
) {
  return {
    ...board,
    updatedAt: new Date().toISOString(),
    turns: [
      ...board.turns,
      {
        ...turn,
        status: "pending" as const,
        createdAt: new Date().toISOString(),
      },
    ],
  };
}

async function updateTurn(
  ownerId: string,
  boardId: string,
  turnId: string | undefined,
  patch: Partial<BoardTurn>,
) {
  if (!turnId) {
    return;
  }
  await updateBoard(ownerId, boardId, (board) => ({
    ...board,
    updatedAt: new Date().toISOString(),
    turns: board.turns.map((turn) =>
      turn.id === turnId
        ? {
            ...turn,
            ...patch,
          }
        : turn,
    ),
  }));
}

async function failTurn(
  ownerId: string,
  boardId: string,
  turnId: string | undefined,
  error: unknown,
) {
  await updateTurn(ownerId, boardId, turnId, {
    status: "failed",
    phase: "failed",
    detail: "Generation failed.",
    error: formatError(error),
    completedAt: new Date().toISOString(),
  });
}

function completeTurn(
  turn: BoardTurn | undefined,
  patch: Pick<BoardTurn, "detail" | "phase">,
): BoardTurn {
  return {
    id: turn?.id ?? `turn_${Date.now()}`,
    kind: turn?.kind ?? "create",
    input: turn?.input ?? "",
    createdAt: turn?.createdAt ?? new Date().toISOString(),
    ...turn,
    ...patch,
    status: "completed",
    completedAt: new Date().toISOString(),
  };
}

function startJob(key: string, job: () => Promise<void>) {
  if (activeJobs.has(key)) {
    return;
  }
  activeJobs.add(key);
  void job().catch((error) => {
    console.error("[jobs] background job failed", error);
  }).finally(() => {
    activeJobs.delete(key);
  });
}

function normalizePhase(phase: string): BoardTurn["phase"] {
  const known = new Set([
    "queued",
    "checking-auth",
    "starting-thread",
    "running-codex",
    "generating-images",
    "saving-assets",
    "fallback",
    "completed",
    "failed",
  ]);
  return known.has(phase) ? (phase as BoardTurn["phase"]) : "running-codex";
}

function formatError(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}
