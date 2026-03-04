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

interface TokenRecord {
  totalTokens: number;
  costUsd: number;
}

interface TicketAnalyticsRecord {
  category: string | null;
  aiConfidenceScore: number | null;
}

interface WeeklyReportData {
  behaviorLogs: BehaviorLog[];
  tokenUsage: TokenRecord[];
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
  const { behaviorLogs, tokenUsage, ticketAnalytics, startDate, endDate } =
    data;

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

  // AI cost
  const totalCalls = tokenUsage.length;
  const totalTokens = tokenUsage.reduce((sum, t) => sum + t.totalTokens, 0);
  const totalCost = tokenUsage.reduce((sum, t) => sum + t.costUsd, 0);

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

  // AI cost section
  lines.push(
    "",
    `*AI Cost:* $${totalCost.toFixed(2)} (${totalCalls} calls, ${totalTokens >= 1000 ? `${Math.round(totalTokens / 1000)}K` : totalTokens} tokens)`
  );

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
