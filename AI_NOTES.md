# AI Notes

## Tools Used

- Claude Code (claude-sonnet-4-6) via Claude Code CLI

## Session Log

### Session 1 — Project scaffolding

**Asked AI to help with:** Set up TypeScript Node.js project scaffold — package.json, tsconfig.json targeting ES2020, install `eventsource` as the only runtime dependency, and populate rules.json with the demo rule. No logic implementation, just files and config.

**Accepted:**

- `package.json` with `eventsource` as runtime dep, `typescript`, `ts-node`, `@types/node`, `@types/eventsource` as devDeps, and `dev`/`build` scripts
- `tsconfig.json` targeting ES2020, commonjs modules, strict mode, `resolveJsonModule: true`
- `src/rules.json` populated with the "Checkout high error rate" demo rule (source: checkout-api, metric: error_rate, operator: >, threshold: 5, cooldownSeconds: 60, enabled: true)
- `npm install` run to install all declared dependencies

**Rejected / Changed:**

- Nothing rejected in this session

**Bugs / Incorrect Assumptions Found:**

- None yet

### Session 2 — SSE client implementation

**Asked AI to help with:** Implement `startSSEClient(url, onEvent)` in `src/sse-client.ts` using the `eventsource` package. Parse JSON payloads into a typed `MetricEvent`, validate required fields, log errors clearly, never crash.

**Accepted:**

- `MetricEvent` interface (id, source, metric, value, timestamp)
- `startSSEClient(onEvent, url)` — url defaults to `http://localhost:4000/events`, second param so callers don't have to pass it
- `isMetricEvent` type guard for runtime field validation — logs and skips malformed or incomplete payloads
- `onerror` handler distinguishing CONNECTING (reconnecting) vs CLOSED states
- Zero crashes on bad input or stream errors

**Rejected / Changed:**

- Nothing rejected in this session

**Bugs / Incorrect Assumptions Found:**

- Claude did not chose to import DOM in the tsconfig, then chose to use console.log and console.error, despite not implementing DOM. Fix: added "DOM" to tsconfig's lib.

### Session 3 — Rule engine implementation

**Asked AI to help with:** Implement `evaluate(event: MetricEvent)` in `src/rule-engine.ts`. Load rules from rules.json, skip disabled/non-matching rules, evaluate all 5 operators, enforce per-rule cooldown via in-memory Map, return triggered rules.

**Accepted:**

- Updated `Rule` interface operator union from `"=="` to `"="` to match spec
- `rules` loaded from `rules.json` via `resolveJsonModule` import, cast as `Rule[]`
- `lastFired: Map<string, number>` in module scope tracking last alert time in ms per rule name
- `evaluate` short-circuits: disabled → source mismatch → metric mismatch → threshold check → cooldown check
- `matchesThreshold` switch is exhaustive — TypeScript enforces all 5 operator cases
- Notifier is not called; only triggered rules returned

**Rejected / Changed:**

- Nothing rejected in this session

**Bugs / Incorrect Assumptions Found:**

- Existing `Rule` interface used `"=="` for equality operator; spec says `"="`. Updated to match spec.

### Session 4 — Wire SSE client to rule engine in index.ts

**Asked AI to help with:** Wire `startSSEClient` → `evaluate` → build alert objects → print to console → store in in-memory array.

**Accepted:**

- `Alert` interface exported from index.ts (ruleName, source, metric, actualValue, thresholdCondition, eventTimestamp, alertTriggeredAt)
- `alerts: Alert[]` exported module-scope array for later use by other channels
- `thresholdCondition` formatted as human-readable string e.g. `error_rate > 5`
- `printAlert` uses a fixed-width ruled separator and labeled fields for readability
- `alertTriggeredAt` uses `new Date().toISOString()` (wall clock, not event time)

**Manual Testing Results:**

- npm run dev
  [SSE] Connecting to http://localhost:4000/events
  ──────────────────────────────────────────────────
  ALERT: Checkout high error rate
  Source : checkout-api
  Metric : error_rate
  Condition : error_rate > 5
  Value : 7.5
  Event at : 2026-06-17T22:31:33.622Z
  Alerted at: 2026-06-17T22:31:33.623Z
  ──────────────────────────────────────────────────
  ──────────────────────────────────────────────────
  ALERT: Checkout high error rate
  Source : checkout-api
  Metric : error_rate
  Condition : error_rate > 5
  Value : 7.5
  Event at : 2026-06-17T22:32:34.186Z
  Alerted at: 2026-06-17T22:32:34.186Z
  ──────────────────────────────────────────────────

