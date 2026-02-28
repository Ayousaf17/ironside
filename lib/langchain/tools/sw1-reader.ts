// LangChain DynamicTool wrapping the SW1 ticket reader workflow.
// n8n equivalent: SW1 sub-workflow (gorgias_tickets_read + gorgias_get_ticket_by_id)

import { DynamicTool } from "@langchain/core/tools";
import { getTicket, searchTickets } from "@/lib/gorgias/client";

export const sw1ReaderTool = new DynamicTool({
  name: "sw1_ticket_reader",
  description:
    "Search, filter, or look up Gorgias support tickets. " +
    "Input must be a JSON string with optional fields: " +
    'ticket_id (number) to get a specific ticket, ' +
    'search (string) to search by subject/tags/message text, ' +
    'status ("open" or "closed") to filter by status, ' +
    "limit (number) to cap results. " +
    'Examples: {"ticket_id": 1001}, {"status": "open", "limit": 5}, {"search": "shipping"}',
  func: async (input: string) => {
    try {
      const params = JSON.parse(input);

      // Single ticket lookup
      if (params.ticket_id) {
        const ticket = await getTicket(Number(params.ticket_id));
        if (!ticket) return JSON.stringify({ error: `Ticket ${params.ticket_id} not found` });
        return JSON.stringify(ticket, null, 2);
      }

      // Search/filter multiple tickets
      const tickets = await searchTickets({
        status: params.status,
        search: params.search,
        limit: params.limit,
      });

      return JSON.stringify(
        { count: tickets.length, tickets },
        null,
        2
      );
    } catch (err) {
      return JSON.stringify({ error: `Failed to read tickets: ${err}` });
    }
  },
});
