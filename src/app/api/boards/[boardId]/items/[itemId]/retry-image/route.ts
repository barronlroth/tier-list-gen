import { NextResponse } from "next/server";
import { getSessionId } from "@/lib/auth-session";
import { retryImage } from "@/lib/generation";
import { getBoard, saveBoard } from "@/lib/store";

type Params = {
  params: Promise<{ boardId: string; itemId: string }>;
};

export async function POST(_request: Request, { params }: Params) {
  const ownerId = await getSessionId();
  const { boardId, itemId } = await params;
  const board = await getBoard(ownerId, boardId);
  const nextBoard = await saveBoard(retryImage(board, itemId));
  return NextResponse.json({ board: nextBoard });
}

