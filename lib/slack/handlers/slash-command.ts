// /ironside slash command handler
//
// Supported commands:
//   /ironside stats          — latest pulse check summary
//   /ironside ticket <id>    — look up a Gorgias ticket
//   /ironside pulse          — trigger a manual pulse check
//   /ironside help           — list commands

import { getTicket, searchTickets } from "@/lib/gorgias/client";
import { prisma } from "@/lib/prisma";

export interface SlashResult {
  text: string;
  blocks?: object[];
  response_type?: "in_channel" | "ephemeral";
}

export async function handleSlashCommand(text: string): Promise<SlashResult> {
  const [command, ...args] = text.trim().toLowerCase().split(/\s+/);

  switch (command) {
    case "stats":
      return handleStats();
    case "ticket":
      return handleTicket(args[0]);
    case "search":
      return handleSearch(args.join(" "));
    case "pulse":
      return handlePulse();
    default:
      return handleHelp(command);
  }
}

// --- stats ---

async function handleStats(): Promise<SlashResult> {
  const latest = await prisma.pulseCheck.findFirst({
    orderBy: { createdAt: "desc" },
    select: {
      ticketCount: true,
      openTickets: true,
      closedTickets: true,
      resolutionP90Min: true,
      unassignedPct: true,
      topCategory: true,
      createdAt: true,
    },
  });

  if (!latest) {
    return { text: "No pulse check data yet. Run `/ironside pulse` to trigger one." };
  }

  const date = new Date(latest.createdAt).toLocaleDateString("en-US", {
    month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
  });

  const blocks: object[] = [
    {
      type: "header",
      text: { type: "plain_text", text: "📊 Support Stats", emoji: true },
    },
    {
      type: "section",
      fields: [
        { type: "mrkdwn", text: `*Total Tickets:*\n${latest.ticketCount ?? "—"}` },
        { type: "mrkdwn", text: `*Open / Closed:*\n${latest.openTickets ?? "—"} / ${latest.closedTickets ?? "—"}` },
        { type: "mrkdwn", text: `*P90 Resolution:*\n${latest.resolutionP90Min != null ? `${latest.resolutionP90Min.toFixed(0)} min` : "—"}` },
        { type: "mrkdwn", text: `*Unassigned:*\n${latest.unassignedPct != null ? `${latest.unassignedPct.toFixed(1)}%` : "—"}` },
        { type: "mrkdwn", text: `*Top Category:*\n${latest.topCategory ?? "—"}` },
        { type: "mrkdwn", text: `*Last Updated:*\n${date}` },
      ],
    },
  ];

  return { text: `Support stats as of ${date}`, blocks, response_type: "in_channel" };
}

// --- ticket lookup ---

async function handleTicket(idArg: string | undefined): Promise<SlashResult> {
  const id = parseInt(idArg ?? "", 10);
  if (!idArg || isNaN(id)) {
    return { text: "Usage: `/ironside ticket <id>`  e.g. `/ironside ticket 12345`" };
  }

  const ticket = await getTicket(id);
  if (!ticket) {
    return { text: `Ticket #${id} not found.` };
  }

  const latestMessage = ticket.messages?.[ticket.messages.length - 1];

  const blocks: object[] = [
    {
      type: "header",
      text: { type: "plain_text", text: `🎫 Ticket #${ticket.id}`, emoji: true },
    },
    {
      type: "section",
      fields: [
        { type: "mrkdwn", text: `*Subject:*\n${ticket.subject}` },
        { type: "mrkdwn", text: `*Status:*\n${ticket.status}` },
        { type: "mrkdwn", text: `*Assignee:*\n${ticket.assignee ?? "Unassigned"}` },
        { type: "mrkdwn", text: `*Messages:*\n${ticket.messages?.length ?? 0}` },
      ],
      accessory: {
        type: "button",
        text: { type: "plain_text", text: "Reply →" },
        action_id: "open_reply_modal",
        value: JSON.stringify({ ticketId: id, tags: [], subject: ticket.subject.slice(0, 100) }),
      },
    },
  ];

  if (latestMessage?.body_text) {
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*Latest message:*\n>${latestMessage.body_text.slice(0, 200)}${latestMessage.body_text.length > 200 ? "…" : ""}`,
      },
    });
  }

  return {
    text: `Ticket #${id}: ${ticket.subject}`,
    blocks,
    response_type: "ephemeral",
  };
}

