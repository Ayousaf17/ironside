import { createApiLog } from "@/lib/repos/api-log.repo";
import { createPerformanceMetric } from "@/lib/repos/performance-metric.repo";

export function logApiCall(opts: {
  endpoint: string;
  method: string;
  status: number;
  request?: object;
  response?: object;
  duration?: number;
  actorUser?: string;
  slackChannel?: string;
  slackThreadTs?: string;
  ticketId?: number;
  intent?: string;
  toolsUsed?: string[];
  sessionId?: string;
}) {
  return createApiLog(opts);
}

export function logApiError(opts: {
  endpoint: string;
  method: string;
  request?: object;
  error: string;
  duration?: number;
}) {
  return createApiLog({ ...opts, status: 500 });
}

export function logWebhookError(opts: {
  endpoint: string;
  error: string;
  duration?: number;
}) {
  return createPerformanceMetric({
    metric: "webhook_error",
    value: 1,
    unit: "count",
    context: { error: opts.error, endpoint: opts.endpoint, duration: opts.duration },
  });
}

export function logCronError(opts: {
  metric: string;
  error: string;
}) {
  return createPerformanceMetric({
    metric: opts.metric,
    value: 1,
    unit: "count",
    context: { error: opts.error },
  });
}
