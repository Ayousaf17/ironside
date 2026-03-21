import { cn } from "@/lib/utils";

type DotStatus = "good" | "warn" | "bad" | "info" | "neutral";

interface StatusDotProps {
  status: DotStatus;
  pulse?: boolean;
  className?: string;
}

const colorMap: Record<DotStatus, string> = {
  good: "bg-status-good",
  warn: "bg-status-warn",
  bad: "bg-status-bad",
  info: "bg-status-info",
  neutral: "bg-slate-400",
};

export function StatusDot({ status, pulse = false, className }: StatusDotProps) {
  return (
    <span className={cn("relative inline-flex h-2.5 w-2.5", className)}>
      {pulse && (
        <span
          className={cn(
            "absolute inline-flex h-full w-full animate-ping rounded-full opacity-75",
            colorMap[status],
          )}
        />
      )}
      <span
        className={cn("relative inline-flex h-2.5 w-2.5 rounded-full", colorMap[status])}
      />
    </span>
  );
}
