import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

interface MetricCardProps {
  label: string;
  value: string | number;
  delta?: number;
  deltaInverted?: boolean;
  icon?: LucideIcon;
  unit?: string;
  className?: string;
}

export function MetricCard({
  label,
  value,
  delta,
  deltaInverted = false,
  icon: Icon,
  unit,
  className,
}: MetricCardProps) {
  const isPositive = delta !== undefined && delta >= 0;
  const isGood = deltaInverted ? !isPositive : isPositive;

  return (
    <div
      className={cn(
        "bg-white rounded-xl border border-slate-200 shadow-sm p-5 hover:shadow-md transition-shadow duration-150",
        className,
      )}
    >
      <div className="flex items-start justify-between">
        <p className="text-sm font-medium text-slate-500">{label}</p>
        {Icon && <Icon className="h-4 w-4 text-slate-400" />}
      </div>
      <div className="mt-2 flex items-baseline gap-1">
        <span className="metric text-2xl font-bold text-slate-900">
          {value}
        </span>
        {unit && <span className="text-sm text-slate-500">{unit}</span>}
      </div>
      {delta !== undefined && (
        <p
          className={cn(
            "mt-1 text-xs font-medium",
            isGood ? "text-emerald-600" : "text-red-600",
          )}
        >
          {isPositive ? "+" : ""}
          {delta}%
        </p>
      )}
    </div>
  );
}
