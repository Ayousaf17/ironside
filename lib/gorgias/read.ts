// Fetches tickets from the real Gorgias API (only used in production).

import type { GorgiasTicket } from "./mock";

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

export async function fetchTickets(): Promise<GorgiasTicket[]> {
  const res = await fetch(`${getBaseUrl()}/api/tickets`, { headers: getAuthHeaders() });
  if (!res.ok) throw new Error(`Gorgias API error: ${res.status} ${res.statusText}`);
  const data = await res.json();
  return data.data as GorgiasTicket[];
}

export async function fetchTicket(id: number): Promise<GorgiasTicket | undefined> {
  const res = await fetch(`${getBaseUrl()}/api/tickets/${id}`, { headers: getAuthHeaders() });
  if (res.status === 404) return undefined;
  if (!res.ok) throw new Error(`Gorgias API error: ${res.status} ${res.statusText}`);
  return (await res.json()) as GorgiasTicket;
}
