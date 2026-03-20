import { handleAutoTriage } from "@/lib/slack/handlers/auto-triage";
import type { GorgiasHttpIntegrationPayload } from "@/lib/gorgias/events";

// Mock dependencies
jest.mock("@/lib/langchain/tools/sw4-triage", () => ({
  classifyTicket: jest.fn(),
}));
jest.mock("@/lib/gorgias/client", () => ({
  updateTags: jest.fn().mockResolvedValue(undefined),
  assignTicket: jest.fn().mockResolvedValue(undefined),
  setStatus: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("@/lib/slack/client", () => ({
  sendSlackBlocks: jest.fn().mockResolvedValue(undefined),
}));

import { classifyTicket } from "@/lib/langchain/tools/sw4-triage";
import { updateTags, assignTicket, setStatus } from "@/lib/gorgias/client";
import { sendSlackBlocks } from "@/lib/slack/client";

const mockClassify = classifyTicket as jest.Mock;
const mockSetStatus = setStatus as jest.Mock;
const mockAssign = assignTicket as jest.Mock;
const mockTags = updateTags as jest.Mock;
const mockSlack = sendSlackBlocks as jest.Mock;

function makePayload(overrides: Partial<GorgiasHttpIntegrationPayload> = {}): GorgiasHttpIntegrationPayload {
  return {
    event_type: "ticket-created",
    ticket_id: 99999,
    subject: "Where is my order?",
    last_message: "I placed my order 3 weeks ago and have not received an update.",
    tags: "",
    assignee_email: undefined,
    customer_name: "John Smith",
    ...overrides,
  };
}

describe("handleAutoTriage", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("auto-closes spam and posts a visible Slack notice so it can be reopened if wrong", async () => {
    mockClassify.mockResolvedValue({
      category: "spam",
      suggestedTags: ["auto-close"],
      suggestedPriority: "low",
      suggestedAgent: null,
      reason: "Matched spam pattern",
    });

    await handleAutoTriage(makePayload({ subject: "Business funding offer" }));

    expect(mockSetStatus).toHaveBeenCalledWith(99999, "closed");
    // Should post a visible notice so ops can reopen false positives
    expect(mockSlack).toHaveBeenCalledTimes(1);
    const [text] = mockSlack.mock.calls[0];
    expect(text).toContain("spam");
  });

  it("classifies, tags, assigns, and posts Slack card with reply preview for track_order", async () => {
    mockClassify.mockResolvedValue({
      category: "track_order",
      suggestedTags: ["ORDER-STATUS"],
      suggestedPriority: "normal",
      suggestedAgent: "spencer@ironsidecomputers.com",
      reason: "Standard order status inquiry",
    });

    await handleAutoTriage(makePayload({ customer_name: "John Smith" }));

    expect(mockTags).toHaveBeenCalledWith(99999, ["ORDER-STATUS"]);
    expect(mockAssign).toHaveBeenCalledWith(99999, "spencer@ironsidecomputers.com");
    expect(mockSlack).toHaveBeenCalledTimes(1);

    const [, blocks] = mockSlack.mock.calls[0];
    const blockText = JSON.stringify(blocks);
    expect(blockText).toContain("track order");
    expect(blockText).toContain("SLA Target");
    expect(blockText).toContain("spencer");
    // Reply preview should include filled template body
    expect(blockText).toContain("John");
    expect(blockText).toContain("Suggested reply");
  });

  it("skips assignment if ticket already has an assignee", async () => {
    mockClassify.mockResolvedValue({
      category: "return_exchange",
      suggestedTags: ["RETURN/EXCHANGE"],
      suggestedPriority: "normal",
      suggestedAgent: "danni-jean@ironsidecomputers.com",
      reason: "Return request",
    });

    await handleAutoTriage(makePayload({ assignee_email: "spencer@ironsidecomputers.com" }));

    expect(mockAssign).not.toHaveBeenCalled();
    expect(mockSlack).toHaveBeenCalledTimes(1);
  });

  it("shows custom response nudge for categories with no template", async () => {
    mockClassify.mockResolvedValue({
      category: "product_question",
      suggestedTags: [],
      suggestedPriority: "normal",
      suggestedAgent: "spencer@ironsidecomputers.com",
      reason: "Pre-sale inquiry",
    });

    await handleAutoTriage(makePayload({ subject: "Which GPU should I pick?" }));

    const [, blocks] = mockSlack.mock.calls[0];
    const blockText = JSON.stringify(blocks);
    expect(blockText).toContain("product question");
    expect(blockText).toContain("draft a custom response");
  });

  it("skips tagging if all suggested tags already exist", async () => {
    mockClassify.mockResolvedValue({
      category: "track_order",
      suggestedTags: ["ORDER-STATUS"],
      suggestedPriority: "normal",
      suggestedAgent: null,
      reason: "Order status",
    });

    await handleAutoTriage(makePayload({ tags: "ORDER-STATUS" }));

    expect(mockTags).not.toHaveBeenCalled();
  });
});
