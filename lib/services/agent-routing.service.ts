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

export async function getAgentEmailForCategory(category: string): Promise<string | null> {
  const routing = await getAgentRouting();
  return routing[category] ?? null;
}

export async function getAgentEmailByName(name: "spencer" | "danni"): Promise<string> {
  const routing = await getAgentRouting();
  const entry = Object.values(routing).find((email) => email.toLowerCase().includes(name));
  return entry ?? (name === "spencer" ? "spencer@ironsidecomputers.com" : "danni-jean@ironsidecomputers.com");
}
