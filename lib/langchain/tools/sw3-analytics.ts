// LangChain DynamicTool wrapping the SW3 analytics workflow.
// n8n equivalent: SW3_AnalyticsInsights sub-workflow (Fetch Tickets → Calculate → Insights)

import { DynamicTool } from "@langchain/core/tools";
import { getTickets } from "@/lib/gorgias/client";
import { calculateAnalytics } from "@/lib/analytics/calculate";

export const sw3AnalyticsTool = new DynamicTool({
  name: "sw3_analytics_insights",
  description:
    "Fetch and analyze Gorgias support tickets. Returns ticket counts, response times, channel breakdown, and actionable insights.",
  func: async () => {
    const tickets = await getTickets();
    const analytics = calculateAnalytics(tickets);
    return JSON.stringify(analytics, null, 2);
  },
});
