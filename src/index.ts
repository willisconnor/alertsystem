import { startSSEClient, MetricEvent, ConnectionStatus } from "./sse-client";
import { evaluate, Rule } from "./rule-engine";
import { notify } from "./notifier";
import "dotenv/config";

export interface Alert {
  ruleName: string;
  source: string;
  metric: string;
  actualValue: number;
  thresholdCondition: string;
  eventTimestamp: string;
  alertTriggeredAt: string;
}

export const alerts: Alert[] = [];

function buildAlert(rule: Rule, event: MetricEvent): Alert {
  return {
    ruleName: rule.name,
    source: event.source,
    metric: event.metric,
    actualValue: event.value,
    thresholdCondition: `${rule.metric} ${rule.operator} ${rule.threshold}`,
    eventTimestamp: event.timestamp,
    alertTriggeredAt: new Date().toISOString(),
  };
}

function printAlert(alert: Alert): void {
  console.log("─".repeat(50));
  console.log(`ALERT: ${alert.ruleName}`);
  console.log(`  Source    : ${alert.source}`);
  console.log(`  Metric    : ${alert.metric}`);
  console.log(`  Condition : ${alert.thresholdCondition}`);
  console.log(`  Value     : ${alert.actualValue}`);
  console.log(`  Event at  : ${alert.eventTimestamp}`);
  console.log(`  Alerted at: ${alert.alertTriggeredAt}`);
  console.log("─".repeat(50));
}

startSSEClient(
  (event: MetricEvent) => {
    const triggered = evaluate(event);
    for (const rule of triggered) {
      const alert = buildAlert(rule, event);
      alerts.push(alert);
      printAlert(alert);
      notify(alert).catch((err) =>
        console.error("[Notifier] Unhandled error:", err),
      );
    }
  },
  (status: ConnectionStatus, detail?: string) => {
    const suffix = detail ? ` — ${detail}` : "";
    switch (status) {
      case "connecting":
        console.log(`[SSE] Connecting${suffix}`);
        break;
      case "connected":
        console.log("[SSE] Connected");
        break;
      case "error":
        console.error("[SSE] Stream error");
        break;
      case "disconnected":
        console.error(`[SSE] Disconnected${suffix}`);
        break;
    }
  },
);
