import { cn } from "@/lib/utils";
import { StatusDot } from "./status-dot";

interface DashboardHeaderProps {
  systemStatus: "healthy" | "degraded" | "down";
  lastPulse: string | null;
  queuedOps: number;
}

const statusMap: Record<string, { dot: "good" | "warn" | "bad"; label: string }> = {
  healthy: { dot: "good", label: "All systems operational" },
  degraded: { dot: "warn", label: "Degraded performance" },
  down: { dot: "bad", label: "System down" },
};

function formatPulseTime(iso: string): string {
  const d = new Date(iso);
  return `Data from ${d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })}`;
}

export function DashboardHeader({
  systemStatus,
  lastPulse,
  queuedOps,
}: DashboardHeaderProps) {
  const { dot, label } = statusMap[systemStatus];

  return (
    <header className="no-print flex h-14 items-center justify-between bg-ironside-black px-6 py-3 text-white sm:flex-row flex-col gap-2 sm:h-14 h-auto">
      <h1 className="text-sm font-semibold tracking-wide">Ironside Support</h1>
      <div className="flex items-center gap-4 text-xs">
        {queuedOps > 0 && (
          <span className="inline-flex items-center gap-1 text-amber-400 font-medium">
            {queuedOps} queued
          </span>
        )}
        <div className="flex items-center gap-1.5">
          <StatusDot status={dot} pulse={systemStatus !== "healthy"} />
          <span className="text-slate-300">{label}</span>
        </div>
        {lastPulse && (
          <span className="text-slate-400">{formatPulseTime(lastPulse)}</span>
        )}
      </div>
    </header>
  );
}
