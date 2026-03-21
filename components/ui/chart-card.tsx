import { cn } from "@/lib/utils";

export function ChartCardSkeleton() {
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 animate-pulse">
      <div className="h-4 w-32 bg-slate-200 rounded mb-4" />
      <div className="h-64 bg-slate-100 rounded-lg" />
    </div>
  );
}

interface ChartCardProps {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  action?: React.ReactNode;
  lastUpdated?: string;
  className?: string;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return `Data from ${d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })}`;
}

export function ChartCard({
  title,
  subtitle,
  children,
  action,
  lastUpdated,
  className,
}: ChartCardProps) {
  return (
    <div
      className={cn(
        "bg-white rounded-xl border border-slate-200 shadow-sm p-6",
        className,
      )}
    >
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
          {subtitle && (
            <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>
          )}
        </div>
        {action}
      </div>
      {children}
      {lastUpdated && (
        <p className="mt-3 text-[11px] text-slate-400">
          {formatTime(lastUpdated)}
        </p>
      )}
    </div>
  );
}
