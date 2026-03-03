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
