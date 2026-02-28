// Real Gorgias write operations — only called when GORGIAS_MOCK=false.
// n8n equivalent: SW2 sub-workflow (7 Gorgias HTTP request nodes).

function getAuthHeaders(): HeadersInit {
  const email = process.env.GORGIAS_EMAIL;
  const apiKey = process.env.GORGIAS_API_KEY;
  if (!email || !apiKey) {
    throw new Error("Missing GORGIAS_EMAIL or GORGIAS_API_KEY environment variables");
  }
  const encoded = Buffer.from(`${email}:${apiKey}`).toString("base64");
  return { Authorization: `Basic ${encoded}`, "Content-Type": "application/json" };
}

function getBaseUrl(): string {
  const baseUrl = process.env.GORGIAS_BASE_URL;
  if (!baseUrl) throw new Error("Missing GORGIAS_BASE_URL environment variable");
  return baseUrl.replace(/\/$/, "");
}

// 1. Create a new ticket
export async function createTicket(data: {
  customer_email: string;
  subject: string;
  message: string;
}): Promise<object> {
  const res = await fetch(`${getBaseUrl()}/api/tickets`, {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify({
      customer: { email: data.customer_email },
      subject: data.subject,
      messages: [{ channel: "email", via: "api", from_agent: false, body_text: data.message }],
    }),
  });
  if (!res.ok) throw new Error(`Gorgias API error: ${res.status} ${res.statusText}`);
  return res.json();
}

// 2. Assign ticket to a user
export async function assignTicket(ticketId: number, assigneeEmail: string): Promise<object> {
  const res = await fetch(`${getBaseUrl()}/api/tickets/${ticketId}`, {
    method: "PUT",
    headers: getAuthHeaders(),
    body: JSON.stringify({ assignee_user: { email: assigneeEmail } }),
  });
  if (!res.ok) throw new Error(`Gorgias API error: ${res.status} ${res.statusText}`);
  return res.json();
}

// 3. Set ticket priority
export async function setPriority(ticketId: number, priority: string): Promise<object> {
  const res = await fetch(`${getBaseUrl()}/api/tickets/${ticketId}`, {
    method: "PUT",
    headers: getAuthHeaders(),
    body: JSON.stringify({ priority }),
  });
  if (!res.ok) throw new Error(`Gorgias API error: ${res.status} ${res.statusText}`);
  return res.json();
}

// 4. Set ticket status (open/closed)
export async function setStatus(ticketId: number, status: "open" | "closed"): Promise<object> {
  const res = await fetch(`${getBaseUrl()}/api/tickets/${ticketId}`, {
    method: "PUT",
    headers: getAuthHeaders(),
    body: JSON.stringify({ status }),
  });
  if (!res.ok) throw new Error(`Gorgias API error: ${res.status} ${res.statusText}`);
  return res.json();
}

// 5. Update ticket tags
export async function updateTags(ticketId: number, tags: string[]): Promise<object> {
  const res = await fetch(`${getBaseUrl()}/api/tickets/${ticketId}`, {
    method: "PUT",
    headers: getAuthHeaders(),
    body: JSON.stringify({ tags: tags.map((name) => ({ name })) }),
  });
  if (!res.ok) throw new Error(`Gorgias API error: ${res.status} ${res.statusText}`);
  return res.json();
}

// 6. Reply to ticket (customer-visible)
export async function replyPublic(ticketId: number, body: string): Promise<object> {
  const res = await fetch(`${getBaseUrl()}/api/tickets/${ticketId}/messages`, {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify({
      channel: "email",
      via: "api",
      from_agent: true,
      body_text: body,
    }),
  });
  if (!res.ok) throw new Error(`Gorgias API error: ${res.status} ${res.statusText}`);
  return res.json();
}

// 7. Add internal comment (not visible to customer)
export async function commentInternal(ticketId: number, body: string): Promise<object> {
  const res = await fetch(`${getBaseUrl()}/api/tickets/${ticketId}/messages`, {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify({
      channel: "internal-note",
      via: "api",
      from_agent: true,
      body_text: body,
      source: { type: "internal-note" },
    }),
  });
  if (!res.ok) throw new Error(`Gorgias API error: ${res.status} ${res.statusText}`);
  return res.json();
}
