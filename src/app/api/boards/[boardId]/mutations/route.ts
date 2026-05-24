import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { getSessionId } from "@/lib/auth-session";
import { appendPendingTurn, startMutationJob } from "@/lib/jobs";
import { getBoard, saveBoard } from "@/lib/store";

type Params = {
  params: Promise<{ boardId: string }>;
};

export async function POST(request: Request, { params }: Params) {
  const ownerId = await getSessionId();
  const { boardId } = await params;
  const body = (await request.json()) as { input?: string };
  const input = body.input?.trim();

  if (!input) {
    return NextResponse.json({ error: "Mutation input is required" }, { status: 400 });
  }

  const board = await getBoard(ownerId, boardId);
  const turnId = `turn_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
  const nextBoard = await saveBoard(appendPendingTurn(board, {
    id: turnId,
    kind: "mutation",
    input,
    phase: "queued",
    detail: "Queued board mutation.",
  }));
  startMutationJob(ownerId, board, turnId, input);
  return NextResponse.json({ board: nextBoard });
}
