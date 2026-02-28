// Mock all heavy dependencies BEFORE importing the route.
// jest.mock calls are hoisted by Jest, so they run before any imports.
//
// NOTE: We use relative paths (../../lib/...) instead of @/ aliases in jest.mock
// because Jest's module resolver doesn't know about tsconfig path aliases.
// The SWC transformer handles @/ for real imports, but jest.mock bypasses it.

// Mock the 6 tool modules so they don't initialize real LangChain tools
jest.mock("../../lib/langchain/tools/sw1-reader", () => ({
  sw1ReaderTool: { name: "sw1-reader" },
}));
jest.mock("../../lib/langchain/tools/sw2-writer", () => ({
  sw2WriterTool: { name: "sw2-writer" },
}));
jest.mock("../../lib/langchain/tools/sw3-analytics", () => ({
  sw3AnalyticsTool: { name: "sw3-analytics" },
}));
jest.mock("../../lib/langchain/tools/sw4-triage", () => ({
  sw4TriageTool: { name: "sw4-triage" },
}));
jest.mock("../../lib/langchain/tools/sw5-templates", () => ({
  sw5TemplateTool: { name: "sw5-templates" },
}));
jest.mock("../../lib/langchain/tools/sw6-escalation", () => ({
  sw6EscalationTool: { name: "sw6-escalation" },
}));

// Mock the router agent — createRouterAgent is called at module scope in route.ts.
// The invoke mock is defined inline because jest.mock factories are hoisted above
// variable declarations and can't reference outer const/let variables.
jest.mock("../../lib/langchain/router-agent", () => ({
  createRouterAgent: jest.fn(() => ({
    invoke: jest.fn().mockResolvedValue({
      messages: [{ content: "Mock response" }],
    }),
  })),
}));

// Mock the Slack client
jest.mock("../../lib/slack/client", () => ({
  sendSlackMessage: jest.fn().mockResolvedValue(undefined),
}));

// Mock Prisma
jest.mock("../../lib/prisma", () => {
  const mockPrisma = {
    apiLog: {
      create: jest.fn().mockResolvedValue({ id: "test-id" }),
      findMany: jest.fn().mockResolvedValue([]),
    },
    performanceMetric: {
      create: jest.fn().mockResolvedValue({ id: "test-id" }),
    },
    pulseCheck: {
      create: jest.fn().mockResolvedValue({ id: "test-id" }),
    },
    agentBehaviorLog: {
      create: jest.fn().mockResolvedValue({ id: "test-id" }),
      findMany: jest.fn().mockResolvedValue([]),
    },
    $disconnect: jest.fn(),
  };
  return { prisma: mockPrisma };
});

// Mock HumanMessage from langchain
jest.mock("@langchain/core/messages", () => ({
  HumanMessage: jest.fn((text: string) => ({ content: text })),
}));

// Must import route AFTER mocks are set up
import { POST } from "@/app/api/webhooks/slack/incoming/route";
import { NextRequest } from "next/server";

function makeRequest(
  body: object,
  headers: Record<string, string> = {}
): NextRequest {
  const req = new NextRequest(
    "http://localhost:3001/api/webhooks/slack/incoming",
    {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "content-type": "application/json", ...headers },
    }
  );
  return req;
}

// Re-export the mocked prisma for test assertions
function getPrismaMock() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { prisma } = require("../../lib/prisma");
  return prisma as {
    apiLog: { create: jest.Mock; findMany: jest.Mock };
    performanceMetric: { create: jest.Mock };
    $disconnect: jest.Mock;
  };
}

describe("POST /api/webhooks/slack/incoming", () => {
  beforeEach(() => {
    const mock = getPrismaMock();
    mock.apiLog.create.mockClear();
    mock.performanceMetric.create.mockClear();
  });

  it("responds to Slack URL verification challenge", async () => {
    const req = makeRequest({
      type: "url_verification",
      challenge: "test-challenge-123",
    });
    const res = await POST(req);
    const json = await res.json();
    expect(json.challenge).toBe("test-challenge-123");
  });

  it("ignores retry requests (x-slack-retry-num header)", async () => {
    const req = makeRequest(
      { event: { text: "hello", channel: "C123" } },
      { "x-slack-retry-num": "1" }
    );
    const res = await POST(req);
    const json = await res.json();
    expect(json.ignored).toBe("retry");
  });

  it("ignores bot messages (bot_id present)", async () => {
    const req = makeRequest({
      event: { text: "hello", bot_id: "B123", channel: "C123" },
    });
    const res = await POST(req);
    const json = await res.json();
    expect(json.ignored).toBe("bot_or_system_event");
  });

  it("ignores subtype messages (message_changed, etc)", async () => {
    const req = makeRequest({
      event: { text: "hello", subtype: "message_changed", channel: "C123" },
    });
    const res = await POST(req);
    const json = await res.json();
    expect(json.ignored).toBe("bot_or_system_event");
  });

  it("ignores empty messages", async () => {
    const req = makeRequest({
      event: { text: "   ", channel: "C123" },
    });
    const res = await POST(req);
    const json = await res.json();
    expect(json.ignored).toBe("empty_message");
  });
});
