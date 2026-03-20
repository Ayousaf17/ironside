import { prisma } from "@/lib/prisma";

const DEFAULT_ROUTING: Record<string, string> = {
  track_order: "spencer@ironsidecomputers.com",
  order_verification: "danni-jean@ironsidecomputers.com",
  product_question: "spencer@ironsidecomputers.com",
  report_issue: "spencer@ironsidecomputers.com",
  return_exchange: "danni-jean@ironsidecomputers.com",
  order_change_cancel: "danni-jean@ironsidecomputers.com",
  contact_form: "spencer@ironsidecomputers.com",
};

let cachedRouting: Record<string, string> | null = null;
let cacheExpiry = 0;

export async function getAgentRouting(): Promise<Record<string, string>> {
  if (cachedRouting && Date.now() < cacheExpiry) return cachedRouting;
  try {
    const config = await prisma.dashboardConfig.findUnique({ where: { key: "agent_routing" } });
    if (!config) {
      // Auto-seed defaults so the dashboard can edit them later
      await prisma.dashboardConfig.create({
        data: { key: "agent_routing", value: DEFAULT_ROUTING },
      });
      cachedRouting = DEFAULT_ROUTING;
    } else {
      cachedRouting = config.value as Record<string, string>;
    }
    cacheExpiry = Date.now() + 5 * 60 * 1000; // 5 min cache
    return cachedRouting;
  } catch {
    return DEFAULT_ROUTING;
  }
}

// All active agents for round-robin distribution
const AGENTS = [
  "spencer@ironsidecomputers.com",
  "danni-jean@ironsidecomputers.com",
];

let roundRobinIndex = 0;

export async function getAgentEmailForCategory(category: string): Promise<string | null> {
  const routing = await getAgentRouting();
  const preferred = routing[category];
  if (!preferred) return null;

  // Check today's assignment counts — route to the agent with fewer assignments
  try {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const counts = await prisma.agentBehaviorLog.groupBy({
      by: ["agent"],
      where: {
        action: "assign",
        occurredAt: { gte: todayStart },
        agent: { in: AGENTS },
      },
      _count: { id: true },
    });

    const countMap = new Map(counts.map((c) => [c.agent, c._count.id]));
    const sorted = AGENTS
      .map((a) => ({ agent: a, count: countMap.get(a) ?? 0 }))
      .sort((a, b) => a.count - b.count);

    // If workloads differ by >3, route to the lighter agent
    if (sorted.length >= 2 && sorted[1].count - sorted[0].count > 3) {
      return sorted[0].agent;
    }
  } catch {
    // Fall through to preferred routing on DB error
  }

  // Within threshold — use category-preferred agent with round-robin tiebreak
  // for categories that don't have a strong preference
  if (category === "contact_form" || category === "other") {
    const agent = AGENTS[roundRobinIndex % AGENTS.length];
    roundRobinIndex++;
    return agent;
  }

  return preferred;
}

export async function getAgentEmailByName(name: "spencer" | "danni"): Promise<string> {
  const routing = await getAgentRouting();
  const entry = Object.values(routing).find((email) => email.toLowerCase().includes(name));
  return entry ?? (name === "spencer" ? "spencer@ironsidecomputers.com" : "danni-jean@ironsidecomputers.com");
}
