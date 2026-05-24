import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { getSessionId } from "@/lib/auth-session";
import { appendPendingTurn, startRetryImageJob } from "@/lib/jobs";
import { getBoard, saveBoard } from "@/lib/store";

type Params = {
  params: Promise<{ boardId: string; itemId: string }>;
};

export async function POST(_request: Request, { params }: Params) {
  const ownerId = await getSessionId();
  const { boardId, itemId } = await params;
  const board = await getBoard(ownerId, boardId);
  const item = board.items[itemId];
  if (!item) {
    return NextResponse.json({ board });
  }

  const turnId = `turn_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
  const withGeneratingItem = {
    ...board,
    items: {
      ...board.items,
      [itemId]: {
        ...item,
        status: "generating" as const,
        updatedAt: new Date().toISOString(),
      },
    },
  };
  const nextBoard = await saveBoard(appendPendingTurn(withGeneratingItem, {
    id: turnId,
    kind: "retry",
    input: item.title,
    phase: "queued",
    detail: `Queued image retry for ${item.title}.`,
  }));
  startRetryImageJob(ownerId, withGeneratingItem, turnId, itemId);
  return NextResponse.json({ board: nextBoard });
}
