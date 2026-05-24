import { NextResponse } from "next/server";
import { getSessionId } from "@/lib/auth-session";
import { getBoard, saveBoard } from "@/lib/store";

type Params = {
  params: Promise<{ boardId: string }>;
};

export async function PATCH(request: Request, { params }: Params) {
  const ownerId = await getSessionId();
  const { boardId } = await params;
  const body = (await request.json()) as {
    tiers?: Array<{ id: string; itemIds: string[] }>;
    trayItemIds?: string[];
  };
  const board = await getBoard(ownerId, boardId);
  const knownItemIds = new Set(Object.keys(board.items));

  const trayItemIds = (body.trayItemIds ?? []).filter((id) => knownItemIds.has(id));
  const tiers = board.tiers.map((tier) => {
    const update = body.tiers?.find((candidate) => candidate.id === tier.id);
    return {
      ...tier,
      itemIds: (update?.itemIds ?? []).filter((id) => knownItemIds.has(id)),
    };
  });

  const placed = new Set([...trayItemIds, ...tiers.flatMap((tier) => tier.itemIds)]);
  const missing = Object.keys(board.items).filter((id) => !placed.has(id));
  const nextBoard = await saveBoard({
    ...board,
    tiers,
    trayItemIds: [...trayItemIds, ...missing],
    updatedAt: new Date().toISOString(),
  });

  return NextResponse.json({ board: nextBoard });
}

