import { createSession, updateSession } from "@/lib/repos/agent-session.repo";
import { createRequest } from "@/lib/repos/agent-request.repo";
import { createToolCall } from "@/lib/repos/agent-tool-call.repo";
import { createOutcome } from "@/lib/repos/agent-outcome.repo";

export async function startSession(opts: {
  slackChannel?: string;
  slackThreadTs?: string;
  slackUserId?: string;
  userMessage: string;
  model: string;
}) {
  const session = await createSession({
    slackChannel: opts.slackChannel,
    slackThreadTs: opts.slackThreadTs,
    slackUserId: opts.slackUserId,
    userMessage: opts.userMessage,
  });

  const request = await createRequest({
    sessionId: session.id,
    model: opts.model,
  });

  return { sessionId: session.id, requestId: request.id };
}

export async function logToolCall(opts: {
  requestId: string;
  toolName: string;
  toolInput?: object;
  toolOutput?: object;
  durationMs?: number;
  success: boolean;
  error?: string;
}) {
  return createToolCall(opts);
}

export async function endSession(opts: {
  sessionId: string;
  startTime: number;
  success: boolean;
  answer?: string;
  error?: string;
  toolsUsed: string[];
}) {
  const durationMs = Date.now() - opts.startTime;

  await Promise.all([
    updateSession(opts.sessionId, {
      status: opts.success ? "completed" : "error",
      durationMs,
    }),
    createOutcome({
      sessionId: opts.sessionId,
      success: opts.success,
      answer: opts.answer,
      error: opts.error,
      toolsUsed: opts.toolsUsed,
    }),
  ]);
}
