// Fetches tickets and macros from the real Gorgias API (only used in production).

import type { GorgiasTicket, GorgiasMacro } from "./mock";

export interface TicketSearchFilters {
  limit?: number;
  order_by?: string;
  cursor?: string;
  status?: "open" | "closed";
  search?: string;
}

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

export async function searchTickets(filters: TicketSearchFilters = {}): Promise<GorgiasTicket[]> {
  const params = new URLSearchParams();
  if (filters.limit) params.set("limit", String(filters.limit));
  if (filters.order_by) params.set("order_by", filters.order_by);
  if (filters.cursor) params.set("cursor", filters.cursor);
  if (filters.status) params.set("status", filters.status);

  const query = params.toString();
  const url = `${getBaseUrl()}/api/tickets${query ? `?${query}` : ""}`;
  const res = await fetch(url, { headers: getAuthHeaders() });
  if (!res.ok) throw new Error(`Gorgias API error: ${res.status} ${res.statusText}`);
  const data = await res.json();
  let tickets = data.data as GorgiasTicket[];

  // Client-side text search (Gorgias list API doesn't have a text search param)
  if (filters.search) {
    const term = filters.search.toLowerCase();
    tickets = tickets.filter(
      (t) =>
        t.subject.toLowerCase().includes(term) ||
        t.tags.some((tag) => tag.toLowerCase().includes(term))
    );
  }

  return tickets;
}

// --- Macros API ---

export async function fetchMacros(): Promise<GorgiasMacro[]> {
  const res = await fetch(`${getBaseUrl()}/api/macros`, { headers: getAuthHeaders() });
  if (!res.ok) throw new Error(`Gorgias API error: ${res.status} ${res.statusText}`);
  const data = await res.json();
  return data.data as GorgiasMacro[];
}

export async function fetchMacro(id: number): Promise<GorgiasMacro | undefined> {
  const res = await fetch(`${getBaseUrl()}/api/macros/${id}`, { headers: getAuthHeaders() });
  if (res.status === 404) return undefined;
  if (!res.ok) throw new Error(`Gorgias API error: ${res.status} ${res.statusText}`);
  return (await res.json()) as GorgiasMacro;
}

// --- Events API (for historical backfill) ---

export interface GorgiasEvent {
  id: string;
  type: string;
  object_id: number;
  object_type: string;
  changes?: Record<string, { from: unknown; to: unknown }>;
  user?: { email: string; first_name?: string };
  created_datetime: string;
  meta?: Record<string, unknown>;
}

export interface FetchEventsOptions {
  cursor?: string;
  limit?: number;
  types?: string[];       // e.g. ["ticket-updated", "ticket-message-created"]
  created_before?: string; // ISO date
  created_after?: string;  // ISO date
}

export async function fetchEvents(options: FetchEventsOptions = {}): Promise<{ data: GorgiasEvent[]; meta: { next_cursor?: string } }> {
  const params = new URLSearchParams();
  if (options.limit) params.set("per_page", String(options.limit));
  if (options.cursor) params.set("cursor", options.cursor);
  if (options.types?.length) params.set("types", options.types.join(","));
  if (options.created_before) params.set("created_before", options.created_before);
  if (options.created_after) params.set("created_after", options.created_after);

  const query = params.toString();
  const url = `${getBaseUrl()}/api/events${query ? `?${query}` : ""}`;
  const res = await fetch(url, { headers: getAuthHeaders() });
  if (!res.ok) throw new Error(`Gorgias Events API error: ${res.status} ${res.statusText}`);
  return res.json();
}
