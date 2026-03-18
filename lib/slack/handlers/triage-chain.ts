// Triage chain handlers — called from the Slack interactivity route via after().
// Flow: show_unassigned_tickets → auto_assign_triage (or cancel_triage)
//
// Uses the same routing table as SW4 (dashboard_config.agent_routing) so the
// assignment logic stays consistent with the AI agent.

import { getTickets } from "@/lib/gorgias/client";
import { assignTicket } from "@/lib/gorgias/client";
import { sendSlackBlocks, callResponseUrl } from "@/lib/slack/client";
import { formatTriageChainBlocks } from "@/lib/slack/formatters";
import { getAgentRouting } from "@/lib/services/agent-routing.service";
import { createBehaviorLog } from "@/lib/repos/agent-behavior-log.repo";
import { withRetry } from "@/lib/services/retry.service";

// Maps Gorgias ticket tags (uppercase, hyphenated) to routing category keys
const TAG_TO_CATEGORY: Record<string, string> = {
  "ORDER-STATUS":         "track_order",
  "ORDER-VERIFICATION":   "order_verification",
  "PRODUCT":              "product_question",
  "RETURN/EXCHANGE":      "return_exchange",
  "ORDER-CHANGE/CANCEL":  "order_change_cancel",
  "CONTACT-FORM":         "contact_form",
  "REPORT-ISSUE":         "report_issue",
};

export interface TriageTicket {
  id: number;
  subject: string;
  tags: string[];
  created_datetime: string;
  suggestedEmail: string | null;
}

function inferAgentEmail(
  tags: string[],
  routing: Record<string, string>
): string | null {
  for (const tag of tags) {
    const category = TAG_TO_CATEGORY[tag.toUpperCase()];
    if (category && routing[category]) return routing[category];
  }
  return null;
}

function agentName(email: string): string {
  return email.split("@")[0]
    .split(/[-.]/)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(" ");
}

async function fetchUnassignedTickets(): Promise<TriageTicket[]> {
  const now = new Date();
  const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const tickets = await getTickets({ updatedAfter: twentyFourHoursAgo });
  const routing = await getAgentRouting();

  return tickets
    .filter(
      (t) =>
        t.status === "open" &&
        t.assignee === null &&
        !t.tags.some((tag) =>
          ["auto-close", "non-support-related"].includes(tag.toLowerCase())
        )
    )
    .map((t) => ({
      id: t.id,
      subject: t.subject,
      tags: t.tags,
      created_datetime: t.created_datetime,
      suggestedEmail: inferAgentEmail(t.tags, routing),
    }));
}

function lockedBlock(text: string): object[] {
  return [{ type: "section", text: { type: "mrkdwn", text } }];
}

export async function handleShowUnassignedTickets({
  responseUrl,
  slackUserId,
  channel,
  categoryFilter,
}: {
  responseUrl: string;
  slackUserId: string;
  channel: string;
  categoryFilter?: string;
}): Promise<void> {
  // 1. Lock the pulse check message immediately
  await callResponseUrl(responseUrl, {
    text: `🔒 <@${slackUserId}> is triaging unassigned tickets...`,
    blocks: lockedBlock(
      `🔒 *<@${slackUserId}> is triaging the unassigned queue...*\nTriage chain will appear below shortly.`
    ),
    replace_original: true,
  });

  // 2. Fetch unassigned non-spam tickets, optionally filtered by category
  const allTickets = await fetchUnassignedTickets();
  const tickets = categoryFilter
    ? allTickets.filter((t) =>
        t.tags.some((tag) => TAG_TO_CATEGORY[tag.toUpperCase()] === categoryFilter)
      )
    : allTickets;

  if (tickets.length === 0) {
    const msg = categoryFilter
      ? `✅ No unassigned *${categoryFilter.replace(/_/g, " ")}* tickets — that category is fully covered!`
      : "✅ *No unassigned tickets* — every open ticket already has an owner!";
    await sendSlackBlocks("✅ No unassigned tickets", lockedBlock(msg), channel);
    return;
  }

  // 3. Group by category (not agent) so the triage chain teaches context
  const grouped = new Map<string, TriageTicket[]>();
  const unclassified: TriageTicket[] = [];

  for (const ticket of tickets) {
    let category: string | null = null;
    for (const tag of ticket.tags) {
      const cat = TAG_TO_CATEGORY[tag.toUpperCase()];
      if (cat) { category = cat; break; }
    }
    if (category) {
      if (!grouped.has(category)) grouped.set(category, []);
      grouped.get(category)!.push(ticket);
    } else {
      unclassified.push(ticket);
    }
  }

  const assignableCount = tickets.filter((t) => t.suggestedEmail !== null).length;

  // 4. Post the triage chain
  const blocks = formatTriageChainBlocks({
    grouped,
    unclassified,
    reviewerSlackId: slackUserId,
    assignableCount,
    totalCount: tickets.length,
    categoryFilter,
  });

  await sendSlackBlocks(
    `📋 Triage Queue — ${tickets.length} unassigned tickets`,
    blocks,
    channel
  );
}

