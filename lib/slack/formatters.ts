interface BehaviorLog {
  agent: string;
  action: string;
  ticketId: number;
  category: string | null;
  macroName: string | null;
  timeToRespondMin: number | null;
  touchesToResolution: number | null;
  reopened: boolean;
  isFirstResponse: boolean | null;
}

interface TicketAnalyticsRecord {
  category: string | null;
  aiConfidenceScore: number | null;
}

interface WeeklyReportData {
  behaviorLogs: BehaviorLog[];
  ticketAnalytics: TicketAnalyticsRecord[];
  startDate: Date;
  endDate: Date;
}

function formatDateRange(start: Date, end: Date): string {
  const fmt = (d: Date) =>
    d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return `${fmt(start)} – ${fmt(end)}`;
}

export function formatWeeklyBehaviorReport(data: WeeklyReportData): string {
  const { behaviorLogs, ticketAnalytics, startDate, endDate } = data;

  if (behaviorLogs.length === 0) {
    return `:bar_chart: *Weekly Agent Behavior Report* — ${formatDateRange(startDate, endDate)}\n\nNo activity recorded this week.`;
  }

  // Unique tickets & total actions
  const uniqueTickets = new Set(behaviorLogs.map((l) => l.ticketId)).size;
  const totalActions = behaviorLogs.length;

  // Agent breakdown
  const agentCounts = new Map<string, number>();
  for (const log of behaviorLogs) {
    const name = log.agent.split("@")[0];
    agentCounts.set(name, (agentCounts.get(name) || 0) + 1);
  }
  const agentBreakdown = [...agentCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([name, count]) => `${name} (${count})`)
    .join(", ");

  // Top categories
  const categoryCounts = new Map<string, number>();
  for (const log of behaviorLogs) {
    if (log.category) {
      categoryCounts.set(
        log.category,
        (categoryCounts.get(log.category) || 0) + 1
      );
    }
  }
  const totalCategorized = [...categoryCounts.values()].reduce(
    (a, b) => a + b,
    0
  );
  const topCategories = [...categoryCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([cat, count]) => {
      const pct = totalCategorized > 0 ? Math.round((count / totalCategorized) * 100) : 0;
      return `${cat} (${pct}%)`;
    })
    .join(", ");

  // Response performance
  const responseTimes = behaviorLogs
    .filter((l) => l.timeToRespondMin != null)
    .map((l) => l.timeToRespondMin!);
  const avgResponseTime =
    responseTimes.length > 0
      ? Math.round(responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length)
      : null;

  const touches = behaviorLogs
    .filter((l) => l.touchesToResolution != null)
    .map((l) => l.touchesToResolution!);
  const avgTouches =
    touches.length > 0
      ? (touches.reduce((a, b) => a + b, 0) / touches.length).toFixed(1)
      : null;

  const reopenedCount = behaviorLogs.filter((l) => l.reopened).length;
  const reopenRate =
    uniqueTickets > 0 ? Math.round((reopenedCount / uniqueTickets) * 100) : 0;

  // Macro usage
  const macroCounts = new Map<string, number>();
  for (const log of behaviorLogs) {
    if (log.macroName) {
      macroCounts.set(log.macroName, (macroCounts.get(log.macroName) || 0) + 1);
    }
  }
  const topMacros = [...macroCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  // Tier readiness
  const categoryConfidence = new Map<string, number[]>();
  for (const ta of ticketAnalytics) {
    if (ta.category && ta.aiConfidenceScore != null) {
      if (!categoryConfidence.has(ta.category)) {
        categoryConfidence.set(ta.category, []);
      }
      categoryConfidence.get(ta.category)!.push(ta.aiConfidenceScore);
    }
  }
  const tierLines = [...categoryConfidence.entries()]
    .map(([cat, scores]) => {
      const avg = Math.round(
        (scores.reduce((a, b) => a + b, 0) / scores.length) * 100
      );
      let tier: string;
      if (avg >= 95) tier = "Tier 3 ready";
      else if (avg >= 85) tier = "Tier 2 eligible";
      else tier = "Tier 1 only";
      return { cat, avg, tier };
    })
    .sort((a, b) => b.avg - a.avg)
    .slice(0, 5);

  // Build message
  const lines: string[] = [
    `:bar_chart: *Weekly Agent Behavior Report* — ${formatDateRange(startDate, endDate)}`,
    "",
    `*Activity:* ${uniqueTickets} unique tickets, ${totalActions} total actions`,
    `*By Agent:* ${agentBreakdown}`,
    `*Top Categories:* ${topCategories || "none categorized"}`,
  ];

  // Response performance section
  lines.push("", `*Response Performance:*`);
  if (avgResponseTime != null) {
    lines.push(`  Avg first response: ${avgResponseTime} min`);
  }
  if (avgTouches != null) {
    lines.push(`  Avg touches to resolution: ${avgTouches}`);
  }
  lines.push(`  Reopen rate: ${reopenRate}%`);

  // Macro section
  if (topMacros.length > 0) {
    lines.push("", `*Macro Usage:*`);
    for (const [name, count] of topMacros) {
      lines.push(`  ${name} (${count}x)`);
    }
  }

  // Tier readiness section
  if (tierLines.length > 0) {
    lines.push("", `*Tier Readiness:*`);
    for (const { cat, avg, tier } of tierLines) {
      lines.push(`  ${cat} → ${avg}% confidence (${tier})`);
    }
  }

  return lines.join("\n");
}

interface EscalationItem {
  ticket_id: number;
  subject: string;
  severity: "critical" | "high" | "medium";
  reason: string;
  assignee: string | null;
  age_hours: number;
  customer_name: string;
  action: string;
}

const SEVERITY_EMOJI: Record<string, string> = {
  critical: ":red_circle:",
  high: ":large_orange_circle:",
  medium: ":large_yellow_circle:",
};

export function formatEscalationAlert(
  escalations: EscalationItem[],
  scanType: string
): string {
  if (escalations.length === 0) {
    return `:white_check_mark: *Escalation Scan (${scanType})* — No issues found.`;
  }

  const lines: string[] = [
    `:rotating_light: *Proactive Escalation Alert* — ${escalations.length} item(s) found`,
    "",
  ];

  for (const item of escalations) {
    const emoji = SEVERITY_EMOJI[item.severity] || ":white_circle:";
    const assignee = item.assignee
      ? item.assignee.split("@")[0]
      : "_unassigned_";

    lines.push(
      `${emoji} *#${item.ticket_id}* — ${item.subject}`,
      `    Severity: \`${item.severity.toUpperCase()}\` | Age: ${item.age_hours}h | Assignee: ${assignee}`,
      `    Reason: ${item.reason}`,
      `    Action: ${item.action}`,
      ""
    );
  }

  return lines.join("\n");
}

// Maps topQuestions.question strings → Slack emoji and category key
const QUESTION_EMOJI: Record<string, string> = {
  "Track Order":                      "📦",
  "Order Verification":               "🔍",
  "Product Question":                 "💻",
  "Report Issue":                     "🔧",
  "New submission from Contact":      "📬",
  "Return / Exchange":                "↩️",
  "Order Change / Cancel":            "✏️",
};

const QUESTION_TO_CATEGORY: Record<string, string> = {
  "Track Order":                      "track_order",
  "Order Verification":               "order_verification",
  "Product Question":                 "product_question",
  "Report Issue":                     "report_issue",
  "New submission from Contact":      "contact_form",
  "Return / Exchange":                "return_exchange",
  "Order Change / Cancel":            "order_change_cancel",
};

export interface PulseCheckBlocksInput {
  summary: string;
  analytics: {
    totalTickets: number;
    openTickets: number;
    closedTickets: number;
    spamRate: number; // integer percentage (0-100)
    avgResolutionMinutes: number | null;
    p50ResolutionMinutes: number | null;
    p90ResolutionMinutes: number | null;
    topQuestions: { question: string; count: number; ticketIds?: number[] }[];
    agentBreakdown: { agent: string; ticketCount: number; closeRate: number }[];
    spamCount: number;
    unassignedCount: number;
  };
  dateRangeStart: Date;
  dateRangeEnd: Date;
}

// Escape characters that break Slack mrkdwn validation when appearing in raw LLM output.
// Slack interprets <text> as links/mentions — unescaped < > & in dynamic content fail validation.
function sanitizeMrkdwn(text: string, maxLen = 3000): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .slice(0, maxLen);
}

