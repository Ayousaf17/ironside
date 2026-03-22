import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { loadMacroTemplates, matchMacro } from "@/lib/gorgias/macro-matcher";
import { logCronError } from "@/lib/services/logging.service";

export const maxDuration = 30;

/**
 * Backfills macroIdUsed and macroName on agent behavior logs by comparing
 * response text against known Ironside macro templates using text similarity.
 *
 * Processes 50 un-matched rows per invocation.
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (
    !process.env.CRON_SECRET ||
    authHeader !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Load macro templates from DB (synced from Gorgias via /api/cron/sync-macros)
    const dbMacros = await prisma.gorgiasMacro.findMany({
      where: { isActive: true },
      select: { gorgiasId: true, name: true, bodyText: true, usageCount: true },
    });

    if (dbMacros.length === 0) {
      return NextResponse.json({ ok: true, matched: 0, message: "No macros in DB. Run /api/cron/sync-macros first." });
    }

    loadMacroTemplates(
      dbMacros.map((m) => ({ id: m.gorgiasId, name: m.name, bodyText: m.bodyText, usage: m.usageCount }))
    );

    // Find agent messages with response text but no macro match
    const rows = await prisma.agentBehaviorLog.findMany({
      where: {
        macroIdUsed: null,
        responseText: { not: null },
        action: "message",
        agent: { not: "system" },
      },
      select: {
        id: true,
        responseText: true,
        ticketId: true,
      },
      take: 50,
      orderBy: { occurredAt: "desc" },
    });

    if (rows.length === 0) {
      return NextResponse.json({ ok: true, matched: 0, message: "No unmatched messages remaining" });
    }

    let matched = 0;
    let noMatch = 0;

    for (const row of rows) {
      if (!row.responseText) { noMatch++; continue; }

      const match = matchMacro(row.responseText);
      if (match) {
        await prisma.agentBehaviorLog.update({
          where: { id: row.id },
          data: {
            macroIdUsed: match.macroId,
            macroName: match.macroName,
          },
        });
        matched++;
      } else {
        noMatch++;
      }
    }

    const remaining = await prisma.agentBehaviorLog.count({
      where: {
        macroIdUsed: null,
        responseText: { not: null },
        action: "message",
        agent: { not: "system" },
      },
    });

    console.log(`[backfill-macros] Matched ${matched}/${rows.length}, ${noMatch} no match, ${remaining} remaining`);
    return NextResponse.json({ ok: true, matched, noMatch, processed: rows.length, remaining });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("[cron/backfill-macros] Error:", errorMessage);
    await logCronError({ metric: "cron_backfill_macros_error", error: errorMessage });
    return NextResponse.json({ ok: false, error: errorMessage }, { status: 500 });
  }
}
