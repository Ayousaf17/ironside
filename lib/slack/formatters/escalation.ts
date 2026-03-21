/**
 * Redesigned escalation alert Slack formatter.
 * Ticket-first layout with SLA context and contextual action buttons.
 */

import { headerBlock, ticketBlock, dividerBlock } from '@/lib/slack/blocks';

interface EscalationItem {
  ticket_id: number;
  subject: string;
  severity: 'critical' | 'high' | 'medium';
  reason: string;
  assignee: string | null;
  age_hours: number;
  customer_name: string;
  action: string;
}

const SEVERITY_EMOJI: Record<string, string> = {
  critical: ':red_circle:',
  high: ':large_orange_circle:',
  medium: ':large_yellow_circle:',
};

/** SLA threshold in minutes per severity level. */
const SLA_MINUTES: Record<string, number> = {
  critical: 30,
  high: 60,
  medium: 240,
};

/** Human-readable severity label shown in the detail line. */
const SEVERITY_LABEL: Record<string, string> = {
  critical: 'Critical',
  high: 'High',
  medium: 'Normal',
};

/**
 * Plain text fallback — same output and signature as the original.
 */
export function formatEscalationAlert(
  escalations: EscalationItem[],
  scanType: string,
): string {
  if (escalations.length === 0) {
    return `:white_check_mark: *Escalation Scan (${scanType})* — No issues found.`;
  }

  const lines: string[] = [
    `:rotating_light: *Proactive Escalation Alert* — ${escalations.length} item(s) found`,
    '',
  ];

  for (const item of escalations) {
    const emoji = SEVERITY_EMOJI[item.severity] || ':white_circle:';
    const assignee = item.assignee
      ? item.assignee.split('@')[0]
      : '_unassigned_';

    lines.push(
      `${emoji} *#${item.ticket_id}* — ${item.subject}`,
      `    Severity: \`${item.severity.toUpperCase()}\` | Age: ${item.age_hours}h | Assignee: ${assignee}`,
      `    Reason: ${item.reason}`,
      `    Action: ${item.action}`,
      '',
    );
  }

  return lines.join('\n');
}

/**
 * Block Kit version — ticket-first layout with SLA context and action buttons.
 *
 * Layout per the spec:
 *   🚨  SLA Breach  ·  N tickets over limit
 *   #XXXXX — "Subject"
 *     Severity SLA (Xm) · Open Xh · Assignee
 *     [Reply →]  [Assign →]   ← Assign only when unassigned
 */
export function formatEscalationBlocks(
  escalations: EscalationItem[],
  scanType: string,
): object[] {
  if (escalations.length === 0) return [];

  const blocks: object[] = [];

  // Header — "🚨  SLA Breach  ·  N tickets over limit"
  blocks.push(
    headerBlock(`🚨  SLA Breach  ·  ${escalations.length} ticket${escalations.length !== 1 ? 's' : ''} over limit`),
  );

  for (const item of escalations.slice(0, 10)) {
    const slaMin = SLA_MINUTES[item.severity] ?? 240;
    const severityLabel = SEVERITY_LABEL[item.severity] ?? 'Normal';
    const assigneeDisplay = item.assignee
      ? item.assignee.split('@')[0]
      : 'Unassigned';
    const isUnassigned = !item.assignee;

    const detail = `${severityLabel} SLA (${slaMin}m) · Open ${item.age_hours}h · ${assigneeDisplay}`;

    const buttons: { text: string; actionId: string; style?: 'primary' | 'danger' }[] = [
      { text: 'Reply →', actionId: 'open_reply_modal' },
    ];

    if (isUnassigned) {
      buttons.push({ text: 'Assign →', actionId: 'assign_ticket' });
    }

    blocks.push(
      ...ticketBlock({
        ticketId: item.ticket_id,
        subject: item.subject,
        detail,
        buttons,
      }),
    );

    blocks.push(dividerBlock());
  }

  return blocks;
}
