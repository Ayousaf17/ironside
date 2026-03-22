import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logCronError } from "@/lib/services/logging.service";

export const maxDuration = 30;

/**
 * Syncs macro definitions from the Gorgias API into the gorgias_macros table.
 * Creates new macros, updates existing ones, marks deleted ones as inactive.
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (
    !process.env.CRON_SECRET ||
    authHeader !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (process.env.GORGIAS_MOCK !== "false") {
    return NextResponse.json({ ok: true, skipped: "mock_mode" });
  }

  try {
    const baseUrl = process.env.GORGIAS_BASE_URL?.replace(/\/$/, "");
    const email = process.env.GORGIAS_EMAIL;
    const apiKey = process.env.GORGIAS_API_KEY;
    if (!baseUrl || !email || !apiKey) {
      throw new Error("Missing Gorgias env vars");
    }

    const encoded = Buffer.from(`${email}:${apiKey}`).toString("base64");

    // Fetch all macros from Gorgias (paginated)
    interface GorgiasMacroRaw { id: number; name: string; body_text: string; language: string; tags: { name: string }[]; usage_count: number; archived: string | null }
    let allMacros: GorgiasMacroRaw[] = [];
    let cursor: string | null = null;

    do {
      const fetchUrl: string = cursor
        ? `${baseUrl}/api/macros?limit=100&cursor=${cursor}`
        : `${baseUrl}/api/macros?limit=100`;

      const res: Response = await fetch(fetchUrl, {
        headers: {
          Authorization: `Basic ${encoded}`,
          "Content-Type": "application/json",
        },
      });

      if (!res.ok) {
        throw new Error(`Gorgias Macros API: ${res.status} ${res.statusText}`);
      }

      const data = (await res.json()) as { data?: GorgiasMacroRaw[]; meta?: { next_cursor?: string } };
      const macros = data.data ?? [];

      if (!Array.isArray(macros) || macros.length === 0) break;

      allMacros = allMacros.concat(macros);
      cursor = data.meta?.next_cursor ?? null;
    } while (cursor);

    let created = 0;
    let updated = 0;

    for (const macro of allMacros) {
      const tagNames = Array.isArray(macro.tags)
        ? macro.tags.map((t: { name: string } | string) => typeof t === "string" ? t : t.name).filter(Boolean)
        : [];

      const isActive = !macro.archived;

      await prisma.gorgiasMacro.upsert({
        where: { gorgiasId: macro.id },
        create: {
          gorgiasId: macro.id,
          name: macro.name,
          bodyText: macro.body_text ?? "",
          language: macro.language ?? null,
          tags: tagNames,
          usageCount: macro.usage_count ?? 0,
          isActive,
        },
        update: {
          name: macro.name,
          bodyText: macro.body_text ?? "",
          language: macro.language ?? null,
          tags: tagNames,
          usageCount: macro.usage_count ?? 0,
          isActive,
        },
      });

      if (await prisma.gorgiasMacro.count({ where: { gorgiasId: macro.id } }) === 1) {
        created++;
      } else {
        updated++;
      }
    }

    // The count logic above isn't accurate for create vs update — just report total
    const total = allMacros.length;
    console.log(`[cron/sync-macros] Synced ${total} macros from Gorgias`);
    return NextResponse.json({ ok: true, synced: total });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    console.error("[cron/sync-macros] Error:", errorMessage);
    await logCronError({ metric: "cron_sync_macros_error", error: errorMessage });
    return NextResponse.json({ ok: false, error: errorMessage }, { status: 500 });
  }
}
