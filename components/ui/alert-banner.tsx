import { cn } from "@/lib/utils";
import { AlertTriangle, Clock, TrendingUp } from "lucide-react";

type AlertType = "spike" | "sla" | "stale";

interface Alert {
  type: AlertType;
  message: string;
}

interface AlertBannerProps {
  alerts: Alert[];
}

const config: Record<AlertType, { icon: typeof TrendingUp; colors: string }> = {
  spike: { icon: TrendingUp, colors: "bg-amber-50 text-amber-800 border-amber-200" },
  sla: { icon: Clock, colors: "bg-red-50 text-red-800 border-red-200" },
  stale: { icon: AlertTriangle, colors: "bg-orange-50 text-orange-800 border-orange-200" },
};

export function AlertBanner({ alerts }: AlertBannerProps) {
  if (alerts.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2">
      {alerts.map((alert, i) => {
        const { icon: Icon, colors } = config[alert.type];
        return (
          <div
            key={`${alert.type}-${i}`}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium",
              colors,
            )}
          >
            <Icon className="h-3.5 w-3.5 shrink-0" />
            {alert.message}
          </div>
        );
      })}
    </div>
  );
}
