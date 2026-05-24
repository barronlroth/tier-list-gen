import { NextResponse } from "next/server";
import { getSessionId } from "@/lib/auth-session";
import { getBoard } from "@/lib/store";

type Params = {
  params: Promise<{ boardId: string }>;
};

export async function GET(_request: Request, { params }: Params) {
  const ownerId = await getSessionId();
  const { boardId } = await params;
  return NextResponse.json({ board: await getBoard(ownerId, boardId) });
}

