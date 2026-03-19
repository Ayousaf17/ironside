// Fetches tickets and macros from the real Gorgias API (only used in production).

import type { GorgiasTicket, GorgiasMacro } from "./mock";

/**
 * Normalizes a raw Gorgias API ticket response to match the GorgiasTicket interface.
 *
 * The real Gorgias REST API returns:
 *   - tags as { id: number, name: string }[] instead of string[]
 *   - assignee_user as { id, email, name? } | null instead of assignee: string | null
 *
 * This function handles both raw API shapes and already-normalized data.
 */
function normalizeTicket(raw: Record<string, unknown>): GorgiasTicket {
  // Normalize tags: could be string[] or { id, name }[]
  const rawTags = (raw.tags ?? []) as unknown[];
  const tags = rawTags
    .map((t) =>
      typeof t === "string"
        ? t
        : ((t as Record<string, unknown>)?.name as string) ?? ""
    )
    .filter(Boolean);

  // Normalize assignee: could be string, object with email, or null
  const rawAssignee = raw.assignee_user ?? raw.assignee;
  let assignee: string | null = null;
  if (typeof rawAssignee === "string") {
    assignee = rawAssignee;
  } else if (rawAssignee && typeof rawAssignee === "object") {
    assignee =
      ((rawAssignee as Record<string, unknown>).email as string) ?? null;
  }

  return {
    id: raw.id as number,
    subject: (raw.subject as string) ?? "",
    status: (raw.status as "open" | "closed") ?? "open",
    channel: (raw.channel as "email" | "chat") ?? "email",
    assignee,
    tags,
    created_datetime: (raw.created_datetime as string) ?? "",
    messages: (raw.messages ?? []) as GorgiasTicket["messages"],
  };
}

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

async function fetchAllPages(startUrl: string, headers: HeadersInit): Promise<GorgiasTicket[]> {
  const all: GorgiasTicket[] = [];
  let cursor: string | null = null;
  const baseUrl: string = startUrl.split("?")[0];
  const initialParams: string = startUrl.includes("?") ? startUrl.slice(startUrl.indexOf("?") + 1) : "";
  let isFirst = true;

  while (true) {
    let fetchUrl: string;
    if (isFirst) {
      fetchUrl = startUrl;
      isFirst = false;
    } else if (cursor) {
      const params = new URLSearchParams(initialParams);
      params.set("cursor", cursor);
      fetchUrl = `${baseUrl}?${params.toString()}`;
    } else {
      break;
    }

    let pageRes: Response | null = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      pageRes = await fetch(fetchUrl, { headers });
      if (pageRes.status === 429) {
        const wait = Math.pow(2, attempt + 1) * 1000; // 2s, 4s, 8s
        console.log(`[gorgias] 429 rate limited, retrying in ${wait}ms (attempt ${attempt + 1}/3)`);
        await new Promise((r) => setTimeout(r, wait));
        continue;
      }
      break;
    }
    if (!pageRes || !pageRes.ok) throw new Error(`Gorgias API error: ${pageRes?.status} ${pageRes?.statusText}`);
    const pageData = await pageRes.json() as { data: Record<string, unknown>[]; meta?: { next_cursor?: string } };
    all.push(...pageData.data.map((t) => normalizeTicket(t)));
    cursor = pageData.meta?.next_cursor ?? null;
    if (!cursor) break;
  }
  return all;
}

export async function fetchTickets(options: { updatedAfter?: Date } = {}): Promise<GorgiasTicket[]> {
  const url = `${getBaseUrl()}/api/tickets?limit=30`;
  console.log(`[gorgias] fetchTickets url=${url}`);
  const tickets = await fetchAllPages(url, getAuthHeaders());
  // Client-side date filter (Gorgias list API may not support date params)
  if (options.updatedAfter) {
    const cutoff = options.updatedAfter.getTime();
    return tickets.filter((t) => new Date(t.created_datetime).getTime() >= cutoff);
  }
  return tickets;
}

export async function fetchTicket(id: number): Promise<GorgiasTicket | undefined> {
  const res = await fetch(`${getBaseUrl()}/api/tickets/${id}`, { headers: getAuthHeaders() });
  if (res.status === 404) return undefined;
  if (!res.ok) throw new Error(`Gorgias API error: ${res.status} ${res.statusText}`);
  const raw = (await res.json()) as Record<string, unknown>;
  return normalizeTicket(raw);
}

export async function searchTickets(filters: TicketSearchFilters = {}): Promise<GorgiasTicket[]> {
  const params = new URLSearchParams();
  if (filters.limit) params.set("limit", String(filters.limit));
  if (filters.order_by) params.set("order_by", filters.order_by);
  if (filters.cursor) params.set("cursor", filters.cursor);
  if (filters.status) params.set("status", filters.status);

  const query = params.toString();
  const url = `${getBaseUrl()}/api/tickets${query ? `?${query}` : ""}`;
  let tickets = await fetchAllPages(url, getAuthHeaders());

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
}

export async function fetchEvents(options: FetchEventsOptions = {}): Promise<{ data: GorgiasEvent[]; meta: { next_cursor?: string } }> {
  const params = new URLSearchParams();
  if (options.limit) params.set("limit", String(options.limit));
  if (options.cursor) params.set("cursor", options.cursor);
  // Gorgias Events API requires separate params per type (not comma-separated)
  if (options.types?.length) {
    for (const type of options.types) {
      params.append("types", type);
    }
  }
  // Note: Gorgias Events API has no date filter — filtering is done client-side via cursor pagination

  const query = params.toString();
  const url = `${getBaseUrl()}/api/events${query ? `?${query}` : ""}`;
  const res = await fetch(url, { headers: getAuthHeaders() });
  if (!res.ok) throw new Error(`Gorgias Events API error: ${res.status} ${res.statusText}`);
  return res.json();
}
