/**
 * Reusable Block Kit builder utilities for DRY Slack formatters.
 */

/**
 * Reusable ticket reference block — section with ticket info + optional action buttons.
 * Returns an array of block objects (section + optional actions).
 */
export function ticketBlock(opts: {
  ticketId: number;
  subject: string;
  detail: string; // e.g., "Critical SLA (30m) · Open 2.1h · Spencer"
  buttons?: { text: string; actionId: string; value?: string; style?: 'primary' | 'danger' }[];
}): object[] {
  const blocks: object[] = [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*#${opts.ticketId}* — ${opts.subject}\n${opts.detail}`,
      },
    },
  ];

  if (opts.buttons?.length) {
    blocks.push(
      actionRow(
        opts.buttons.map(b => ({
          ...b,
          value:
            b.value ??
            JSON.stringify({ ticketId: opts.ticketId, tags: [], subject: opts.subject.slice(0, 100) }),
        }))
      )
    );
  }

  return blocks;
}

/**
 * Format a metric with optional delta for use in mrkdwn text.
 * Returns a string like "P90: 42 min (↓ 8 min)"
 */
export function metricLine(
  label: string,
  value: string | number,
  delta?: { value: number; unit?: string; inverted?: boolean }
): string {
  let line = `*${label}:* ${value}`;
  if (delta != null && delta.value !== 0) {
    const arrow = delta.value > 0 ? '↑' : '↓';
    const abs = Math.abs(delta.value);
    const unit = delta.unit ?? '';
    line += ` (${arrow} ${abs}${unit ? ' ' + unit : ''})`;
  }
  return line;
}

/**
 * Action button row — wraps buttons in a Slack actions block.
 */
export function actionRow(
  buttons: { text: string; actionId: string; value: string; style?: 'primary' | 'danger' }[]
): object {
  return {
    type: 'actions',
    elements: buttons.map(b => ({
      type: 'button',
      text: { type: 'plain_text', text: b.text, emoji: true },
      action_id: b.actionId,
      value: b.value,
      ...(b.style ? { style: b.style } : {}),
    })),
  };
}

/**
 * Header block — large bold text.
 */
export function headerBlock(text: string): object {
  return {
    type: 'header',
    text: { type: 'plain_text', text, emoji: true },
  };
}

/**
 * Context block — small gray text.
 */
export function contextBlock(text: string): object {
  return {
    type: 'context',
    elements: [{ type: 'mrkdwn', text }],
  };
}

/**
 * Divider block.
 */
export function dividerBlock(): object {
  return { type: 'divider' };
}
