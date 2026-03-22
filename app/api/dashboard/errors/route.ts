import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const maxDuration = 30;

interface ErrorEntry {
  type: string;
  count: number;
  latestAt: string;
}

export async function GET() {
  try {
    const sevenDaysAgo = new Date(Date.now() - 7 * 86400000);
    const oneDayAgo = new Date(Date.now() - 86400000);

    const rows = await prisma.performanceMetric.findMany({
      where: {
        createdAt: { gte: sevenDaysAgo },
        metric: { contains: "error" },
      },
      select: { metric: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    });

    // Group by metric type
    const grouped = new Map<string, { count: number; latestAt: Date; last24h: number }>();
    for (const row of rows) {
      const existing = grouped.get(row.metric);
      const isRecent = row.createdAt >= oneDayAgo;
      if (existing) {
        existing.count++;
        if (isRecent) existing.last24h++;
        if (row.createdAt > existing.latestAt) existing.latestAt = row.createdAt;
      } else {
        grouped.set(row.metric, {
          count: 1,
          latestAt: row.createdAt,
          last24h: isRecent ? 1 : 0,
        });
      }
    }

    const errors: ErrorEntry[] = Array.from(grouped.entries())
      .map(([type, data]) => ({
        type,
        count: data.last24h,
        latestAt: data.latestAt.toISOString(),
      }))
      .filter((e) => e.count > 0)
      .sort((a, b) => b.count - a.count);

    return NextResponse.json({ errors, hasErrors: errors.length > 0 });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    console.error("[dashboard/errors] Error:", errorMessage);
    return NextResponse.json(
      { errors: [], hasErrors: false, error: errorMessage },
      { status: 500 }
    );
  }
}
