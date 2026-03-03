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