export function formatPulseCheckBlocks(input: PulseCheckBlocksInput): object[] {
  const { summary, analytics, dateRangeStart, dateRangeEnd } = input;

  const fmt = (d: Date) =>
    d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const dateRange = `${fmt(dateRangeStart)} – ${fmt(dateRangeEnd)}`;

  const blocks: object[] = [];

  // Header
  blocks.push({
    type: "header",
    text: { type: "plain_text", text: "📊 Support Pulse Check", emoji: true },
  });

  // Date range + total
  blocks.push({
    type: "section",
    text: {
      type: "mrkdwn",
      text: `_${dateRange} • ${analytics.totalTickets} tickets_`,
    },
  });

  // Stats fields
  const resolutionText =
    analytics.avgResolutionMinutes !== null
      ? `Avg ${analytics.avgResolutionMinutes}min • P50: ${analytics.p50ResolutionMinutes ?? "–"}min • P90: ${analytics.p90ResolutionMinutes ?? "–"}min`
      : "_No closed tickets with agent responses_";

  blocks.push({
    type: "section",
    fields: [
      {
        type: "mrkdwn",
        text: `*Status:*\nOpen: ${analytics.openTickets} | Closed: ${analytics.closedTickets}`,
      },
      {
        type: "mrkdwn",
        text: `*Spam:*\n${analytics.spamCount} tickets (${analytics.spamRate}%) — auto-closed`,
      },
      {
        type: "mrkdwn",
        text: `*Real Support:*\n${analytics.totalTickets - analytics.spamCount} tickets`,
      },
      {
        type: "mrkdwn",
        text: `*Resolution:*\n${resolutionText}`,
      },
    ],
  });

  // Top Questions
  if (analytics.topQuestions.length > 0) {
    const top3 = analytics.topQuestions.slice(0, 3);
    const questionLines = top3
      .map((q, i) => `${i + 1}. "${sanitizeMrkdwn(q.question, 200)}" — ${q.count} tickets`)
      .join("\n");
    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: `*Top Questions:*\n${questionLines}`.slice(0, 3000) },
    });
  }

  // Workload
  if (analytics.agentBreakdown.length > 0) {
    const workloadLines = analytics.agentBreakdown
      .map((a) => `• ${sanitizeMrkdwn(a.agent, 80)}: ${a.ticketCount} tickets (${a.closeRate}% close rate)`)
      .join("\n");
    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: `*Workload:*\n${workloadLines}`.slice(0, 3000) },
    });
  }

  // Action Items — extract numbered items from LLM summary
  const summaryLines = summary.split("\n");
  const actionStartIdx = summaryLines.findIndex((l) =>
    l.includes("Action Items")
  );
  const actionItems: string[] = [];
  if (actionStartIdx !== -1) {
    for (
      let i = actionStartIdx + 1;
      i < summaryLines.length && actionItems.length < 3;
      i++
    ) {
      const match = summaryLines[i].match(/^\d+\.\s*(.+)/);
      if (match) actionItems.push(match[1].trim());
    }
  }
  if (actionItems.length > 0) {
    const actionLines = actionItems
      .map((item, i) => `${i + 1}. ${sanitizeMrkdwn(item, 500)}`)
      .join("\n");
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*:rotating_light: Action Items:*\n${actionLines}`.slice(0, 3000),
      },
    });
  }

  blocks.push({ type: "divider" });

  // Category-specific triage buttons — one per recurring question type,
  // up to 3. Spam is auto-handled so no spam button needed.
  const buttons: object[] = [];

  if (analytics.unassignedCount > 0) {
    const topCats = analytics.topQuestions
      .slice(0, 3)
      .filter((q) => QUESTION_TO_CATEGORY[q.question]);

    if (topCats.length > 0) {
      for (const q of topCats) {
        const emoji = QUESTION_EMOJI[q.question] ?? "📋";
        const category = QUESTION_TO_CATEGORY[q.question]!;
        const btnLabel = `${emoji} ${q.question} (${q.count})`;
        buttons.push({
          type: "button",
          text: { type: "plain_text", text: btnLabel.length > 75 ? `${btnLabel.slice(0, 72)}…` : btnLabel, emoji: true },
          action_id: "show_category_triage",
          value: JSON.stringify({ category, question: q.question, count: q.count }),
        });
      }
    } else {
      // Fallback when topQuestions don't map to known categories
      buttons.push({
        type: "button",
        text: {
          type: "plain_text",
          text: `📋 Triage ${analytics.unassignedCount} Unassigned`,
          emoji: true,
        },
        action_id: "show_unassigned_tickets",
        value: JSON.stringify({ count: analytics.unassignedCount }),
      });
    }
  }

  if (buttons.length > 0) {
    blocks.push({ type: "actions", elements: buttons });
  } else {
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: "✅ Queue looks healthy — no immediate actions needed",
      },
    });
  }

  return blocks;
}

// ---- Spam Chain ----

interface SpamTicket {
  id: number;
  subject: string;
  tags: string[];
  created_datetime: string;
}

export function formatSpamChainBlocks(
  tickets: SpamTicket[],
  reviewerSlackId: string
): object[] {
  const blocks: object[] = [];

  // Header
  blocks.push({
    type: "header",
    text: {
      type: "plain_text",
      text: `🗑️ Spam Queue — ${tickets.length} open ticket${tickets.length !== 1 ? "s" : ""}`,
      emoji: true,
    },
  });

  blocks.push({
    type: "section",
    text: {
      type: "mrkdwn",
      text: `Opened by <@${reviewerSlackId}> · Tagged \`non-support-related\` or \`auto-close\` · Last 24h window`,
    },
  });

  blocks.push({ type: "divider" });

  // Ticket list — up to 15 to stay under Slack's 50-block limit
  const displayed = tickets.slice(0, 15);
  for (const ticket of displayed) {
    const ageMs = Date.now() - new Date(ticket.created_datetime).getTime();
    const ageSecs = Math.floor(ageMs / 1000);
    const ageStr =
      ageSecs < 3600
        ? `${Math.floor(ageSecs / 60)}m`
        : ageSecs < 86400
        ? `${Math.floor(ageSecs / 3600)}h`
        : `${Math.floor(ageSecs / 86400)}d`;

    const subject =
      ticket.subject.length > 70
        ? `${ticket.subject.slice(0, 70)}…`
        : ticket.subject;

    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*#${ticket.id}* — ${subject}\n_${ticket.tags.join(", ")} · ${ageStr} ago_`,
      },
    });
  }

  if (tickets.length > 15) {
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `_...and ${tickets.length - 15} more spam tickets_`,
      },
    });
  }

  blocks.push({ type: "divider" });

  // Actions
  blocks.push({
    type: "actions",
    elements: [
      {
        type: "button",
        text: {
          type: "plain_text",
          text: `✅ Close All ${tickets.length} as Spam`,
          emoji: true,
        },
        style: "danger",
        action_id: "close_all_spam",
        value: JSON.stringify({ count: tickets.length }),
        confirm: {
          title: { type: "plain_text", text: "Close all as spam?" },
          text: {
            type: "mrkdwn",
            text: `This will close *${tickets.length} ticket${tickets.length !== 1 ? "s" : ""}* in Gorgias as spam. Are you sure?`,
          },
          confirm: { type: "plain_text", text: "Yes, close all" },
          deny: { type: "plain_text", text: "Cancel" },
        },
      },
      {
        type: "button",
        text: { type: "plain_text", text: "❌ Cancel", emoji: true },
        action_id: "cancel_spam_review",
        value: "{}",
      },
    ],
  });

  return blocks;
}

