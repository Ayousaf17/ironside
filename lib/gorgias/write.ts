// Placeholder for Gorgias write operations (create, assign, reply, close tickets).
// Only used in production — never in dev.

export async function createTicketReply(_ticketId: number, _body: string): Promise<void> {
  throw new Error("Gorgias write operations not yet implemented");
}

export async function closeTicket(_ticketId: number): Promise<void> {
  throw new Error("Gorgias write operations not yet implemented");
}