export async function handleAutoAssignTriage({
  responseUrl,
  slackUserId,
}: {
  responseUrl: string;
  slackUserId: string;
}): Promise<void> {
  // 1. Lock the triage chain message immediately
  await callResponseUrl(responseUrl, {
    text: `⏳ <@${slackUserId}> is auto-assigning tickets...`,
    blocks: lockedBlock(
      `⏳ *<@${slackUserId}> is auto-assigning tickets...* Please wait.`
    ),
    replace_original: true,
  });

  // 2. Re-fetch and re-route (always use current state, not stale)
  const tickets = await fetchUnassignedTickets();
  const routing = await getAgentRouting();

  if (tickets.length === 0) {
    await callResponseUrl(responseUrl, {
      text: "✅ No unassigned tickets — queue was already covered.",
      blocks: lockedBlock(
        "✅ *No unassigned tickets found* — queue was already fully covered."
      ),
      replace_original: true,
    });
    return;
  }

  // 3. Assign each ticket
  let assignedCount = 0;
  const skipped: number[] = [];
  const errors: number[] = [];
  const byAgent = new Map<string, number>();

  for (const ticket of tickets) {
    const agentEmail = inferAgentEmail(ticket.tags, routing);
    if (!agentEmail) {
      skipped.push(ticket.id);
      continue;
    }

    try {
      await withRetry(() => assignTicket(ticket.id, agentEmail));
      assignedCount++;
      byAgent.set(agentEmail, (byAgent.get(agentEmail) ?? 0) + 1);

      createBehaviorLog({
        agent: `slack:${slackUserId}`,
        action: "assign_ticket",
        ticketId: ticket.id,
        ticketSubject: ticket.subject,
        ticketTags: ticket.tags,
        tagsApplied: [],
        reopened: false,
        rawEvent: {
          source: "slack_interactivity",
          action: "auto_assign_triage",
          slackUserId,
          assignedTo: agentEmail,
        },
        occurredAt: new Date(),
      }).catch((err) =>
        console.error(`[triage-chain] Log failed for #${ticket.id}:`, err)
      );
    } catch (err) {
      console.error(`[triage-chain] Failed to assign #${ticket.id}:`, err);
      errors.push(ticket.id);
    }
  }

  // 4. Build result summary
  const timestamp = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });

  const agentLines = [...byAgent.entries()]
    .map(([email, count]) => `  • ${agentName(email)}: ${count} ticket${count !== 1 ? "s" : ""}`)
    .join("\n");

  const skipNote =
    skipped.length > 0
      ? `\n_⚠️ ${skipped.length} ticket${skipped.length !== 1 ? "s" : ""} couldn't be auto-classified — assign manually in Gorgias: ${skipped.map((id) => `#${id}`).join(", ")}_`
      : "";

  const errorNote =
    errors.length > 0
      ? `\n_🚨 ${errors.length} assignment${errors.length !== 1 ? "s" : ""} failed: ${errors.map((id) => `#${id}`).join(", ")}_`
      : "";

  const bodyText =
    `✅ *Assigned ${assignedCount} of ${tickets.length} ticket${tickets.length !== 1 ? "s" : ""}*\n` +
    (agentLines ? `${agentLines}\n` : "") +
    `Actioned by <@${slackUserId}> at ${timestamp}` +
    skipNote +
    errorNote;

  await callResponseUrl(responseUrl, {
    text: `✅ Assigned ${assignedCount} tickets`,
    blocks: [{ type: "section", text: { type: "mrkdwn", text: bodyText } }],
    replace_original: true,
  });
}

export async function handleCancelTriage({
  responseUrl,
  slackUserId,
}: {
  responseUrl: string;
  slackUserId: string;
}): Promise<void> {
  await callResponseUrl(responseUrl, {
    text: `❌ Triage cancelled by <@${slackUserId}>`,
    blocks: lockedBlock(`❌ *Triage cancelled* by <@${slackUserId}>`),
    replace_original: true,
  });
}
