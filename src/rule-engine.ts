import { MetricEvent } from "./sse-client";
import rulesData from "./rules.json";

export interface Rule {
  name: string;
  source: string;
  metric: string;
  operator: ">" | ">=" | "<" | "<=" | "=";
  threshold: number;
  cooldownSeconds: number;
  enabled: boolean;
}

const VALID_OPERATORS = new Set([">", ">=", "<", "<=", "="]);

const rules: Rule[] = (rulesData as unknown[]).flatMap((r, i) => {
  if (typeof r !== "object" || r === null) {
    console.warn(`[Rules] Entry at index ${i} is not an object, skipping.`);
    return [];
  }
  const o = r as Record<string, unknown>;
  const bad: string[] = [];

  if (typeof o.name !== "string")                                       bad.push("name");
  if (typeof o.source !== "string")                                     bad.push("source");
  if (typeof o.metric !== "string")                                     bad.push("metric");
  if (!VALID_OPERATORS.has(o.operator as string))                       bad.push(`operator ("${o.operator}")`);
  if (typeof o.threshold !== "number" || !Number.isFinite(o.threshold)) bad.push("threshold");
  if (typeof o.cooldownSeconds !== "number" || !Number.isFinite(o.cooldownSeconds)) bad.push("cooldownSeconds");
  if (typeof o.enabled !== "boolean")                                   bad.push("enabled");

  if (bad.length > 0) {
    console.warn(`[Rules] Rule "${o.name ?? i}" has invalid fields — ${bad.join(", ")} — skipping.`);
    return [];
  }
  return [r as Rule];
});

// Keyed by rule name; stores the last time (ms) the rule fired an alert.
const lastFired = new Map<string, number>();

export function evaluate(event: MetricEvent): Rule[] {
  const triggered: Rule[] = [];
  const now = Date.now();

  for (const rule of rules) {
    if (!rule.enabled) continue;
    if (rule.source !== "" && rule.source !== event.source) continue;
    if (rule.metric !== event.metric) continue;
    if (!matchesThreshold(event.value, rule.operator, rule.threshold)) continue;

    const last = lastFired.get(rule.name);
    if (last !== undefined && now - last < rule.cooldownSeconds * 1000) continue;

    lastFired.set(rule.name, now);
    triggered.push(rule);
  }

  return triggered;
}

function matchesThreshold(value: number, operator: Rule["operator"], threshold: number): boolean {
  switch (operator) {
    case ">":  return value > threshold;
    case ">=": return value >= threshold;
    case "<":  return value < threshold;
    case "<=": return value <= threshold;
    case "=":  return value === threshold;
    default:
      console.error(`[Rules] Unknown operator "${String(operator)}", skipping rule.`);
      return false;
  }
}
