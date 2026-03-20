jest.mock("@/lib/gorgias/client", () => ({
  searchTickets: jest.fn(),
  getTicket: jest.fn(),
}));
jest.mock("@/lib/prisma", () => ({
  prisma: {
    pulseCheck: { findFirst: jest.fn().mockResolvedValue(null) },
  },
}));

import { handleSlashCommand } from "@/lib/slack/handlers/slash-command";
import { searchTickets } from "@/lib/gorgias/client";

const mockSearch = searchTickets as jest.Mock;

describe("/ironside search", () => {
  beforeEach(() => mockSearch.mockReset());

  it("returns usage hint when no query provided", async () => {
    const result = await handleSlashCommand("search");
    expect(result.text).toContain("Usage");
    expect(result.text).toContain("/ironside search");
  });

  it("returns no results message when nothing matches", async () => {
    mockSearch.mockResolvedValue([]);
    const result = await handleSlashCommand("search wifi driver");
    expect(result.text).toContain("No tickets found");
    expect(result.text).toContain("wifi driver");
  });

  it("returns ticket results with Reply buttons", async () => {
    mockSearch.mockResolvedValue([
      { id: 100, subject: "Wifi not working", status: "open", assignee: "spencer@ironsidecomputers.com", tags: ["REPORT-ISSUE"], messages: [] },
      { id: 101, subject: "LAN driver missing", status: "open", assignee: null, tags: [], messages: [] },
    ]);

    const result = await handleSlashCommand("search wifi");

    expect(result.blocks).toBeDefined();
    const blockText = JSON.stringify(result.blocks);
    expect(blockText).toContain("Wifi not working");
    expect(blockText).toContain("LAN driver missing");
    expect(blockText).toContain("open_reply_modal");
    expect(blockText).toContain("Found 2 ticket");
  });

  it("caps results at 10 tickets", async () => {
    const tickets = Array.from({ length: 15 }, (_, i) => ({
      id: 200 + i,
      subject: `Ticket ${i}`,
      status: "open",
      assignee: null,
      tags: [],
      messages: [],
    }));
    mockSearch.mockResolvedValue(tickets);

    const result = await handleSlashCommand("search test");

    const blockText = JSON.stringify(result.blocks);
    expect(blockText).toContain("showing first 10");
    // Count Reply buttons — should be 10
    const replyButtons = (blockText.match(/open_reply_modal/g) || []).length;
    expect(replyButtons).toBe(10);
  });

  it("shows search in help text", async () => {
    const result = await handleSlashCommand("help");
    expect(JSON.stringify(result.blocks)).toContain("/ironside search");
  });
});
