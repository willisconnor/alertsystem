# Real-Time Alert System

A configurable, real-time metric alert system that consumes a Server-Sent Events stream, evaluates incoming events against user-defined rules, and delivers alerts through one (CLI) or more notification channels (Webhook).

With the webhook, I utilized webhook.site in order to properly test this. However, webhook.site requires a personal secret in order to use. As per the assignment instructions, this is not allowed, but it helped conceptualize the webhook integration, and stand in for a proof of concept.

---

## Use Case

Putting on my Product hat, this could be built for on-call triage on high-traffic services. An engineer monitoring five services during a Black Friday sale shouldn't have to manually scan dashboards. This system sits between the metric stream and the engineer, firing a single alert when a threshold is breached and staying quiet during the cooldown window so the engineer can investigate without being paged 60 times a minute for the same degraded service.

---

## Features

- Connects to an SSE stream and tracks connection state (Connecting, Connected, Error, Disconnected)
- Exponential backoff reconnection (1s → 2s → … → 30s cap) on stream failure
- Rule-based alert evaluation with five operators: `>`, `>=`, `<`, `<=`, `=`
- Per-rule cooldown window to suppress duplicate alerts
- Rules support a wildcard source (`""`) to match events from any service
- Webhook delivery via `WEBHOOK_URL` environment variable; falls back to a formatted console mock when unset
- Strict input validation; malformed JSON, missing fields, and non-numeric values are logged and skipped without crashing

---

## Project Structure

```
src/
  index.ts          # Entry point
  sse-client.ts     # SSE connection, reconnect backoff, event parsing and validation
  rule-engine.ts    # Loads rules.json, evaluates events, enforces cooldown
  notifier.ts       # Discord webhook delivery (mock fallback when URL not set)
  rules.json        # Alert rule definitions
  __tests__/
    rule-engine.test.ts
    sse-client.test.ts
mock-sse-server.js  # Local SSE server for development and demo
```

---

## Getting Started

### Prerequisites

- Node.js 18+
- npm

### Install

```bash
npm install
```

### Run (development)

Start the mock SSE server in one terminal:

```bash
node mock-sse-server.js
```

Start the alert system in another:

```bash
npm run dev
```

---

## Configuration

### Rules (`src/rules.json`)

Rules are defined as a JSON array. Each rule has:

| Field             | Type    | Description                                            |
| ----------------- | ------- | ------------------------------------------------------ |
| `name`            | string  | Human-readable rule label                              |
| `source`          | string  | Service name to match. Use `""` to match any source.   |
| `metric`          | string  | Metric name to match (e.g. `error_rate`, `latency_ms`) |
| `operator`        | string  | One of `>`, `>=`, `<`, `<=`, `=`                       |
| `threshold`       | number  | Value to compare against                               |
| `cooldownSeconds` | number  | Minimum seconds between alerts for the same rule       |
| `enabled`         | boolean | Set to `false` to disable without deleting the rule    |

**Example:**

```json
[
  {
    "name": "Checkout high error rate",
    "source": "checkout-api",
    "metric": "error_rate",
    "operator": ">",
    "threshold": 5,
    "cooldownSeconds": 60,
    "enabled": true
  },
  {
    "name": "Any service high latency",
    "source": "",
    "metric": "latency_ms",
    "operator": ">=",
    "threshold": 1000,
    "cooldownSeconds": 30,
    "enabled": true
  }
]
```

### Webhook

Run copy .env.example .env to create a local .env with the correct variable name.

Visit webhook.site and paste your given key into the WEBHOOK_URL

If `WEBHOOK_URL` is not set (which, as per assignment instructions, it does not need to be), each alert is printed to the console in a mock-delivery format so the system remains fully functional without an external integration.

Below are images from webhook.site
<img width="933" height="673" alt="webhooksite1" src="https://github.com/user-attachments/assets/a80e4d06-6c63-4f4e-9b15-2b3568b6b5a6" />

<img width="706" height="772" alt="webhooksite2" src="https://github.com/user-attachments/assets/48520d35-0f4a-468b-8790-96f1c45d3c18" />


### SSE Stream URL

The default stream URL is `http://localhost:4000/events`. To point at a different endpoint, pass the URL as the third argument to `startSSEClient` in `src/index.ts`.

---

## Alert Structure

Each triggered alert contains:

| Field                | Description                                      |
| -------------------- | ------------------------------------------------ |
| `ruleName`           | Name of the rule that fired                      |
| `source`             | Source service from the event                    |
| `metric`             | Metric name from the event                       |
| `actualValue`        | The value that triggered the alert               |
| `thresholdCondition` | Human-readable condition (e.g. `error_rate > 5`) |
| `eventTimestamp`     | Timestamp from the incoming event                |
| `alertTriggeredAt`   | Wall-clock time the alert was generated          |

---

## Tests

```bash
npm test
```

Covers:

- Rule matching: source, metric, operator, threshold, wildcard source, disabled rules
- All five operators at their boundary conditions
- Cooldown: first fires, second suppressed, fires again after expiry
- Invalid event handling: malformed JSON, missing fields, non-numeric values
- SSE state: connected, error/disconnected, and reconnection recovery

---

## Scripts

| Command         | Description                   |
| --------------- | ----------------------------- |
| `npm run dev`   | Run the app with `ts-node`    |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm test`      | Run the Jest test suite       |