// ---- Triage Chain ----

// Playbook tips per category — shown above each ticket group so the agent
// knows exactly what to do before reading the first ticket.
const CATEGORY_DISPLAY_NAME: Record<string, string> = {
  track_order:          "📦 Track Order",
  order_verification:   "🔍 Order Verification",
  return_exchange:      "↩️ Return / Exchange",
  report_issue:         "🔧 Report an Issue",
  product_question:     "💻 Product Question",
  order_change_cancel:  "✏️ Order Change / Cancel",
  contact_form:         "📬 Contact Form",
};

const CATEGORY_PLAYBOOK: Record<string, string> = {
  track_order:
    "💡 Check if verified + in build window (15-20 days). Past window → use `order_status_overdue`. Recently shipped → use `order_status_shipped`.",
  order_verification:
    "💡 Customer needs ID + billing address. Docs not yet submitted → use `verification_what_needed`. Already submitted but stuck → use `verification_stuck`.",
  return_exchange:
    "💡 30-day window, 15% restocking fee. Get reason before issuing RMA. Use `return_process` template.",
  report_issue:
    "💡 WiFi/driver issue → use `wifi_driver_fix`. Water cooling leak → CRITICAL, use `water_cooling_critical`, do not let customer power on.",
  product_question:
    "💡 Pre-sale inquiry. Confirm specs, compatibility, or pricing. No template — draft a custom response.",
  order_change_cancel:
    "💡 Changes allowed only if order is still in verification. In build queue → escalate to build team for feasibility.",
  contact_form:
    "💡 General inquiry — read carefully for intent before routing or replying.",
};

