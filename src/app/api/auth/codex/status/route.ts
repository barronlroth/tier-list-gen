import { NextResponse } from "next/server";
import { getSessionId } from "@/lib/auth-session";
import { getCodexAuthStatus } from "@/lib/codex-app-server";

export async function GET() {
  const ownerId = await getSessionId();
  return NextResponse.json(await getCodexAuthStatus(ownerId));
}
