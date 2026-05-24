import { NextResponse } from "next/server";
import { getSessionId } from "@/lib/auth-session";
import { startDeviceLogin } from "@/lib/codex-app-server";

export async function POST() {
  const ownerId = await getSessionId();
  const result = await startDeviceLogin(ownerId);
  return NextResponse.json({
    loginId: result.loginId,
    verificationUrl: result.type === "mock" ? result.verificationUrl : result.verificationUrl,
    userCode: result.userCode,
    mode: result.type === "mock" ? "mock" : "codex",
  });
}