// --- search tickets ---

async function handleSearch(query: string): Promise<SlashResult> {
  if (!query.trim()) {
    return { text: "Usage: `/ironside search <keyword>`  e.g. `/ironside search wifi driver`" };
  }

  const tickets = await searchTickets({ search: query, limit: 100 });
  const results = tickets.slice(0, 10);

  if (results.length === 0) {
    return { text: `No tickets found matching "${query}".` };
  }

  const blocks: object[] = [
    {
      type: "header",
      text: { type: "plain_text", text: `🔍 Search: "${query}"`, emoji: true },
    },
    {
      type: "context",
      elements: [{ type: "mrkdwn", text: `Found ${tickets.length} ticket${tickets.length !== 1 ? "s" : ""}${tickets.length > 10 ? " (showing first 10)" : ""}` }],
    },
    ...results.map((t) => ({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*#${t.id}* — ${t.subject}\n${t.status} · ${t.assignee?.split("@")[0] ?? "unassigned"} · ${t.tags.slice(0, 3).join(", ") || "no tags"}`,
      },
      accessory: {
        type: "button",
        text: { type: "plain_text", text: "Reply →" },
        action_id: "open_reply_modal",
        value: JSON.stringify({ ticketId: t.id, tags: t.tags, subject: t.subject.slice(0, 100) }),
      },
    })),
  ];

  return { text: `Search results for "${query}"`, blocks, response_type: "ephemeral" };
}

// --- manual pulse trigger ---

async function handlePulse(): Promise<SlashResult> {
  const baseUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : process.env.NEXTAUTH_URL ?? "http://localhost:3000";

  const secret = process.env.CRON_SECRET;
  const res = await fetch(`${baseUrl}/api/cron/pulse-check`, {
    method: "GET",
    headers: secret ? { Authorization: `Bearer ${secret}` } : {},
  });

  if (!res.ok) {
    return { text: `⚠️ Pulse check failed (HTTP ${res.status}). Check Vercel logs.` };
  }

  return {
    text: "✅ Pulse check triggered — results will appear in the dashboard within a minute.",
    response_type: "in_channel",
  };
}

// --- help ---

async function handleHelp(unknownCommand?: string): Promise<SlashResult> {
  const latest = await prisma.pulseCheck.findFirst({
    orderBy: { createdAt: "desc" },
    select: { unassignedPct: true, topCategory: true, openTickets: true },
  });

  const contextLines: string[] = [];
  if (latest) {
    if (latest.openTickets != null && latest.openTickets > 0) {
      contextLines.push(`📬 *${latest.openTickets} open tickets* right now`);
    }
    if (latest.unassignedPct != null && latest.unassignedPct > 0) {
      contextLines.push(`⚠️ *${latest.unassignedPct.toFixed(0)}% unassigned* — run \`/ironside pulse\` then use the triage buttons`);
    }
    if (latest.topCategory) {
      const cat = latest.topCategory.replace(/_/g, " ");
      contextLines.push(`🔥 Top category right now: *${cat}*`);
    }
  }

  const unknownNote = unknownCommand
    ? `_Unknown command: \`${unknownCommand}\`_\n\n`
    : "";

  const commandList = [
    "`/ironside stats` — latest support metrics",
    "`/ironside ticket <id>` — look up a ticket",
    "`/ironside search <keyword>` — search tickets by keyword",
    "`/ironside pulse` — trigger a manual pulse check",
    "`/ironside help` — show this message",
  ].join("\n");

  const body = [
    unknownNote + "*Ironside Support Commands*",
    commandList,
    ...(contextLines.length > 0 ? ["", "*Queue right now:*", ...contextLines] : []),
  ].join("\n");

  return {
    text: "Ironside Support Bot",
    blocks: [
      {
        type: "section",
        text: { type: "mrkdwn", text: body },
      },
    ],
  };
}