**Rejected / Changed:**

- Nothing rejected in this session

**Bugs / Incorrect Assumptions Found:**

- None

### Session 5 — SSE reconnection with exponential backoff
**Asked AI to help with:** Fix tight reconnect loop in `onerror` — log disconnect once, implement exponential backoff (1s → 2s → … → 30s cap), log each retry with wait time, no log spam between attempts.

**Accepted:**
- Root cause identified: `eventsource` built-in reconnect fires `onerror` on every attempt, causing the loop
- Fix: call `es.close()` in `onerror` to take ownership of reconnection, then drive retries via `setTimeout`
- `delay` lives in closure scope of `startSSEClient`; doubles each failed attempt, capped at `BACKOFF_MAX_MS = 30_000`
- `onopen` resets `delay` back to `BACKOFF_INITIAL_MS = 1_000` on successful connection
- Two logs per disconnect cycle: "Disconnected." then "Retrying in Xs…" — silent between those two events

**Rejected / Changed:**
- Nothing rejected in this session

**Bugs / Incorrect Assumptions Found:**
- Initial implementation delegated reconnection to `eventsource` built-in, which caused `onerror` to fire in a tight loop on disconnect

### Session 7 — Hardened input validation in sse-client.ts and rule-engine.ts
**Asked AI to help with:** Close all silent failure modes: per-field error logs for missing/invalid event fields, NaN detection on value, rule validation at load time, unrecognized operator handling.

**Accepted:**
- `isMetricEvent` replaced with `validateEvent` returning `MetricEvent | null` — logs exactly which fields are missing or wrong-typed
- `typeof NaN === "number"` silent pass fixed: `Number.isFinite(o.value)` check added with its own specific error log
- Rule validation at module load (`flatMap` over `rulesData as unknown[]`) — checks all 7 fields, logs and drops any bad rule with field names listed
- `Number.isFinite` applied to `threshold` and `cooldownSeconds` in rule validation (catches `NaN`/`Infinity` from JSON)
- `default` case added to `matchesThreshold` switch — logs and returns false instead of implicitly returning `undefined`
- No existing logic changed; all evaluate/cooldown/backoff behavior untouched

**Rejected / Changed:**
- Nothing rejected in this session

**Bugs / Incorrect Assumptions Found:**
- `isMetricEvent` passed `NaN` as a valid value because `typeof NaN === "number"` is true — fixed with `Number.isFinite`
- `matchesThreshold` switch had no `default` — unrecognized operator returned `undefined` (falsy) silently — fixed with explicit `default` log + return false
- `rulesData as Rule[]` trusted JSON blindly — invalid rules silently loaded and could cause unpredictable matching behavior — fixed with load-time validation

### Session 9 — Jest test suite for rule-engine
**Asked AI to help with:** Install jest + ts-jest, configure in package.json, write tests for: above/at/below threshold, disabled rule, wrong source, wrong metric, cooldown active, cooldown expired.

**Accepted:**
- `jest`, `ts-jest`, `@types/jest` installed as devDependencies
- `tsconfig.test.json` extending main tsconfig with `"types": ["jest", "node"]` — scopes jest globals to tests only, keeps production tsconfig clean
- Jest configured in package.json with `transform` pointing at `tsconfig.test.json`
- `beforeEach`: `jest.resetModules()` for fresh `lastFired` Map + `jest.unmock('../rules.json')` to prevent mock leakage + `jest.restoreAllMocks()` for spy cleanup
- `jest.isolateModules` used for the disabled-rule test to mock rules.json without polluting other tests
- `jest.spyOn(Date, 'now')` to freeze/advance time for cooldown tests (no fake timers needed — `Date.now` is called at evaluate() call time, not module load time)
- 8 tests, 8 passing

**Rejected / Changed:**
- Nothing rejected in this session

**Bugs / Incorrect Assumptions Found:**
- `jest.doMock()` inside `jest.isolateModules()` leaks into the global mock registry — subsequent tests loaded the disabled rule and returned [] on every call. Fixed by adding `jest.unmock('../rules.json')` to `beforeEach`.

### Session 11 — Test coverage audit and gap-filling
**Asked AI to help with:** Audit both test files against a full checklist: rule matching, all 5 operators, cooldown (3 cases), invalid events, SSE state.

