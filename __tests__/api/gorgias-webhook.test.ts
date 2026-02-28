// Mock Prisma using relative path (Jest's module resolver doesn't support @/ aliases in jest.mock)
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

import { POST, GET } from "@/app/api/webhooks/gorgias/events/route";

function getPrismaMock() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { prisma } = require("../../lib/prisma");
  return prisma as unknown as {
    apiLog: { create: jest.Mock; findMany: jest.Mock };
    performanceMetric: { create: jest.Mock };
    pulseCheck: { create: jest.Mock };
    agentBehaviorLog: { create: jest.Mock; findMany: jest.Mock };
    $disconnect: jest.Mock;
  };
}

function makeRequest(body: object): Request {
  return new Request("http://localhost:3001/api/webhooks/gorgias/events", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

describe("POST /api/webhooks/gorgias/events", () => {
  beforeEach(() => {
    const mock = getPrismaMock();
    mock.agentBehaviorLog.create.mockClear();
    mock.apiLog.create.mockClear();
  });

  it("parses and logs an agent reply event", async () => {
    const mock = getPrismaMock();
    const req = makeRequest({
      type: "ticket-message-created",
      ticket_id: 12345,
      ticket: {
        id: 12345,
        subject: "Track Order",
        assignee_user: { email: "spencer@ironsidecomputers.com" },
        tags: [{ name: "order-status" }],
      },
      message: {
        id: 9999,
        channel: "email",
        from_agent: true,
        body_text: "Your order is building.",
        sender: { type: "agent", email: "spencer@ironsidecomputers.com" },
        created_datetime: "2026-02-28T15:00:00Z",
      },
      created_datetime: "2026-02-28T15:00:00Z",
    });

    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.logged).toBe(1);
    expect(mock.agentBehaviorLog.create).toHaveBeenCalledTimes(1);
    expect(mock.agentBehaviorLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          agent: "spencer@ironsidecomputers.com",
          action: "reply",
          ticketId: 12345,
        }),
      })
    );
  });

  it("silently acknowledges customer messages (no agent action)", async () => {
    const mock = getPrismaMock();
    const req = makeRequest({
      type: "ticket-message-created",
      ticket_id: 12345,
      ticket: { id: 12345, subject: "Help", tags: [] },
      message: {
        id: 5555,
        channel: "email",
        from_agent: false,
        body_text: "I need help",
        sender: { type: "customer" },
        created_datetime: "2026-02-28T15:00:00Z",
      },
      created_datetime: "2026-02-28T15:00:00Z",
    });

    const res = await POST(req);
    const json = await res.json();

    expect(json.logged).toBe(0);
    expect(mock.agentBehaviorLog.create).not.toHaveBeenCalled();
  });

  it("parses and logs an HTTP Integration event (flat format)", async () => {
    const mock = getPrismaMock();
    const req = makeRequest({
      event_type: "ticket-message-created",
      ticket_id: "254414338",
      subject: "Track Order #9001",
      status: "open",
      assignee_email: "spencer@ironsidecomputers.com",
      customer_email: "john@gmail.com",
      last_message: "Your order is building.",
      tags: "order-status",
      updated_at: "2026-02-28T15:00:00Z",
    });

    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.logged).toBe(1);
    expect(mock.agentBehaviorLog.create).toHaveBeenCalledTimes(1);
    expect(mock.agentBehaviorLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          agent: "spencer@ironsidecomputers.com",
          action: "message",
          ticketId: 254414338,
        }),
      })
    );
  });

  it("returns 500 on invalid JSON", async () => {
    const req = new Request("http://localhost:3001/api/webhooks/gorgias/events", {
      method: "POST",
      body: "not-json",
      headers: { "content-type": "application/json" },
    });

    const res = await POST(req);
    expect(res.status).toBe(500);
  });
});

describe("GET /api/webhooks/gorgias/events", () => {
  it("returns health check with tracked events", async () => {
    const res = await GET();
    const json = await res.json();

    expect(json.status).toBe("active");
    expect(json.service).toBe("ironside-behavior-logger");
    expect(json.events_tracked).toContain("ticket-created");
    expect(json.events_tracked).toContain("ticket-updated");
    expect(json.events_tracked).toContain("ticket-message-created");
  });
});
