import { NextResponse } from "next/server";
import { getSessionId } from "@/lib/auth-session";
import { createBoard } from "@/lib/generation";
import { listBoards, saveBoard } from "@/lib/store";

export async function GET() {
  const ownerId = await getSessionId();
  return NextResponse.json({ boards: await listBoards(ownerId) });
}

export async function POST(request: Request) {
  const ownerId = await getSessionId();
  const body = (await request.json()) as { prompt?: string };
  const prompt = body.prompt?.trim();

  if (!prompt) {
    return NextResponse.json({ error: "Prompt is required" }, { status: 400 });
  }

  const board = await saveBoard(createBoard(prompt, ownerId));
  return NextResponse.json({ board });
}

