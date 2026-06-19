import type { MetricEvent } from "../sse-client";
import type { Rule } from "../rule-engine";

const DEMO_RULE = {
  name: "Checkout high error rate",
  source: "checkout-api",
  metric: "error_rate",
  operator: ">",
  threshold: 5,
  cooldownSeconds: 60,
  enabled: true,
};

const BASE_EVENT: MetricEvent = {
  id: "evt-001",
  source: "checkout-api",
  metric: "error_rate",
  value: 7.5,
  timestamp: "2026-06-17T00:00:00.000Z",
};

// Loads a fresh isolated module with a single custom rule.
// jest.isolateModules is synchronous, so fn is always set before return.
function loadEvalWith(overrides: Partial<typeof DEMO_RULE>): (e: MetricEvent) => Rule[] {
  let fn!: (e: MetricEvent) => Rule[];
  jest.isolateModules(() => {
    jest.doMock("../rules.json", () => [{ ...DEMO_RULE, ...overrides }]);
    fn = (require("../rule-engine") as { evaluate: (e: MetricEvent) => Rule[] }).evaluate;
  });
  return fn;
}

describe("rule-engine evaluate()", () => {
  beforeEach(() => {
    // Clear module cache and any leaked doMock registrations before each test.
    jest.resetModules();
    jest.restoreAllMocks();
    jest.unmock("../rules.json");
  });

  // --- rule matching ---

  test("event triggers rule when source, metric, and threshold all match", () => {
    const ev = loadEvalWith({});
    const triggered = ev(BASE_EVENT); // value 7.5 > threshold 5
    expect(triggered).toHaveLength(1);
    expect(triggered[0].name).toBe("Checkout high error rate");
  });

  test("event does not trigger rule when metric differs", () => {
    const ev = loadEvalWith({});
    expect(ev({ ...BASE_EVENT, metric: "latency_ms" })).toHaveLength(0);
  });

  test("event does not trigger rule when source differs", () => {
    const ev = loadEvalWith({});
    expect(ev({ ...BASE_EVENT, source: "payment-worker" })).toHaveLength(0);
  });

  test("rule with empty source matches events from any source", () => {
    const ev = loadEvalWith({ source: "" });
    expect(ev({ ...BASE_EVENT, source: "payment-worker" })).toHaveLength(1);
  });

  test("disabled rule never fires", () => {
    const ev = loadEvalWith({ enabled: false });
    expect(ev(BASE_EVENT)).toHaveLength(0);
  });

  // --- operators ---

  test(">= fires when value equals threshold (boundary)", () => {
    expect(loadEvalWith({ operator: ">=" })({ ...BASE_EVENT, value: 5 })).toHaveLength(1);
  });

  test(">= does not fire when value is below threshold", () => {
    expect(loadEvalWith({ operator: ">=" })({ ...BASE_EVENT, value: 4.9 })).toHaveLength(0);
  });

  test("< fires when value is below threshold", () => {
    expect(loadEvalWith({ operator: "<" })({ ...BASE_EVENT, value: 4.9 })).toHaveLength(1);
  });

  test("< does not fire when value equals threshold", () => {
    expect(loadEvalWith({ operator: "<" })({ ...BASE_EVENT, value: 5 })).toHaveLength(0);
  });

  test("<= fires when value equals threshold (boundary)", () => {
    expect(loadEvalWith({ operator: "<=" })({ ...BASE_EVENT, value: 5 })).toHaveLength(1);
  });

  test("<= does not fire when value is above threshold", () => {
    expect(loadEvalWith({ operator: "<=" })({ ...BASE_EVENT, value: 5.1 })).toHaveLength(0);
  });

  test("= fires when value exactly equals threshold", () => {
    expect(loadEvalWith({ operator: "=", threshold: 7.5 })(BASE_EVENT)).toHaveLength(1);
  });

  test("= does not fire when value differs from threshold", () => {
    expect(loadEvalWith({ operator: "=" })(BASE_EVENT)).toHaveLength(0); // 7.5 !== 5
  });

  // --- cooldown ---

  test("first matching event triggers an alert", () => {
    const ev = loadEvalWith({});
    jest.spyOn(Date, "now").mockReturnValue(1_000_000);
    expect(ev(BASE_EVENT)).toHaveLength(1);
  });

  test("second matching event within cooldown window does not fire", () => {
    const ev = loadEvalWith({});
    jest.spyOn(Date, "now").mockReturnValue(1_000_000);
    expect(ev(BASE_EVENT)).toHaveLength(1); // fires; records lastFired = 1_000_000
    expect(ev(BASE_EVENT)).toHaveLength(0); // 0 ms elapsed — within 60 s cooldown
  });

  test("matching event after cooldown window expires fires again", () => {
    const ev = loadEvalWith({});
    const dateSpy = jest.spyOn(Date, "now");

    dateSpy.mockReturnValue(1_000_000);
    expect(ev(BASE_EVENT)).toHaveLength(1); // first alert

    dateSpy.mockReturnValue(1_000_000 + 60_001); // past 60 s cooldown
    expect(ev(BASE_EVENT)).toHaveLength(1); // fires again
  });
});
