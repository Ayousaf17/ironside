import { headerBlock, contextBlock, ticketBlock, dividerBlock } from "@/lib/slack/blocks";

export interface StandupData {
  openTickets: number;
  closedTickets: number;
  unassignedPct: number | null;
  resolutionP90Min: number | null;
  topCategory: string | null;
  overnightActions: number;
  staleTickets: { id: number; subject: string; assignee: string | null; ageHours: number }[];
  slaBreaches: { id: number; subject: string; assignee: string | null; ageHours: number }[];
  queuedOps: number;
}

export function formatDailyStandupBlocks(data: StandupData): object[] {
  const now = new Date();

  // Format date as "Friday, Mar 21"
  const dayName = now.toLocaleDateString("en-US", { weekday: "long" });
  const monthDay = now.toLocaleDateString("en-US", { month: "short", day: "numeric" });

  const blocks: object[] = [];

  // ── Header ──────────────────────────────────────────────────────────────────
  blocks.push(headerBlock(`☀️  Morning Brief  ·  ${dayName}, ${monthDay}`));

  // ── Overnight + current state ────────────────────────────────────────────────
  const unassignedCount =
    data.unassignedPct !== null
      ? Math.round((data.unassignedPct / 100) * data.openTickets)
      : 0;

  const overnightLine = `Overnight: ${data.overnightActions} agent action${data.overnightActions !== 1 ? "s" : ""} · ${data.closedTickets} new ticket${data.closedTickets !== 1 ? "s" : ""}`;
  const stateLine = `Right now: ${data.openTickets} open ticket${data.openTickets !== 1 ? "s" : ""} · ${unassignedCount} unassigned · ${data.slaBreaches.length} SLA breach${data.slaBreaches.length !== 1 ? "es" : ""}`;

  blocks.push({
    type: "section",
    text: {
      type: "mrkdwn",
      text: `${overnightLine}\n${stateLine}`,
    },
  });

  // ── Stale tickets ────────────────────────────────────────────────────────────
  if (data.staleTickets.length > 0) {
    blocks.push(dividerBlock());
    blocks.push(headerBlock("📬  Stale (no response >24h)"));

    for (const t of data.staleTickets.slice(0, 5)) {
      const assigneeLabel = t.assignee ? t.assignee.split("@")[0] : "unassigned";
      blocks.push(
        ...ticketBlock({
          ticketId: t.id,
          subject: t.subject,
          detail: `${assigneeLabel} · ${t.ageHours}h since last update`,
          buttons: [
            {
              text: "Reply →",
              actionId: "open_reply_modal",
            },
          ],
        })
      );
    }

    if (data.staleTickets.length > 5) {
      blocks.push(contextBlock(`_…and ${data.staleTickets.length - 5} more stale ticket${data.staleTickets.length - 5 !== 1 ? "s" : ""}_`));
    }
  }

  // ── SLA breaches ─────────────────────────────────────────────────────────────
  if (data.slaBreaches.length > 0) {
    blocks.push(dividerBlock());
    blocks.push(headerBlock("🚨  SLA Breaches"));

    for (const t of data.slaBreaches.slice(0, 3)) {
      const assigneeLabel = t.assignee ? t.assignee.split("@")[0] : "unassigned";
      blocks.push(
        ...ticketBlock({
          ticketId: t.id,
          subject: t.subject,
          detail: `${assigneeLabel} · ${t.ageHours}h open`,
          buttons: [
            {
              text: "Reply →",
              actionId: "open_reply_modal",
            },
          ],
        })
      );
    }
  }

  // ── Queued ops ───────────────────────────────────────────────────────────────
  if (data.queuedOps > 0) {
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `🔄 ${data.queuedOps} queued operation${data.queuedOps !== 1 ? "s" : ""} awaiting retry`,
      },
    });
  }

  // ── Conversational closer ────────────────────────────────────────────────────
  if (data.staleTickets.length === 0 && data.slaBreaches.length === 0) {
    blocks.push(contextBlock("Everything looks good. Have a productive day."));
  }

  return blocks;
}
