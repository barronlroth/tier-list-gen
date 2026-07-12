import { NextResponse } from "next/server";
import { z } from "zod";
import { deleteSharedList, readSharedLists, saveSharedList } from "@/lib/server-list-store";

export const dynamic = "force-dynamic";

const tierSchema = z.array(z.string().min(1).max(100));
const listSchema = z.object({
  id: z.string().min(1).max(100),
  topic: z.string().trim().min(1).max(100),
  items: z.array(z.object({
    id: z.string().min(1).max(100),
    name: z.string().trim().min(1).max(100),
    image: z.string().max(10_000_000).optional(),
    status: z.enum(["loading", "failed"]).optional(),
  })).max(500),
  ranking: z.object({ S: tierSchema, A: tierSchema, B: tierSchema, C: tierSchema, D: tierSchema, F: tierSchema }),
  updatedAt: z.number().int().nonnegative(),
});
const deleteSchema = z.object({ id: z.string().min(1).max(100) });

export async function GET() {
  return NextResponse.json(await readSharedLists(), { headers: { "cache-control": "no-store" } });
}

export async function PUT(request: Request) {
  const parsed = listSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid list." }, { status: 400 });
  const saved = await saveSharedList(parsed.data);
  return NextResponse.json({ saved });
}

export async function DELETE(request: Request) {
  const parsed = deleteSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid list id." }, { status: 400 });
  await deleteSharedList(parsed.data.id);
  return new NextResponse(null, { status: 204 });
}
