import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const body = await request.json();

  // Slack URL verification handshake
  if (body.type === "url_verification") {
    return NextResponse.json({ challenge: body.challenge });
  }

  console.log("[slack/incoming]", JSON.stringify(body, null, 2));

  return NextResponse.json({ ok: true });
}
