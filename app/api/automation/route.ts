// Automation Control API — tier overrides, routing rules, macro analytics, T3 audit feed.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const maxDuration = 30;

// --- GET ---

export async function GET(request: NextRequest) {
  // No auth on automation API — single-tenant internal tool.
  // Dashboard calls this from the browser (AutomationControlTab).
  // For client-facing access control, use Vercel password protection
  // or Sign in with Vercel on the deployment.
  const section = request.nextUrl.searchParams.get("section") ?? "overview";

  try {
    switch (section) {
      case "overrides":
        return NextResponse.json(await getTierOverrides());
      case "routing":
        return NextResponse.json(await getRoutingRules());
      case "macros":
        return NextResponse.json(await getMacroAnalytics());
      case "t3-audit":
        return NextResponse.json(await getT3AuditFeed());
      default:
        return NextResponse.json({ error: `Unknown section: ${section}` }, { status: 400 });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[automation] GET error:", msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

// --- POST ---

export async function POST(request: NextRequest) {
  // No auth — same as GET. See comment above.
  try {
    const body = await request.json() as {
      action: string;
      category?: string;
      tier?: string;
      reason?: string;
      routing?: Record<string, string>;
    };

    switch (body.action) {
      case "set-tier": {
        if (!body.category || !body.tier) {
          return NextResponse.json({ error: "category and tier required" }, { status: 400 });
        }
        await setTierOverride(body.category, body.tier, body.reason ?? "");
        return NextResponse.json({ ok: true });
      }
      case "clear-tier": {
        if (!body.category) {
          return NextResponse.json({ error: "category required" }, { status: 400 });
        }
        await clearTierOverride(body.category);
        return NextResponse.json({ ok: true });
      }
      case "update-routing": {
        if (!body.routing) {
          return NextResponse.json({ error: "routing required" }, { status: 400 });
        }
        await updateRoutingRules(body.routing);
        return NextResponse.json({ ok: true });
      }
      default:
        return NextResponse.json({ error: `Unknown action: ${body.action}` }, { status: 400 });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[automation] POST error:", msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

// --- Tier overrides ---

interface TierOverride {
  tier: string;
  reason: string;
  changedAt: string;
}

interface TierHistoryEntry {
  category: string;
  fromTier: string;
  toTier: string;
  reason: string;
  changedAt: string;
}

async function getTierOverrides() {
  const [overridesConfig, historyConfig] = await Promise.all([
    prisma.dashboardConfig.findUnique({ where: { key: "tier_overrides" } }),
    prisma.dashboardConfig.findUnique({ where: { key: "tier_history" } }),
  ]);

  return {
    overrides: (overridesConfig?.value ?? {}) as unknown as Record<string, TierOverride>,
    history: (historyConfig?.value ?? []) as unknown as TierHistoryEntry[],
  };
}

async function setTierOverride(category: string, tier: string, reason: string) {
  const [overridesConfig, historyConfig] = await Promise.all([
    prisma.dashboardConfig.findUnique({ where: { key: "tier_overrides" } }),
    prisma.dashboardConfig.findUnique({ where: { key: "tier_history" } }),
  ]);

  const overrides = (overridesConfig?.value ?? {}) as unknown as Record<string, TierOverride>;
  const history = (historyConfig?.value ?? []) as unknown as TierHistoryEntry[];

  const fromTier = overrides[category]?.tier ?? "auto";
  const changedAt = new Date().toISOString();

  overrides[category] = { tier, reason, changedAt };

  const newHistoryEntry: TierHistoryEntry = { category, fromTier, toTier: tier, reason, changedAt };
  const updatedHistory = [newHistoryEntry, ...history].slice(0, 50);

  await Promise.all([
    prisma.dashboardConfig.upsert({
      where: { key: "tier_overrides" },
      create: { key: "tier_overrides", value: overrides as unknown as Record<string, never> },
      update: { value: overrides as unknown as Record<string, never> },
    }),
    prisma.dashboardConfig.upsert({
      where: { key: "tier_history" },
      create: { key: "tier_history", value: updatedHistory as unknown as Record<string, never> },
      update: { value: updatedHistory as unknown as Record<string, never> },
    }),
  ]);
}

async function clearTierOverride(category: string) {
  const overridesConfig = await prisma.dashboardConfig.findUnique({ where: { key: "tier_overrides" } });
  const overrides = (overridesConfig?.value ?? {}) as unknown as Record<string, TierOverride>;
  delete overrides[category];

  await prisma.dashboardConfig.upsert({
    where: { key: "tier_overrides" },
    create: { key: "tier_overrides", value: overrides as unknown as Record<string, never> },
    update: { value: overrides as unknown as Record<string, never> },
  });
}

// --- Routing rules ---

const DEFAULT_ROUTING: Record<string, string> = {
  track_order: "spencer@ironsidecomputers.com",
  order_verification: "danni-jean@ironsidecomputers.com",
  product_question: "spencer@ironsidecomputers.com",
  report_issue: "spencer@ironsidecomputers.com",
  return_exchange: "danni-jean@ironsidecomputers.com",
  order_change_cancel: "danni-jean@ironsidecomputers.com",
  contact_form: "spencer@ironsidecomputers.com",
};

async function getRoutingRules() {
  const config = await prisma.dashboardConfig.findUnique({ where: { key: "agent_routing" } });
  return { routing: (config?.value ?? DEFAULT_ROUTING) as Record<string, string> };
}

async function updateRoutingRules(routing: Record<string, string>) {
  await prisma.dashboardConfig.upsert({
    where: { key: "agent_routing" },
    create: { key: "agent_routing", value: routing },
    update: { value: routing },
  });
}

// --- Macro analytics ---

async function getMacroAnalytics() {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000);

  const rows = await prisma.agentBehaviorLog.groupBy({
    by: ["macroName"],
    where: {
      macroName: { not: null },
      occurredAt: { gte: thirtyDaysAgo },
    },
    _count: { id: true },
    orderBy: { _count: { id: "desc" } },
    take: 15,
  });

  return {
    macros: rows
      .filter((r) => r.macroName)
      .map((r) => ({ name: r.macroName as string, usageCount: r._count.id })),
  };
}

// --- T3 audit feed ---

async function getT3AuditFeed() {
  // Get T3 categories from tier_overrides + computed tiers
  const [overridesConfig, analyticsRows] = await Promise.all([
    prisma.dashboardConfig.findUnique({ where: { key: "tier_overrides" } }),
    prisma.ticketAnalytics.findMany({
      where: { aiMatchesHuman: { not: null } },
      select: { category: true, aiMatchesHuman: true, aiConfidenceScore: true },
    }),
  ]);

  const overrides = (overridesConfig?.value ?? {}) as Record<string, { tier: string }>;

  // Compute T3 categories
  const byCategory = new Map<string, { matches: number; total: number }>();
  for (const row of analyticsRows) {
    const cat = row.category ?? "unknown";
    const entry = byCategory.get(cat) ?? { matches: 0, total: 0 };
    entry.total++;
    if (row.aiMatchesHuman) entry.matches++;
    byCategory.set(cat, entry);
  }

  const t3Categories = new Set<string>();
  for (const [cat, stats] of byCategory) {
    const override = overrides[cat];
    if (override?.tier === "T3") {
      t3Categories.add(cat);
    } else if (!override && stats.total >= 50 && stats.matches / stats.total >= 0.98) {
      t3Categories.add(cat);
    }
  }

  if (t3Categories.size === 0) {
    return { actions: [], t3Categories: [] };
  }

  const actions = await prisma.agentBehaviorLog.findMany({
    where: {
      category: { in: [...t3Categories] },
      action: { in: ["reply", "macro_used", "reply_ticket", "close"] },
    },
    select: {
      id: true,
      ticketId: true,
      ticketSubject: true,
      category: true,
      action: true,
      agent: true,
      macroName: true,
      occurredAt: true,
    },
    orderBy: { occurredAt: "desc" },
    take: 30,
  });

  return {
    t3Categories: [...t3Categories],
    actions: actions.map((a) => ({
      id: a.id,
      ticketId: a.ticketId,
      subject: a.ticketSubject ?? "",
      category: a.category ?? "",
      action: a.action,
      agent: a.agent,
      macroName: a.macroName,
      occurredAt: a.occurredAt.toISOString(),
    })),
  };
}