export interface TriageChainInput {
  // grouped is keyed by category key (e.g. "track_order"), not agent email
  grouped: Map<string, { id: number; subject: string; tags: string[]; created_datetime: string; suggestedEmail: string | null }[]>;
  unclassified: { id: number; subject: string; tags: string[]; created_datetime: string; suggestedEmail: string | null }[];
  reviewerSlackId: string;
  assignableCount: number;
  totalCount: number;
  categoryFilter?: string; // when set, show only this category
}

function ticketAge(created_datetime: string): string {
  const secs = Math.floor((Date.now() - new Date(created_datetime).getTime()) / 1000);
  if (secs < 3600) return `${Math.floor(secs / 60)}m`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h`;
  return `${Math.floor(secs / 86400)}d`;
}

export function formatTriageChainBlocks(input: TriageChainInput): object[] {
  const { grouped, unclassified, reviewerSlackId, assignableCount, totalCount, categoryFilter } = input;
  const blocks: object[] = [];

  const categoryLabel = categoryFilter
    ? (CATEGORY_DISPLAY_NAME[categoryFilter] ?? categoryFilter)
    : "All Categories";

  // Header
  blocks.push({
    type: "header",
    text: {
      type: "plain_text",
      text: `📋 Triage Queue — ${totalCount} unassigned ticket${totalCount !== 1 ? "s" : ""}`,
      emoji: true,
    },
  });

  blocks.push({
    type: "section",
    text: {
      type: "mrkdwn",
      text: `Opened by <@${reviewerSlackId}> · ${categoryLabel} · Unassigned open tickets`,
    },
  });

  blocks.push({ type: "divider" });

  // Per-category groups — each with a playbook tip before the ticket list
  for (const [category, tickets] of grouped.entries()) {
    const displayName = CATEGORY_DISPLAY_NAME[category] ?? category;
    const playbook = CATEGORY_PLAYBOOK[category];

    blocks.push({
      type: "context",
      elements: [{ type: "mrkdwn", text: `*${displayName}* — ${tickets.length} ticket${tickets.length !== 1 ? "s" : ""}` }],
    });

    if (playbook) {
      blocks.push({
        type: "context",
        elements: [{ type: "mrkdwn", text: playbook }],
      });
    }

    const shown = tickets.slice(0, 8);
    for (const t of shown) {
      const subject = t.subject.length > 55 ? `${t.subject.slice(0, 55)}…` : t.subject;
      const assignedTo = t.suggestedEmail ? ` → ${t.suggestedEmail.split("@")[0]}` : "";
      blocks.push({
        type: "section",
        text: { type: "mrkdwn", text: `*#${t.id}* — ${subject}\n_${ticketAge(t.created_datetime)} ago${assignedTo}_` },
        accessory: {
          type: "button",
          text: { type: "plain_text", text: "Reply →" },
          action_id: "open_reply_modal",
          value: JSON.stringify({ ticketId: t.id, tags: t.tags, subject: t.subject.slice(0, 100) }),
        },
      });
    }
    if (tickets.length > 8) {
      blocks.push({
        type: "context",
        elements: [{ type: "mrkdwn", text: `_…and ${tickets.length - 8} more — open Gorgias to reply_` }],
      });
    }
  }

  // Unclassified group
  if (unclassified.length > 0) {
    blocks.push({
      type: "context",
      elements: [{ type: "mrkdwn", text: `*⚠️ Unclassified* (${unclassified.length} ticket${unclassified.length !== 1 ? "s" : ""} — no routing match)` }],
    });

    const shown = unclassified.slice(0, 5);
    for (const t of shown) {
      const subject = t.subject.length > 55 ? `${t.subject.slice(0, 55)}…` : t.subject;
      blocks.push({
        type: "section",
        text: { type: "mrkdwn", text: `*#${t.id}* — ${subject}\n_${ticketAge(t.created_datetime)} ago_` },
        accessory: {
          type: "button",
          text: { type: "plain_text", text: "Reply →" },
          action_id: "open_reply_modal",
          value: JSON.stringify({ ticketId: t.id, tags: t.tags, subject: t.subject.slice(0, 100) }),
        },
      });
    }
    if (unclassified.length > 5) {
      blocks.push({
        type: "context",
        elements: [{ type: "mrkdwn", text: `_…and ${unclassified.length - 5} more_` }],
      });
    }
  }

  blocks.push({ type: "divider" });

  // Actions
  const autoAssignText =
    assignableCount > 0
      ? `✅ Auto-Assign ${assignableCount} Ticket${assignableCount !== 1 ? "s" : ""}`
      : "✅ Auto-Assign All";

  const elements: object[] = [];

  if (assignableCount > 0) {
    elements.push({
      type: "button",
      text: { type: "plain_text", text: autoAssignText, emoji: true },
      style: "primary",
      action_id: "auto_assign_triage",
      value: JSON.stringify({ count: assignableCount }),
      confirm: {
        title: { type: "plain_text", text: "Auto-assign tickets?" },
        text: {
          type: "mrkdwn",
          text: `This will assign *${assignableCount} ticket${assignableCount !== 1 ? "s" : ""}* in Gorgias based on category routing. Unclassified tickets will be skipped.`,
        },
        confirm: { type: "plain_text", text: "Yes, assign" },
        deny: { type: "plain_text", text: "Cancel" },
      },
    });
  }

  elements.push({
    type: "button",
    text: { type: "plain_text", text: "❌ Cancel", emoji: true },
    action_id: "cancel_triage",
    value: "{}",
  });

  blocks.push({ type: "actions", elements });

  return blocks;
}

