// LangChain DynamicTool wrapping the SW2 ticket writer workflow.
// n8n equivalent: SW2 sub-workflow (Detect All Operations → Route Operations → 7 Gorgias API calls)
//
// SAFETY: When GORGIAS_MOCK=true (default), all operations are mocked.
// Mock mode logs what WOULD happen and returns fake success responses.

import { DynamicTool } from "@langchain/core/tools";
import {
  createTicket,
  assignTicket,
  setPriority,
  setStatus,
  updateTags,
  replyPublic,
  commentInternal,
} from "@/lib/gorgias/client";

export const sw2WriterTool = new DynamicTool({
  name: "sw2_ticket_writer",
  description:
    "Execute write operations on Gorgias tickets. " +
    "Input must be a JSON string with: operation (string), ticket_id (number, required for all except create_ticket), and data (object). " +
    "Operations: " +
    'create_ticket (data: {customer_email, subject, message}), ' +
    'assign_ticket (data: {assignee_email}), ' +
    'set_priority (data: {priority}), ' +
    'set_status (data: {status: "open"|"closed"}), ' +
    "update_tags (data: {tags: string[]}), " +
    "reply_public (data: {body}), " +
    "comment_internal (data: {body}). " +
    'Example: {"operation": "assign_ticket", "ticket_id": 1001, "data": {"assignee_email": "alice@ironside.dev"}}',
  func: async (input: string) => {
    try {
      const { operation, ticket_id, data } = JSON.parse(input);

      switch (operation) {
        case "create_ticket": {
          if (!data?.customer_email || !data?.subject || !data?.message) {
            return JSON.stringify({ error: "create_ticket requires data.customer_email, data.subject, and data.message" });
          }
          const result = await createTicket(data);
          return JSON.stringify(result, null, 2);
        }

        case "assign_ticket": {
          if (!ticket_id || !data?.assignee_email) {
            return JSON.stringify({ error: "assign_ticket requires ticket_id and data.assignee_email" });
          }
          const result = await assignTicket(ticket_id, data.assignee_email);
          return JSON.stringify(result, null, 2);
        }

        case "set_priority": {
          if (!ticket_id || !data?.priority) {
            return JSON.stringify({ error: "set_priority requires ticket_id and data.priority" });
          }
          const result = await setPriority(ticket_id, data.priority);
          return JSON.stringify(result, null, 2);
        }

        case "set_status": {
          if (!ticket_id || !data?.status) {
            return JSON.stringify({ error: "set_status requires ticket_id and data.status ('open' or 'closed')" });
          }
          const result = await setStatus(ticket_id, data.status);
          return JSON.stringify(result, null, 2);
        }

        case "update_tags": {
          if (!ticket_id || !Array.isArray(data?.tags)) {
            return JSON.stringify({ error: "update_tags requires ticket_id and data.tags (string array)" });
          }
          const result = await updateTags(ticket_id, data.tags);
          return JSON.stringify(result, null, 2);
        }

        case "reply_public": {
          if (!ticket_id || !data?.body) {
            return JSON.stringify({ error: "reply_public requires ticket_id and data.body" });
          }
          const result = await replyPublic(ticket_id, data.body);
          return JSON.stringify(result, null, 2);
        }

        case "comment_internal": {
          if (!ticket_id || !data?.body) {
            return JSON.stringify({ error: "comment_internal requires ticket_id and data.body" });
          }
          const result = await commentInternal(ticket_id, data.body);
          return JSON.stringify(result, null, 2);
        }

        default:
          return JSON.stringify({
            error: `Unknown operation: ${operation}`,
            valid_operations: [
              "create_ticket", "assign_ticket", "set_priority",
              "set_status", "update_tags", "reply_public", "comment_internal",
            ],
          });
      }
    } catch (err) {
      return JSON.stringify({ error: `Failed to execute write operation: ${err}` });
    }
  },
});
