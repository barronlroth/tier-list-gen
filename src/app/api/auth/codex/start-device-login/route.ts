import { NextResponse } from "next/server";
import { startDeviceLogin } from "@/lib/codex-app-server";

export async function POST() {
  const result = await startDeviceLogin();
  return NextResponse.json({
    loginId: result.loginId,
    verificationUrl: result.type === "mock" ? result.verificationUrl : result.verificationUrl,
    userCode: result.userCode,
    mode: result.type === "mock" ? "mock" : "codex",
  });
}

