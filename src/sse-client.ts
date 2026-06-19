import EventSource from "eventsource";

export interface MetricEvent {
  id: string;
  source: string;
  metric: string;
  value: number;
  timestamp: string;
}

export type ConnectionStatus = "connecting" | "connected" | "error" | "disconnected";

const BACKOFF_INITIAL_MS = 1_000;
const BACKOFF_MAX_MS = 30_000;

export function startSSEClient(
  onEvent: (event: MetricEvent) => void,
  onStatus: (status: ConnectionStatus, detail?: string) => void = () => {},
  url: string = "http://localhost:4000/events",
): void {
  let delay = BACKOFF_INITIAL_MS;

  function connect(): void {
    onStatus("connecting", url);
    const es = new EventSource(url);

    es.onopen = () => {
      delay = BACKOFF_INITIAL_MS;
      onStatus("connected");
    };

    es.onmessage = (msg) => {
      let raw: unknown;
      try {
        raw = JSON.parse(msg.data);
      } catch {
        console.error("[SSE] Malformed JSON, skipping:", msg.data);
        return;
      }

      const event = validateEvent(raw);
      if (event === null) return;

      onEvent(event);
    };

    es.onerror = () => {
      // Close immediately to stop the built-in reconnect loop.
      es.close();
      onStatus("error");
      const waitSec = delay / 1000;
      onStatus("disconnected", `retrying in ${waitSec}s`);
      setTimeout(() => {
        delay = Math.min(delay * 2, BACKOFF_MAX_MS);
        connect();
      }, delay);
    };
  }

  connect();
}

function validateEvent(raw: unknown): MetricEvent | null {
  if (typeof raw !== "object" || raw === null) {
    console.error("[SSE] Event is not an object, skipping:", raw);
    return null;
  }
  const o = raw as Record<string, unknown>;
  const missing: string[] = [];

  if (typeof o.id !== "string")        missing.push("id");
  if (typeof o.source !== "string")    missing.push("source");
  if (typeof o.metric !== "string")    missing.push("metric");
  if (typeof o.timestamp !== "string") missing.push("timestamp");

  if (typeof o.value !== "number") {
    missing.push("value (expected number, got " + typeof o.value + ")");
  } else if (!Number.isFinite(o.value)) {
    console.error(`[SSE] Field "value" is non-numeric (${o.value}), skipping.`);
    return null;
  }

  if (missing.length > 0) {
    console.error(`[SSE] Missing or invalid fields — ${missing.join(", ")} — skipping:`, raw);
    return null;
  }

  return raw as MetricEvent;
}