// ---- Reply Modal ----

interface MacroOption {
  id: number;
  name: string;
  body_text: string;
}

export interface ReplyModalInput {
  ticketId: number;
  subject: string;
  lastCustomerMessage: string;
  macros: MacroOption[];
  selectedMacroId?: number;
}

function expandMacroTemplate(body: string): string {
  return body
    .replace(/\{\{ticket\.customer\.first_name\}\}/g, "[Customer Name]")
    .replace(/\{\{ticket\.assignee_user\.first_name\}\}/g, "[Your Name]")
    .replace(/\{\{[^}]+\}\}/g, "[…]");
}

export function formatReplyModal(input: ReplyModalInput): object {
  const { ticketId, subject, lastCustomerMessage, macros, selectedMacroId } = input;

  const selectedMacro = macros.find((m) => m.id === selectedMacroId) ?? macros[0];
  const replyText = selectedMacro ? expandMacroTemplate(selectedMacro.body_text) : "";

  const subjectDisplay = subject.length > 44 ? `${subject.slice(0, 44)}…` : subject;
  const messagePreview = lastCustomerMessage.length > 280
    ? `${lastCustomerMessage.slice(0, 280)}…`
    : lastCustomerMessage;

  const blocks: object[] = [
    {
      type: "section",
      text: { type: "mrkdwn", text: `*Ticket #${ticketId}*: ${subjectDisplay}` },
    },
    {
      type: "section",
      text: { type: "mrkdwn", text: `*Customer said:*\n>${messagePreview.replace(/\n/g, "\n>")}` },
    },
    { type: "divider" },
  ];

  // Macro selector
  if (macros.length > 0) {
    const options = macros.slice(0, 100).map((m) => ({
      text: { type: "plain_text", text: m.name.length > 75 ? `${m.name.slice(0, 74)}…` : m.name },
      value: String(m.id),
    }));

    const macroBlock: Record<string, unknown> = {
      type: "section",
      text: { type: "mrkdwn", text: "*Macro template:*" },
      accessory: {
        type: "static_select",
        action_id: "select_macro",
        placeholder: { type: "plain_text", text: "Choose a macro…" },
        options,
        ...(selectedMacro
          ? {
              initial_option: {
                text: { type: "plain_text", text: selectedMacro.name.length > 75 ? `${selectedMacro.name.slice(0, 74)}…` : selectedMacro.name },
                value: String(selectedMacro.id),
              },
            }
          : {}),
      },
    };
    blocks.push(macroBlock);
  }

  blocks.push({
    type: "input",
    block_id: "reply_input",
    element: {
      type: "plain_text_input",
      action_id: "reply_text",
      multiline: true,
      initial_value: replyText,
      placeholder: { type: "plain_text", text: "Type your reply…" },
      min_length: 1,
    },
    label: { type: "plain_text", text: "Reply", emoji: true },
  });

  return {
    type: "modal",
    callback_id: "reply_modal",
    private_metadata: JSON.stringify({ ticketId, selectedMacroId: selectedMacro?.id ?? null, macroName: selectedMacro?.name ?? null }),
    title: { type: "plain_text", text: "Reply to Ticket", emoji: true },
    submit: { type: "plain_text", text: "Send Reply", emoji: true },
    close: { type: "plain_text", text: "Cancel", emoji: true },
    blocks,
  };
}

