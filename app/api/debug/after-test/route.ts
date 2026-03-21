import { NextResponse, after } from "next/server";
import { sendSlackMessage } from "@/lib/slack/client";

export const maxDuration = 60;

export async function GET() {
  const channel = process.env.SLACK_CHANNEL_ID;

  after(async () => {
    console.log("[after-test] after() started at", new Date().toISOString());

    // Wait 5 seconds to prove after() runs beyond the response
    await new Promise(r => setTimeout(r, 5000));

    console.log("[after-test] after() completed after 5s delay at", new Date().toISOString());

    // Send a Slack message to prove after() ran
    if (channel) {
      await sendSlackMessage(
        "after() test: This message was sent 5 seconds after the HTTP response returned. after() is working on this deployment.",
        channel
      );
    }
  });

  return NextResponse.json({
    ok: true,
    message: "Response sent immediately. If after() works, you'll see a Slack message in ~5 seconds.",
    channel: channel ? "configured" : "MISSING",
    maxDuration: 60,
    timestamp: new Date().toISOString(),
  });
}
