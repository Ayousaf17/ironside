// Returns hardcoded fake tickets so we never touch real customer data in dev.

export interface GorgiasMessage {
  id: number;
  sender: { type: "customer" | "agent"; name: string };
  body_text: string;
  created_datetime: string;
}

export interface GorgiasTicket {
  id: number;
  subject: string;
  status: "open" | "closed";
  channel: "email" | "chat";
  assignee: string | null;
  tags: string[];
  created_datetime: string;
  messages: GorgiasMessage[];
}

const MOCK_TICKETS: GorgiasTicket[] = [
  {
    id: 1001,
    subject: "Order #8432 not received",
    status: "open",
    channel: "email",
    assignee: "alice@ironside.dev",
    tags: ["shipping", "urgent"],
    created_datetime: "2026-02-20T09:15:00Z",
    messages: [
      { id: 2001, sender: { type: "customer", name: "Jamie Rivera" }, body_text: "Hi, I placed order #8432 five days ago and it still hasn't arrived.", created_datetime: "2026-02-20T09:15:00Z" },
      { id: 2002, sender: { type: "agent", name: "Alice" }, body_text: "I'm looking into this right now. Let me check with the warehouse.", created_datetime: "2026-02-20T10:03:00Z" },
    ],
  },
  {
    id: 1002,
    subject: "Damaged item in package",
    status: "open",
    channel: "email",
    assignee: "bob@ironside.dev",
    tags: ["returns", "damaged"],
    created_datetime: "2026-02-21T14:22:00Z",
    messages: [
      { id: 2003, sender: { type: "customer", name: "Sam Patel" }, body_text: "The ceramic mug I ordered arrived cracked. I'd like a replacement.", created_datetime: "2026-02-21T14:22:00Z" },
      { id: 2004, sender: { type: "agent", name: "Bob" }, body_text: "Sorry about that! I'll ship a replacement today.", created_datetime: "2026-02-21T14:45:00Z" },
    ],
  },
  {
    id: 1003,
    subject: "How do I change my subscription plan?",
    status: "closed",
    channel: "chat",
    assignee: "alice@ironside.dev",
    tags: ["billing", "subscription"],
    created_datetime: "2026-02-18T11:00:00Z",
    messages: [
      { id: 2005, sender: { type: "customer", name: "Morgan Lee" }, body_text: "I want to switch from monthly to annual billing.", created_datetime: "2026-02-18T11:00:00Z" },
      { id: 2006, sender: { type: "agent", name: "Alice" }, body_text: "Go to Account > Billing > Change Plan. Select Annual and confirm.", created_datetime: "2026-02-18T11:08:00Z" },
    ],
  },
  {
    id: 1004,
    subject: "Promo code SAVE20 not working",
    status: "open",
    channel: "chat",
    assignee: null,
    tags: ["billing", "promo"],
    created_datetime: "2026-02-25T16:30:00Z",
    messages: [
      { id: 2007, sender: { type: "customer", name: "Taylor Kim" }, body_text: "I'm trying to apply SAVE20 at checkout but it says invalid.", created_datetime: "2026-02-25T16:30:00Z" },
    ],
  },
  {
    id: 1005,
    subject: "Request for bulk order pricing",
    status: "open",
    channel: "email",
    assignee: "bob@ironside.dev",
    tags: ["sales", "bulk"],
    created_datetime: "2026-02-22T08:45:00Z",
    messages: [
      { id: 2008, sender: { type: "customer", name: "Chris Donovan" }, body_text: "We're looking to order 500 units. Do you offer volume discounts?", created_datetime: "2026-02-22T08:45:00Z" },
      { id: 2009, sender: { type: "agent", name: "Bob" }, body_text: "For orders over 200 units we offer 15% off. I'll send a formal quote.", created_datetime: "2026-02-22T09:30:00Z" },
    ],
  },
  {
    id: 1006,
    subject: "Password reset not sending email",
    status: "closed",
    channel: "chat",
    assignee: "alice@ironside.dev",
    tags: ["account", "bug"],
    created_datetime: "2026-02-19T13:10:00Z",
    messages: [
      { id: 2010, sender: { type: "customer", name: "Jordan Voss" }, body_text: "I keep clicking forgot password but never receive the reset email.", created_datetime: "2026-02-19T13:10:00Z" },
      { id: 2011, sender: { type: "agent", name: "Alice" }, body_text: "Check your spam folder. I've also triggered a manual reset.", created_datetime: "2026-02-19T13:15:00Z" },
    ],
  },
  {
    id: 1007,
    subject: "Wrong size shipped",
    status: "open",
    channel: "email",
    assignee: null,
    tags: ["returns", "shipping"],
    created_datetime: "2026-02-26T10:05:00Z",
    messages: [
      { id: 2013, sender: { type: "customer", name: "Avery Brooks" }, body_text: "I ordered a Medium but received a Large. I need this exchanged.", created_datetime: "2026-02-26T10:05:00Z" },
    ],
  },
  {
    id: 1008,
    subject: "Cancellation request for order #8510",
    status: "closed",
    channel: "email",
    assignee: "bob@ironside.dev",
    tags: ["cancellation"],
    created_datetime: "2026-02-17T15:40:00Z",
    messages: [
      { id: 2014, sender: { type: "customer", name: "Riley Tanaka" }, body_text: "Please cancel order #8510. I accidentally ordered the wrong item.", created_datetime: "2026-02-17T15:40:00Z" },
      { id: 2015, sender: { type: "agent", name: "Bob" }, body_text: "Done! Order #8510 has been cancelled. Refund in 3-5 business days.", created_datetime: "2026-02-17T15:55:00Z" },
    ],
  },
  {
    id: 1009,
    subject: "Feature request: dark mode",
    status: "closed",
    channel: "chat",
    assignee: "alice@ironside.dev",
    tags: ["feature-request"],
    created_datetime: "2026-02-15T09:00:00Z",
    messages: [
      { id: 2016, sender: { type: "customer", name: "Quinn Orozco" }, body_text: "Any plans for a dark mode option?", created_datetime: "2026-02-15T09:00:00Z" },
      { id: 2017, sender: { type: "agent", name: "Alice" }, body_text: "Great suggestion! I've logged this with our product team.", created_datetime: "2026-02-15T09:12:00Z" },
    ],
  },
  {
    id: 1010,
    subject: "International shipping options",
    status: "open",
    channel: "chat",
    assignee: null,
    tags: ["shipping", "international"],
    created_datetime: "2026-02-27T07:20:00Z",
    messages: [
      { id: 2018, sender: { type: "customer", name: "Kai Müller" }, body_text: "Do you ship to Germany? I can't find international shipping at checkout.", created_datetime: "2026-02-27T07:20:00Z" },
    ],
  },
];

