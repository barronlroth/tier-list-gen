import { NextResponse } from "next/server";
import { getCodexAuthStatus } from "@/lib/codex-app-server";

export async function GET() {
  return NextResponse.json(await getCodexAuthStatus());
}

