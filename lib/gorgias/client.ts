// Single entry point for all Gorgias data access.
// GORGIAS_MOCK=true (default) → mock data, safe for dev
// GORGIAS_MOCK=false → real Gorgias API, production only

import type { GorgiasTicket } from "./mock";
import { getMockTickets, getMockTicket, searchMockTickets } from "./mock";
import type { MockSearchFilters } from "./mock";
import { fetchTickets, fetchTicket, searchTickets as fetchSearchTickets } from "./read";

function useMock(): boolean {
  return process.env.GORGIAS_MOCK !== "false";
}

export async function getTickets(): Promise<GorgiasTicket[]> {
  if (useMock()) return getMockTickets();
  return fetchTickets();
}

export async function getTicket(id: number): Promise<GorgiasTicket | undefined> {
  if (useMock()) return getMockTicket(id);
  return fetchTicket(id);
}

export async function searchTickets(filters: MockSearchFilters = {}): Promise<GorgiasTicket[]> {
  if (useMock()) return searchMockTickets(filters);
  return fetchSearchTickets(filters);
}
