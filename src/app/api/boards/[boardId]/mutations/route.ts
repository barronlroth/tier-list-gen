import { NextResponse } from "next/server";
import { getSessionId } from "@/lib/auth-session";
import { applyMutation } from "@/lib/generation";
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
  const nextBoard = await saveBoard(applyMutation(board, input));
  return NextResponse.json({ board: nextBoard });
}