**Gaps found and addressed:**
- Operators `>=`, `<`, `<=`, `=` had zero tests — added 2 tests each (fires at boundary / does not fire)
- `loadEvalWith(overrides)` helper added to rule-engine.test.ts — uses `jest.isolateModules` to load a fresh module with a custom rule; avoids polluting shared `evaluate`
- Empty-source wildcard not implemented — added one line to rule-engine.ts (`rule.source !== "" && rule.source !== event.source`) and a test for it
- Missing metric test was implicit (dropped 3 fields together) — added a targeted test with only metric absent
- SSE `onopen` / connected state never triggered in tests — added test that fires `mockInstance.onopen!()` and asserts `onStatus("connected")`
- SSE recovery path (retry after error) untested — added test using `jest.advanceTimersByTime(1_001)` to fire the `setTimeout`; asserts `MockEventSource` called twice and `onStatus` last called with `"connecting"`

**Accepted:** All the above

**Rejected / Changed:** Nothing rejected

**Bugs / Incorrect Assumptions Found:**
- Empty-source wildcard feature was missing from `rule-engine.ts` — checklist called for it but implementation did exact-match only

### Session 10 — Jest tests for sse-client.ts
**Asked AI to help with:** Write `src/__tests__/sse-client.test.ts`. Mock `eventsource`, test: valid event reaches onEvent, malformed JSON logs + skips, missing fields logs + skips, non-numeric value logs + skips, connection error logs + does not crash.

**Accepted:**
- Explicit `jest.mock("eventsource", () => ({ __esModule: true, default: jest.fn() }))` factory — avoids auto-mock unpredictability with default exports
- `MockInstance` interface typed to only the properties `sse-client.ts` actually uses (`onmessage`, `onerror`, `onopen`, `close`)
- `MockEventSource.mockImplementation(() => mockInstance as never)` in `beforeEach` — each test gets a fresh instance with all handlers null, then `startSSEClient` populates them
- `jest.useFakeTimers()` per test — prevents the retry `setTimeout` inside `onerror` from firing a second `new EventSource()` call mid-test
- `jest.spyOn(console, "error").mockImplementation(() => {})` — silences output, enables assertion
- "non-numeric" test uses `value: "7.5"` (string in JSON) — realistic path; NaN/Infinity serialize to `null` in JSON so can't be injected via the message handler
- "connection error does not crash" — completing without exception IS the assertion; also checks `close()` called and correct `onStatus` sequence

**Rejected / Changed:**
- Nothing rejected in this session

**Bugs / Incorrect Assumptions Found:**
- None

### Session 8 — SSE status callback, mock notifier, alert field display
**Asked AI to help with:** Export `ConnectionStatus` type and `onStatus` callback from sse-client; replace notifier skip with mock that prints all alert fields; wire status display in index.ts.

**Accepted:**
- `ConnectionStatus = "connecting" | "connected" | "error" | "disconnected"` exported from sse-client
- `onStatus(status, detail?)` added as second param with default no-op — optional `detail` string carries retry timing so index.ts can display it without sse-client knowing about display
- All inline console.logs for connection status removed from sse-client; callback is now the single display path
- Status sequence on disconnect: `"error"` (when onerror fires) → `"disconnected"` with detail `"retrying in Xs"` → `"connecting"` (on next attempt)
- `mockNotify` in notifier.ts prints all 7 alert fields (rule name, source, metric, value, condition, event at, alerted at) instead of warning and skipping
- index.ts `onStatus` handler uses switch for exhaustive mapping of all 4 states

**Rejected / Changed:**
- Nothing rejected in this session

**Bugs / Incorrect Assumptions Found:**
- None

### Session 6 — Discord webhook notifier
**Asked AI to help with:** Implement `notify(alert)` in `src/notifier.ts` using native `fetch`. Read `WEBHOOK_URL` from env, POST a Discord embed payload, warn and skip if unset. Wire into `index.ts`.

**Accepted:**
- `WEBHOOK_URL` read from `process.env` at call time (not module load), so it can be set after startup
- Discord embed with title, red color (`0xff4444`), and fields: Source, Metric, Condition, Value, Event at; `timestamp` set to `alertTriggeredAt`
- Non-2xx response logged as error (status + statusText), not thrown
- Network errors caught and logged, never propagated
- `notify` called with `.catch()` in `index.ts` so a unexpected rejection can't crash the event loop
- `Alert` type imported from `./index` to avoid duplicating the interface

**Rejected / Changed:**
- Nothing rejected in this session

**Bugs / Incorrect Assumptions Found:**
- None
