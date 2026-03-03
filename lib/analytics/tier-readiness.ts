import { prisma } from "@/lib/prisma";

interface CategoryReadiness {
  category: string;
  ticketCount: number;
  avgConfidence: number;
  accuracy: number;
  tier: "T1" | "T2" | "T3" | "insufficient_data";
}

// Tier thresholds from graduated autonomy plan
const TIER_THRESHOLDS = {
  T2: { minAccuracy: 0.9, minTickets: 20 },   // 90% accuracy, 20+ tickets
  T3: { minAccuracy: 0.98, minTickets: 50 },   // 98% accuracy, 50+ tickets
};

export async function getTierReadiness(): Promise<CategoryReadiness[]> {
  const analytics = await prisma.ticketAnalytics.findMany({
    where: { aiMatchesHuman: { not: null } },
  });

  // Group by category
  const byCategory = new Map<string, typeof analytics>();
  for (const row of analytics) {
    const cat = row.category || "unknown";
    if (!byCategory.has(cat)) byCategory.set(cat, []);
    byCategory.get(cat)!.push(row);
  }

  const results: CategoryReadiness[] = [];

  for (const [category, rows] of byCategory) {
    const ticketCount = rows.length;
    const avgConfidence =
      rows.reduce((sum, r) => sum + (r.aiConfidenceScore || 0), 0) / ticketCount;
    const matches = rows.filter((r) => r.aiMatchesHuman === true).length;
    const accuracy = ticketCount > 0 ? matches / ticketCount : 0;

    let tier: CategoryReadiness["tier"] = "T1";
    if (ticketCount < TIER_THRESHOLDS.T2.minTickets) {
      tier = "insufficient_data";
    } else if (
      accuracy >= TIER_THRESHOLDS.T3.minAccuracy &&
      ticketCount >= TIER_THRESHOLDS.T3.minTickets
    ) {
      tier = "T3";
    } else if (accuracy >= TIER_THRESHOLDS.T2.minAccuracy) {
      tier = "T2";
    }

    results.push({ category, ticketCount, avgConfidence, accuracy, tier });
  }

  return results.sort((a, b) => b.accuracy - a.accuracy);
}
