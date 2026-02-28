// Single entry point for all Gorgias data access.
// GORGIAS_MOCK=true (default) → mock data, safe for dev
// GORGIAS_MOCK=false → real Gorgias API, production only

import type { GorgiasTicket, GorgiasMacro } from "./mock";
import { getMockTickets, getMockTicket, searchMockTickets } from "./mock";
import { getMockMacros, getMockMacro, searchMockMacros } from "./mock";
import { mockCreateTicket, mockAssignTicket, mockSetPriority, mockSetStatus, mockUpdateTags, mockReplyPublic, mockCommentInternal } from "./mock";
import type { MockSearchFilters } from "./mock";
import { fetchTickets, fetchTicket, searchTickets as fetchSearchTickets, fetchMacros, fetchMacro } from "./read";
import * as write from "./write";

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

// --- Write operations (SW2) ---

export async function createTicket(data: { customer_email: string; subject: string; message: string }): Promise<object> {
  if (useMock()) return mockCreateTicket(data);
  return write.createTicket(data);
}

export async function assignTicket(ticketId: number, assigneeEmail: string): Promise<object> {
  if (useMock()) return mockAssignTicket(ticketId, assigneeEmail);
  return write.assignTicket(ticketId, assigneeEmail);
}

export async function setPriority(ticketId: number, priority: string): Promise<object> {
  if (useMock()) return mockSetPriority(ticketId, priority);
  return write.setPriority(ticketId, priority);
}

export async function setStatus(ticketId: number, status: "open" | "closed"): Promise<object> {
  if (useMock()) return mockSetStatus(ticketId, status);
  return write.setStatus(ticketId, status);
}

export async function updateTags(ticketId: number, tags: string[]): Promise<object> {
  if (useMock()) return mockUpdateTags(ticketId, tags);
  return write.updateTags(ticketId, tags);
}

export async function replyPublic(ticketId: number, body: string): Promise<object> {
  if (useMock()) return mockReplyPublic(ticketId, body);
  return write.replyPublic(ticketId, body);
}

export async function commentInternal(ticketId: number, body: string): Promise<object> {
  if (useMock()) return mockCommentInternal(ticketId, body);
  return write.commentInternal(ticketId, body);
}

// --- Macros ---

export async function getMacros(): Promise<GorgiasMacro[]> {
  if (useMock()) return getMockMacros();
  return fetchMacros();
}

export async function getMacro(id: number): Promise<GorgiasMacro | undefined> {
  if (useMock()) return getMockMacro(id);
  return fetchMacro(id);
}

export async function searchMacros(search?: string): Promise<GorgiasMacro[]> {
  if (useMock()) return searchMockMacros(search);
  // Real API: fetch all and filter client-side (Gorgias macros API has no search param)
  const all = await fetchMacros();
  if (!search) return all;
  const term = search.toLowerCase();
  return all.filter(m => m.name.toLowerCase().includes(term) || m.tags.some(t => t.toLowerCase().includes(term)));
}