interface ApprovalData {
  ticketId: number;
  category: string;
  confidence: number;
  recommendedAction: string;
  agentResponse: string;
}

export function formatApprovalBlocks(data: ApprovalData) {
  const confidencePct = Math.round(data.confidence * 100);
  const actionLabel = data.recommendedAction
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());

  return [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `:robot_face: *AI Recommendation — Ticket #${data.ticketId}*`,
      },
    },
    {
      type: "section",
      fields: [
        { type: "mrkdwn", text: `*Category:*\n\`${data.category}\`` },
        { type: "mrkdwn", text: `*Confidence:*\n${confidencePct}%` },
        { type: "mrkdwn", text: `*Action:*\n${actionLabel}` },
      ],
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*Agent Analysis:*\n${data.agentResponse.substring(0, 500)}`,
      },
    },
    { type: "divider" },
    {
      type: "actions",
      elements: [
        {
          type: "button",
          text: { type: "plain_text", text: "Approve", emoji: true },
          style: "primary",
          action_id: "approve_action",
          value: JSON.stringify({
            ticketId: data.ticketId,
            action: data.recommendedAction,
          }),
        },
        {
          type: "button",
          text: { type: "plain_text", text: "Reject", emoji: true },
          style: "danger",
          action_id: "reject_action",
          value: JSON.stringify({
            ticketId: data.ticketId,
            action: data.recommendedAction,
          }),
        },
      ],
    },
  ];
}

// --- Phase 5: Real-time urgent ticket alert ---

export interface UrgentTicketBlocksInput {
  ticketId: number;
  subject: string;
  tags: string[];
  customerName: string;
  channel: string;
  urgencyReason: string;
  severity: "critical" | "high";
}

export function formatUrgentTicketBlocks(input: UrgentTicketBlocksInput): object[] {
  const { ticketId, subject, tags, customerName, channel, urgencyReason, severity } = input;
  const emoji = severity === "critical" ? "🚨" : "⚠️";
  const severityLabel = severity === "critical" ? "CRITICAL" : "HIGH";

  const blocks: object[] = [];

  blocks.push({
    type: "header",
    text: { type: "plain_text", text: `${emoji} Urgent Ticket Alert`, emoji: true },
  });

  blocks.push({
    type: "section",
    text: {
      type: "mrkdwn",
      text: `*#${ticketId}* — ${subject}\n_${customerName} · via ${channel}_`,
    },
    accessory: {
      type: "button",
      text: { type: "plain_text", text: "Reply →" },
      action_id: "open_reply_modal",
      value: JSON.stringify({ ticketId, tags, subject: subject.slice(0, 100) }),
      style: "danger",
    },
  });

  blocks.push({
    type: "section",
    fields: [
      { type: "mrkdwn", text: `*Severity:*\n\`${severityLabel}\`` },
      { type: "mrkdwn", text: `*Reason:*\n${urgencyReason}` },
    ],
  });

  if (tags.length > 0) {
    blocks.push({
      type: "context",
      elements: [{ type: "mrkdwn", text: `Tags: ${tags.map(t => `\`${t}\``).join(" ")}` }],
    });
  }

  // Escalation playbook — what to do right now based on severity
  const playbookText = severity === "critical"
    ? "💡 *Protocol:* Reply within 15 min. If water cooling — customer must NOT power on; initiate RMA. Assess hardware damage before suggesting any fixes."
    : "💡 *Protocol:* Reply within 1 hour. Get full details before suggesting a fix. Escalate to build team if order-related.";

  blocks.push({
    type: "context",
    elements: [{ type: "mrkdwn", text: playbookText }],
  });

  return blocks;
}
