// Daily standup summary — posts at 9 AM UTC to #ops channel.
// Covers: overnight ticket activity, open SLA breaches, stale tickets (no response >24h),
// offline queue status, and system health.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendSlackBlocks } from "@/lib/slack/client";
import { searchTickets } from "@/lib/gorgias/client";
import { logCronError } from "@/lib/services/logging.service";

export const maxDuration = 30;

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const now = new Date();
    const overnightStart = new Date(now);
    overnightStart.setHours(now.getHours() - 12); // last 12 hours

    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    // Parallel data fetches
    const [
      latestPulse,
      overnightBehavior,
      openTickets,
      queueConfig,
    ] = await Promise.all([
      prisma.pulseCheck.findFirst({
        orderBy: { createdAt: "desc" },
        select: {
          ticketCount: true,
          openTickets: true,
          closedTickets: true,
          unassignedPct: true,
          spamRate: true,
          resolutionP90Min: true,
          topCategory: true,
          createdAt: true,
        },
      }),
      prisma.agentBehaviorLog.count({
        where: { occurredAt: { gte: overnightStart } },
      }),
      searchTickets({ status: "open" }),
      prisma.dashboardConfig.findUnique({ where: { key: "gorgias_offline_queue" } }),
    ]);

    // Find stale tickets — open tickets with no agent response in 24h
    const staleTickets = openTickets.filter((t) => {
      if (!t.created_datetime) return false;
      const lastUpdate = new Date(t.created_datetime).getTime();
      return lastUpdate < twentyFourHoursAgo.getTime();
    });

    const queuedOps = Array.isArray(queueConfig?.value) ? (queueConfig.value as unknown[]).length : 0;

    // SLA breach detection — open tickets older than 4h without agent response
    const SLA_DEFAULT_MIN = 240;
    const slaBreaches = openTickets.filter((t) => {
      if (t.tags.some((tag: string) => tag === "auto-close" || tag === "non-support-related")) return false;
      const ageMin = Math.round((now.getTime() - new Date(t.created_datetime).getTime()) / 60000);
      return ageMin > SLA_DEFAULT_MIN;
    });

    // Build standup message
    const blocks: object[] = [];

    blocks.push({
      type: "header",
      text: { type: "plain_text", text: "☀️ Daily Standup Summary", emoji: true },
    });

    blocks.push({
      type: "context",
      elements: [{ type: "mrkdwn", text: `${now.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })} · Generated at ${now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })} UTC` }],
    });

    // Overnight activity
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: [
          "*📊 Current State*",
          latestPulse ? `• ${latestPulse.openTickets ?? 0} open tickets · ${latestPulse.closedTickets ?? 0} closed` : "• No pulse data yet",
          latestPulse?.unassignedPct ? `• ${latestPulse.unassignedPct.toFixed(0)}% unassigned` : null,
          latestPulse?.resolutionP90Min ? `• P90 resolution: ${latestPulse.resolutionP90Min.toFixed(0)} min` : null,
          `• ${overnightBehavior} agent actions overnight`,
          latestPulse?.topCategory ? `• Top category: ${latestPulse.topCategory.replace(/_/g, " ")}` : null,
        ].filter(Boolean).join("\n"),
      },
    });

    // Stale tickets (no response >24h)
    if (staleTickets.length > 0) {
      blocks.push({ type: "divider" });
      blocks.push({
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*⚠️ ${staleTickets.length} Stale Ticket${staleTickets.length !== 1 ? "s" : ""} (no response >24h)*`,
        },
      });

      for (const t of staleTickets.slice(0, 5)) {
        const age = Math.round((now.getTime() - new Date(t.created_datetime).getTime()) / 3600000);
        blocks.push({
          type: "section",
          text: {
            type: "mrkdwn",
            text: `*#${t.id}* — ${t.subject}\n${t.assignee?.split("@")[0] ?? "unassigned"} · ${age}h since last update`,
          },
          accessory: {
            type: "button",
            text: { type: "plain_text", text: "Reply →" },
            action_id: "open_reply_modal",
            value: JSON.stringify({ ticketId: t.id, tags: [], subject: t.subject.slice(0, 100) }),
          },
        });
      }

      if (staleTickets.length > 5) {
        blocks.push({
          type: "context",
          elements: [{ type: "mrkdwn", text: `_…and ${staleTickets.length - 5} more stale tickets_` }],
        });
      }
    }

    // SLA breaches
    if (slaBreaches.length > 0) {
      blocks.push({ type: "divider" });
      blocks.push({
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*🚨 ${slaBreaches.length} SLA Breach${slaBreaches.length !== 1 ? 'es' : ''} (open >4h without response)*`,
        },
      });
      for (const t of slaBreaches.slice(0, 3)) {
        const ageH = Math.round((now.getTime() - new Date(t.created_datetime).getTime()) / 3600000);
        blocks.push({
          type: "section",
          text: {
            type: "mrkdwn",
            text: `*#${t.id}* — ${t.subject}\n${t.assignee?.split("@")[0] ?? "unassigned"} · ${ageH}h open`,
          },
          accessory: {
            type: "button",
            text: { type: "plain_text", text: "Reply →" },
            action_id: "open_reply_modal",
            value: JSON.stringify({ ticketId: t.id, tags: [], subject: t.subject.slice(0, 100) }),
          },
        });
      }
    }

    // Queue status
    if (queuedOps > 0) {
      blocks.push({ type: "divider" });
      blocks.push({
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*🔄 Offline Queue:* ${queuedOps} queued operations awaiting retry`,
        },
      });
    }

    const fallbackText = `Daily standup: ${latestPulse?.openTickets ?? 0} open tickets, ${staleTickets.length} stale, ${overnightBehavior} overnight actions`;

    await sendSlackBlocks(fallbackText, blocks, undefined, undefined, "ops");

    return NextResponse.json({
      ok: true,
      openTickets: latestPulse?.openTickets ?? 0,
      staleTickets: staleTickets.length,
      overnightActions: overnightBehavior,
      queuedOps,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[daily-standup] Error:", msg);
    await logCronError({ metric: "daily-standup", error: msg }).catch(() => {});
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