export function getMockTickets(): GorgiasTicket[] {
  return MOCK_TICKETS;
}

export function getMockTicket(id: number): GorgiasTicket | undefined {
  return MOCK_TICKETS.find((t) => t.id === id);
}

export interface MockSearchFilters {
  status?: "open" | "closed";
  search?: string;
  limit?: number;
}

export function searchMockTickets(filters: MockSearchFilters = {}): GorgiasTicket[] {
  let results = [...MOCK_TICKETS];

  if (filters.status) {
    results = results.filter((t) => t.status === filters.status);
  }

  if (filters.search) {
    const term = filters.search.toLowerCase();
    results = results.filter(
      (t) =>
        t.subject.toLowerCase().includes(term) ||
        t.tags.some((tag) => tag.toLowerCase().includes(term)) ||
        t.messages.some((m) => m.body_text.toLowerCase().includes(term))
    );
  }

  if (filters.limit && filters.limit > 0) {
    results = results.slice(0, filters.limit);
  }

  return results;
}

// --- Mock write operations (SW2) ---
// These log what WOULD happen and mutate in-memory data for consistency.

let nextTicketId = 1100;
let nextMessageId = 3000;

function findTicketOrThrow(id: number): GorgiasTicket {
  const ticket = MOCK_TICKETS.find((t) => t.id === id);
  if (!ticket) throw new Error(`Mock ticket ${id} not found`);
  return ticket;
}

export function mockCreateTicket(data: { customer_email: string; subject: string; message: string }): object {
  const id = nextTicketId++;
  const ticket: GorgiasTicket = {
    id,
    subject: data.subject,
    status: "open",
    channel: "email",
    assignee: null,
    tags: [],
    created_datetime: new Date().toISOString(),
    messages: [
      { id: nextMessageId++, sender: { type: "customer", name: data.customer_email }, body_text: data.message, created_datetime: new Date().toISOString() },
    ],
  };
  MOCK_TICKETS.push(ticket);
  console.log(`[MOCK] Created ticket #${id}: "${data.subject}"`);
  return { id, status: "created", ticket };
}

export function mockAssignTicket(ticketId: number, assigneeEmail: string): object {
  const ticket = findTicketOrThrow(ticketId);
  const previous = ticket.assignee;
  ticket.assignee = assigneeEmail;
  console.log(`[MOCK] Assigned ticket #${ticketId} to ${assigneeEmail} (was: ${previous ?? "unassigned"})`);
  return { id: ticketId, assignee: assigneeEmail, status: "updated" };
}

export function mockSetPriority(ticketId: number, priority: string): object {
  findTicketOrThrow(ticketId);
  console.log(`[MOCK] Set priority on ticket #${ticketId} to "${priority}"`);
  return { id: ticketId, priority, status: "updated" };
}

export function mockSetStatus(ticketId: number, status: "open" | "closed"): object {
  const ticket = findTicketOrThrow(ticketId);
  const previous = ticket.status;
  ticket.status = status;
  console.log(`[MOCK] Set status on ticket #${ticketId} to "${status}" (was: "${previous}")`);
  return { id: ticketId, status, previous_status: previous };
}

export function mockUpdateTags(ticketId: number, tags: string[]): object {
  const ticket = findTicketOrThrow(ticketId);
  const previous = ticket.tags;
  ticket.tags = tags;
  console.log(`[MOCK] Updated tags on ticket #${ticketId}: [${tags.join(", ")}] (was: [${previous.join(", ")}])`);
  return { id: ticketId, tags, previous_tags: previous };
}

export function mockReplyPublic(ticketId: number, body: string): object {
  const ticket = findTicketOrThrow(ticketId);
  const msg: GorgiasMessage = { id: nextMessageId++, sender: { type: "agent", name: "AI Agent" }, body_text: body, created_datetime: new Date().toISOString() };
  ticket.messages.push(msg);
  console.log(`[MOCK] Public reply on ticket #${ticketId}: "${body.slice(0, 80)}..."`);
  return { id: msg.id, ticket_id: ticketId, type: "public_reply", status: "sent" };
}

export function mockCommentInternal(ticketId: number, body: string): object {
  const ticket = findTicketOrThrow(ticketId);
  const msg: GorgiasMessage = { id: nextMessageId++, sender: { type: "agent", name: "AI Agent (internal)" }, body_text: body, created_datetime: new Date().toISOString() };
  ticket.messages.push(msg);
  console.log(`[MOCK] Internal note on ticket #${ticketId}: "${body.slice(0, 80)}..."`);
  return { id: msg.id, ticket_id: ticketId, type: "internal_note", status: "sent" };
}
