import { NextResponse } from "next/server";
import { searchTickets, assignTicket } from "@/lib/gorgias/client";
import { sendSlackMessage, sendSlackBlocks } from "@/lib/slack/client";
import { formatEscalationAlert, formatEscalationBlocks } from "@/lib/slack/formatters";
import { withRetry } from "@/lib/services/retry.service";
import { logCronError } from "@/lib/services/logging.service";
import { getAgentTier, getSeniorAgentFor, ESCALATION_THRESHOLDS } from "@/lib/services/agent-routing.service";
import { prisma } from "@/lib/prisma";

// SLA targets in minutes (must match auto-triage.ts)
const SLA_TARGETS_MIN: Record<string, number> = {
  critical: 30,
  high: 120,
  normal: 240,
  low: 480,
};

function inferPriority(ticket: { tags?: string[]; subject: string }): string {
  const combined = `${ticket.subject} ${(ticket.tags ?? []).join(" ")}`.toLowerCase();
  if (/urgent|critical|water.*cool|doa|no.*power|leak/i.test(combined)) return "critical";
  if (/wrong.*item|damaged|verification.*stuck/i.test(combined)) return "high";
  return "normal";
}

export const maxDuration = 30;

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (
    !process.env.CRON_SECRET ||
    authHeader !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const tickets = await withRetry(() => searchTickets({}));

    // Reuse SW6 scan logic inline (avoids importing DynamicTool internals)
    const openTickets = tickets.filter((t) => t.status === "open");

    // Critical patterns
    const CRITICAL_PATTERNS = [
      { pattern: /water\s*cool|coolant|leak|drip/i, reason: "Water cooling leak" },
      { pattern: /\b(doa|dead on arrival|won'?t (turn on|power|boot)|no power)\b/i, reason: "DOA / no power" },
      { pattern: /\b(fire|smoke|burning|smell|spark)\b/i, reason: "Safety hazard" },
      { pattern: /\b(chargeback|dispute|fraud|attorney|lawyer|bbb)\b/i, reason: "Legal/chargeback threat" },
    ];

    const escalations: {
      ticket_id: number;
      subject: string;
      severity: "critical" | "high" | "medium";
      reason: string;
      assignee: string | null;
      age_hours: number;
      customer_name: string;
      action: string;
    }[] = [];

    for (const ticket of openTickets) {
      if ((ticket.tags ?? []).some((t) => t === "auto-close" || t === "non-support-related")) continue;

      const ageHours = Math.round(
        (Date.now() - new Date(ticket.created_datetime).getTime()) / 3600000
      );
      const messages = ticket.messages ?? [];
      const combined = `${ticket.subject} ${messages.map((m) => m.body_text ?? "").join(" ")}`;
      const customerMsg = messages.find((m) => m.from_agent === false || m.sender?.type === "customer");
      const customerName = customerMsg?.sender.name || "Unknown";
      const hasResponse = messages.some((m) => m.from_agent === true || m.sender?.type === "agent");

      // Critical scan
      for (const { pattern, reason } of CRITICAL_PATTERNS) {
        if (pattern.test(combined)) {
          escalations.push({
            ticket_id: ticket.id,
            subject: ticket.subject,
            severity: "critical",
            reason,
            assignee: ticket.assignee,
            age_hours: ageHours,
            customer_name: customerName,
            action: "Escalate to senior tech immediately",
          });
          break;
        }
      }

      // Aging scan (>4h without response)
      if (ageHours >= 4 && !hasResponse) {
        escalations.push({
          ticket_id: ticket.id,
          subject: ticket.subject,
          severity: ageHours > 24 ? "high" : "medium",
          reason: `Open ${ageHours}h with NO agent response`,
          assignee: ticket.assignee,
          age_hours: ageHours,
          customer_name: customerName,
          action: ticket.assignee
            ? `Ping ${ticket.assignee.split("@")[0]} for response`
            : "Assign and respond immediately",
        });
      }

      // Junior→Senior escalation
      if (ticket.assignee && getAgentTier(ticket.assignee) === "junior") {
        const needsEscalation =
          (!hasResponse && ageHours >= ESCALATION_THRESHOLDS.ageHoursNoResponse) ||
          (ageHours >= ESCALATION_THRESHOLDS.ageHoursOpen);

        if (needsEscalation) {
          const category = (ticket.tags ?? [])
            .map((t) => t.toLowerCase().replace(/-/g, "_"))
            .find((t) => ["track_order", "report_issue", "return_exchange", "order_verification", "product_question"].includes(t))
            ?? "other";
          const seniorAgent = getSeniorAgentFor(category);
          const juniorName = ticket.assignee.split("@")[0];

          // Reassign to senior
          try {
            await assignTicket(ticket.id, seniorAgent);
          } catch { /* log but don't block escalation alert */ }

          escalations.push({
            ticket_id: ticket.id,
            subject: ticket.subject,
            severity: "high",
            reason: `Escalated from ${juniorName} (junior) — ${ageHours}h old${!hasResponse ? ", no response" : ""}`,
            assignee: seniorAgent,
            age_hours: ageHours,
            customer_name: customerName,
            action: `Reassigned to ${seniorAgent.split("@")[0]} (senior)`,
          });
        }
      }
    }

    // SLA breach detection — alert on tickets past their first response SLA
    const slaBreaches: { ticketId: number; subject: string; priority: string; slaMin: number; ageMin: number; assignee: string | null }[] = [];
    for (const ticket of openTickets) {
      if ((ticket.tags ?? []).some((t) => t === "auto-close" || t === "non-support-related")) continue;
      const messages = ticket.messages || [];
      const hasResponse = messages.some((m) => m.from_agent === true || m.sender?.type === "agent");
      if (hasResponse) continue;

      const ageMin = Math.round((Date.now() - new Date(ticket.created_datetime).getTime()) / 60000);
      const priority = inferPriority(ticket);
      const slaMin = SLA_TARGETS_MIN[priority] ?? 240;

      if (ageMin > slaMin) {
        slaBreaches.push({
          ticketId: ticket.id,
          subject: ticket.subject.slice(0, 60),
          priority,
          slaMin,
          ageMin,
          assignee: ticket.assignee,
        });
      }
    }

    if (slaBreaches.length > 0) {
      const blocks: object[] = [
        { type: "header", text: { type: "plain_text", text: "⏰ SLA Breaches", emoji: true } },
        { type: "context", elements: [{ type: "mrkdwn", text: `${slaBreaches.length} ticket${slaBreaches.length !== 1 ? "s" : ""} past first response SLA` }] },
        ...slaBreaches.slice(0, 10).map((b) => ({
          type: "section",
          text: {
            type: "mrkdwn",
            text: `*#${b.ticketId}* — ${b.subject}\n${b.priority.toUpperCase()} SLA: ${b.slaMin}m | Age: ${b.ageMin}m | ${b.assignee?.split("@")[0] ?? "unassigned"}`,
          },
          accessory: {
            type: "button",
            text: { type: "plain_text", text: "Reply →" },
            action_id: "open_reply_modal",
            value: JSON.stringify({ ticketId: b.ticketId, tags: [], subject: b.subject }),
          },
        })),
      ];
      await sendSlackBlocks(`⏰ ${slaBreaches.length} SLA breaches`, blocks, undefined, undefined, "alerts");
    }

    // Only post to Slack if there are escalations
    if (escalations.length > 0) {
      // Deduplicate by ticket_id, keep highest severity
      const seen = new Map<number, (typeof escalations)[0]>();
      const severityRank = { critical: 0, high: 1, medium: 2 };
      for (const e of escalations) {
        const existing = seen.get(e.ticket_id);
        if (!existing || severityRank[e.severity] < severityRank[existing.severity]) {
          seen.set(e.ticket_id, e);
        }
      }
      const deduped = [...seen.values()].sort(
        (a, b) => severityRank[a.severity] - severityRank[b.severity]
      );

      const blocks = formatEscalationBlocks(deduped, "scheduled");
      if (blocks.length > 0) {
        const fallback = formatEscalationAlert(deduped, "scheduled");
        await withRetry(() => sendSlackBlocks(fallback, blocks, undefined, undefined, "alerts"));
      }
    }

    // Volume spike detection — compare latest pulse to 7-day average
    try {
      const recentPulses = await prisma.pulseCheck.findMany({
        where: { createdAt: { gte: new Date(Date.now() - 8 * 86400000) } },
        orderBy: { createdAt: "desc" },
        select: { ticketCount: true, createdAt: true },
        take: 8,
      });
      if (recentPulses.length >= 2) {
        const [latest, ...previous] = recentPulses;
        const avg = previous.reduce((s, p) => s + (p.ticketCount ?? 0), 0) / previous.length;
        if (avg > 0 && (latest.ticketCount ?? 0) >= avg * 2) {
          const multiplier = ((latest.ticketCount ?? 0) / avg).toFixed(1);
          await sendSlackMessage(
            `📈 *Volume Spike Detected*\nCurrent: ${latest.ticketCount} tickets · 7-day avg: ${Math.round(avg)} · ${multiplier}x normal volume`,
            undefined,
            undefined,
            "alerts",
          );
        }
      }
    } catch (err) {
      console.error("[escalation-scan] Spike detection failed:", err);
    }

    return NextResponse.json({
      ok: true,
      escalations: escalations.length,
      ticketsScanned: openTickets.length,
    });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    console.error("[cron/escalation-scan] Error:", errorMessage);

    await logCronError({
      metric: "cron_escalation_scan_error",
      error: errorMessage,
    });

    return NextResponse.json(
      { ok: false, error: errorMessage },
      { status: 500 }
    );
  }
}
