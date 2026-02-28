import { parseGorgiasEvent } from "@/lib/gorgias/events";

describe("parseGorgiasEvent", () => {
  describe("ticket-message-created", () => {
    it("logs a reply when agent sends an email message", () => {
      const payload = {
        type: "ticket-message-created",
        ticket_id: 12345,
        ticket: {
          id: 12345,
          subject: "Track Order #9001",
          assignee_user: { email: "spencer@ironsidecomputers.com" },
          tags: [{ name: "order-status" }],
        },
        message: {
          id: 9999,
          channel: "email",
          from_agent: true,
          body_text: "Hi, your order is in the build queue.",
          sender: { type: "agent", email: "spencer@ironsidecomputers.com" },
          created_datetime: "2026-02-28T15:00:00Z",
        },
        created_datetime: "2026-02-28T15:00:00Z",
      };

      const entries = parseGorgiasEvent(payload);
      expect(entries).toHaveLength(1);
      expect(entries[0].agent).toBe("spencer@ironsidecomputers.com");
      expect(entries[0].action).toBe("reply");
      expect(entries[0].ticketId).toBe(12345);
      expect(entries[0].category).toBe("track_order");
    });

    it("logs an internal note when channel is internal-note", () => {
      const payload = {
        type: "ticket-message-created",
        ticket_id: 12345,
        ticket: { id: 12345, subject: "Broken GPU", tags: [] },
        message: {
          id: 8888,
          channel: "internal-note",
          from_agent: true,
          body_text: "Escalating to Mackenzie.",
          sender: { type: "agent", email: "danni-jean@ironsidecomputers.com" },
          created_datetime: "2026-02-28T16:00:00Z",
        },
        created_datetime: "2026-02-28T16:00:00Z",
      };

      const entries = parseGorgiasEvent(payload);
      expect(entries).toHaveLength(1);
      expect(entries[0].action).toBe("internal_note");
    });

    it("logs macro_used when message has macro_id in meta", () => {
      const payload = {
        type: "ticket-message-created",
        ticket_id: 12345,
        ticket: { id: 12345, subject: "Return Request", tags: [] },
        message: {
          id: 7777,
          channel: "email",
          from_agent: true,
          body_text: "Here is our return policy...",
          sender: { type: "agent", email: "gabe@ironsidecomputers.com" },
          created_datetime: "2026-02-28T17:00:00Z",
          meta: { macro_id: 42 },
        },
        created_datetime: "2026-02-28T17:00:00Z",
      };

      const entries = parseGorgiasEvent(payload);
      expect(entries).toHaveLength(1);
      expect(entries[0].action).toBe("macro_used");
      expect(entries[0].macroIdUsed).toBe(42);
    });

    it("skips customer messages (from_agent=false)", () => {
      const payload = {
        type: "ticket-message-created",
        ticket_id: 12345,
        ticket: { id: 12345, subject: "Help", tags: [] },
        message: {
          id: 6666,
          channel: "email",
          from_agent: false,
          body_text: "I need help!",
          sender: { type: "customer", email: "customer@gmail.com" },
          created_datetime: "2026-02-28T18:00:00Z",
        },
        created_datetime: "2026-02-28T18:00:00Z",
      };

      const entries = parseGorgiasEvent(payload);
      expect(entries).toHaveLength(0);
    });
  });

  describe("ticket-updated", () => {
    it("logs close when status changes to closed", () => {
      const payload = {
        type: "ticket-updated",
        ticket_id: 12345,
        ticket: {
          id: 12345,
          subject: "Order Verification",
          assignee_user: { email: "mackenzie@ironsidecomputers.com" },
          tags: [],
        },
        changes: { status: { from: "open", to: "closed" } },
        created_datetime: "2026-02-28T19:00:00Z",
      };

      const entries = parseGorgiasEvent(payload);
      expect(entries).toHaveLength(1);
      expect(entries[0].action).toBe("close");
      expect(entries[0].reopened).toBe(false);
    });

    it("logs reopen when status changes from closed to open", () => {
      const payload = {
        type: "ticket-updated",
        ticket_id: 12345,
        ticket: {
          id: 12345,
          subject: "Order Verification",
          assignee_user: { email: "spencer@ironsidecomputers.com" },
          tags: [],
        },
        changes: { status: { from: "closed", to: "open" } },
        created_datetime: "2026-02-28T19:30:00Z",
      };

      const entries = parseGorgiasEvent(payload);
      expect(entries).toHaveLength(1);
      expect(entries[0].action).toBe("reopen");
      expect(entries[0].reopened).toBe(true);
    });

    it("logs assign when assignee changes", () => {
      const payload = {
        type: "ticket-updated",
        ticket_id: 12345,
        ticket: { id: 12345, subject: "GPU Issue", tags: [] },
        changes: {
          assignee_user: {
            from: { email: "spencer@ironsidecomputers.com" },
            to: { email: "mackenzie@ironsidecomputers.com" },
          },
        },
        created_datetime: "2026-02-28T20:00:00Z",
      };

      const entries = parseGorgiasEvent(payload);
      expect(entries).toHaveLength(1);
      expect(entries[0].action).toBe("assign");
      expect(entries[0].agent).toBe("mackenzie@ironsidecomputers.com");
    });

    it("returns empty when no changes object", () => {
      const payload = {
        type: "ticket-updated",
        ticket_id: 12345,
        ticket: { id: 12345, subject: "Something", tags: [] },
        created_datetime: "2026-02-28T21:00:00Z",
      };

      const entries = parseGorgiasEvent(payload);
      expect(entries).toHaveLength(0);
    });
  });

  describe("ticket-created", () => {
    it("logs ticket_created with assignee and category", () => {
      const payload = {
        type: "ticket-created",
        ticket_id: 12345,
        ticket: {
          id: 12345,
          subject: "Where is my order?",
          assignee_user: { email: "spencer@ironsidecomputers.com" },
          tags: [{ name: "order-status" }],
        },
        created_datetime: "2026-02-28T12:00:00Z",
      };

      const entries = parseGorgiasEvent(payload);
      expect(entries).toHaveLength(1);
      expect(entries[0].action).toBe("ticket_created");
      expect(entries[0].category).toBe("track_order");
    });
  });

  describe("unknown event type", () => {
    it("returns empty for unrecognized event types", () => {
      const payload = {
        type: "satisfaction-survey-completed",
        ticket_id: 12345,
        created_datetime: "2026-02-28T22:00:00Z",
      };

      const entries = parseGorgiasEvent(payload);
      expect(entries).toHaveLength(0);
    });
  });
});
