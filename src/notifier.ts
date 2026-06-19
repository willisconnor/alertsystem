import { Alert } from "./index";

export async function notify(alert: Alert): Promise<void> {
  const webhookUrl = process.env.WEBHOOK_URL;
  if (!webhookUrl) {
    mockNotify(alert);
    return;
  }

  const body = JSON.stringify({
    embeds: [
      {
        title: `ALERT: ${alert.ruleName}`,
        color: 0xff4444,
        fields: [
          { name: "Source",    value: alert.source,              inline: true },
          { name: "Metric",    value: alert.metric,              inline: true },
          { name: "Condition", value: alert.thresholdCondition,  inline: true },
          { name: "Value",     value: String(alert.actualValue), inline: true },
          { name: "Event at",  value: alert.eventTimestamp,      inline: false },
        ],
        timestamp: alert.alertTriggeredAt,
      },
    ],
  });

  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    });

    if (!res.ok) {
      console.error(`[Notifier] Webhook POST failed: ${res.status} ${res.statusText}`);
    }
  } catch (err) {
    console.error("[Notifier] Webhook POST threw:", err);
  }
}

function mockNotify(alert: Alert): void {
  console.log("[Notifier] No WEBHOOK_URL set — mock delivery:");
  console.log(`  Rule Name : ${alert.ruleName}`);
  console.log(`  Source    : ${alert.source}`);
  console.log(`  Metric    : ${alert.metric}`);
  console.log(`  Value     : ${alert.actualValue}`);
  console.log(`  Condition : ${alert.thresholdCondition}`);
  console.log(`  Event at  : ${alert.eventTimestamp}`);
  console.log(`  Alerted at: ${alert.alertTriggeredAt}`);
}
