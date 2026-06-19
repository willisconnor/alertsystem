# Design Notes

## Main Components

| Component   | File             | Responsibility                                                                                                  |
| ----------- | ---------------- | --------------------------------------------------------------------------------------------------------------- |
| SSE Client  | `sse-client.ts`  | Opens and maintains the event stream, parses and validates incoming payloads, emits typed `MetricEvent` objects |
| Rule Engine | `rule-engine.ts` | Loads rules from `rules.json` at startup, evaluates each event against enabled rules, tracks cooldown state     |
| Notifier    | `notifier.ts`    | Posts alerts to a webhook URL; falls back to a console log when no URL is configured                            |
| Entry Point | `index.ts`       | Wires the three components together, builds `Alert` objects, maintains the in-memory alert log                  |

---

## Data Flow

```
SSE stream
  └─ onmessage fires
       └─ JSON.parse
            └─ validateEvent()           ← rejects malformed / missing / non-numeric
                 └─ evaluate(event)      ← rule engine checks each enabled rule
                      └─ [matched rules]
                           └─ buildAlert()
                                ├─ alerts[]          ← in-memory log
                                ├─ printAlert()      ← console output
                                └─ notify()          ← webhook POST (or console mock)
```

---

## Rule Evaluation Design

Rules are loaded once at module initialisation from `rules.json` and validated at that time. Invalid entries are logged and dropped, the rest are kept in a module-scoped array for the process lifetime.

For each incoming event, `evaluate()` iterates the rule array and applies four short-circuit checks in order:

1. `enabled === false` → skip
2. `rule.source !== event.source` → skip (empty string `""` source is a wildcard that matches any source)
3. `rule.metric !== event.metric` → skip
4. `matchesThreshold(value, operator, threshold)` → skip if condition not met

Supported operators: `>`, `>=`, `<`, `<=`, `=`

Rules that pass all four checks are returned as triggered.

---

## Cooldown / Dedup Design

A module-scoped `Map<ruleName, lastFiredMs>` records the wall-clock time each rule last fired an alert. Before recording a trigger, `evaluate()` checks:

```
now - lastFired[rule.name] < rule.cooldownSeconds * 1000  →  skip
```

The cooldown resets only on an actual trigger, not on events that fail the threshold check. Time is measured with `Date.now()` against wall clock, not event timestamps, so out-of-order or replayed events do not bypass the window.

---

## Error Handling

| Scenario                       | Behaviour                                                                    |
| ------------------------------ | ---------------------------------------------------------------------------- |
| Malformed JSON                 | Logged, event skipped                                                        |
| Missing required field         | Logged with field name(s), event skipped                                     |
| Non-numeric `value` field      | Logged, event skipped                                                        |
| Invalid rule in `rules.json`   | Logged with field name(s) at startup, rule dropped                           |
| SSE connection error           | Logged, connection closed, exponential backoff retry (1s → 2s → … → 30s cap) |
| Webhook POST failure (non-2xx) | Status code logged, alert still recorded in-memory                           |
| Webhook network error          | Error logged, alert still recorded in-memory                                 |

No error in any layer crashes the process. Validation failures are isolated to the event or rule that caused them.

---

## Known Limitations

- **Rules are static.** `rules.json` is read once at startup. Adding, removing, or editing a rule requires a process restart.
- **In-memory alert log.** Alerts are stored in a plain array for the lifetime of the process. They are lost on restart and are not queryable.
- **Single SSE source.** The client connects to one stream URL. Multiple sources would require multiple client instances.
- **No authentication.** The SSE connection and webhook POST carry no credentials.
- **Cooldown is in-process only.** Restarting the process resets all cooldown timers, which can cause duplicate alerts for rules that were mid-window.
- **Documentation** Had this been a larger project, I would have implemented Swagger-style documentation with an OpenAPI.yaml
