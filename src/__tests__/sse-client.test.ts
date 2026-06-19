import { startSSEClient, MetricEvent } from "../sse-client";
import EventSource from "eventsource";

// Explicit factory so the default export is a jest.fn() we can control.
jest.mock("eventsource", () => ({
  __esModule: true,
  default: jest.fn(),
}));

const MockEventSource = jest.mocked(EventSource);

// Shape that sse-client.ts actually uses on the returned instance.
interface MockInstance {
  onmessage: ((msg: { data: string }) => void) | null;
  onerror:   (() => void) | null;
  onopen:    (() => void) | null;
  close:     jest.Mock;
}

const VALID_EVENT: MetricEvent = {
  id: "evt-001",
  source: "checkout-api",
  metric: "error_rate",
  value: 7.5,
  timestamp: "2026-06-17T00:00:00.000Z",
};

describe("startSSEClient()", () => {
  let mockInstance: MockInstance;
  let onEvent: jest.Mock;
  let onStatus: jest.Mock;

  beforeEach(() => {
    // Freeze setTimeout so the retry inside onerror never fires mid-test.
    jest.useFakeTimers();
    // Silence console.error and let us assert on it.
    jest.spyOn(console, "error").mockImplementation(() => {});

    mockInstance = { onmessage: null, onerror: null, onopen: null, close: jest.fn() };
    MockEventSource.mockClear();
    // When startSSEClient calls `new EventSource(url)` it gets mockInstance back.
    MockEventSource.mockImplementation(() => mockInstance as never);

    onEvent = jest.fn();
    onStatus = jest.fn();
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  // --- message parsing ---

  test("valid event is parsed and passed to onEvent", () => {
    startSSEClient(onEvent, onStatus);

    mockInstance.onmessage!({ data: JSON.stringify(VALID_EVENT) });

    expect(onEvent).toHaveBeenCalledTimes(1);
    expect(onEvent).toHaveBeenCalledWith(VALID_EVENT);
  });

  test("malformed JSON logs an error and does not call onEvent", () => {
    startSSEClient(onEvent, onStatus);

    mockInstance.onmessage!({ data: "not { valid } json" });

    expect(console.error).toHaveBeenCalledWith(
      "[SSE] Malformed JSON, skipping:",
      "not { valid } json",
    );
    expect(onEvent).not.toHaveBeenCalled();
  });

  test("event missing required fields logs an error and does not call onEvent", () => {
    startSSEClient(onEvent, onStatus);

    // id and source present; metric, value, timestamp all absent.
    const incomplete = { id: "evt-001", source: "checkout-api" };
    mockInstance.onmessage!({ data: JSON.stringify(incomplete) });

    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining("Missing or invalid fields"),
      expect.anything(), // the raw parsed object
    );
    expect(onEvent).not.toHaveBeenCalled();
  });

  test("non-numeric value logs an error and does not call onEvent", () => {
    startSSEClient(onEvent, onStatus);

    // value is a string — typeof !== "number" triggers the type-error path.
    const event = { ...VALID_EVENT, value: "7.5" };
    mockInstance.onmessage!({ data: JSON.stringify(event) });

    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining("value (expected number, got string)"),
      expect.anything(),
    );
    expect(onEvent).not.toHaveBeenCalled();
  });

  test("missing metric field is logged and does not call onEvent", () => {
    startSSEClient(onEvent, onStatus);

    // All fields present except metric.
    const noMetric = {
      id: "evt-001",
      source: "checkout-api",
      value: 7.5,
      timestamp: "2026-06-17T00:00:00.000Z",
    };
    mockInstance.onmessage!({ data: JSON.stringify(noMetric) });

    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining("metric"),
      expect.anything(),
    );
    expect(onEvent).not.toHaveBeenCalled();
  });

  // --- connection lifecycle ---

  test("stream open emits connected status", () => {
    startSSEClient(onEvent, onStatus);

    mockInstance.onopen!();

    expect(onStatus).toHaveBeenCalledWith("connected");
  });

  test("connection error closes the source, emits status, and does not crash", () => {
    startSSEClient(onEvent, onStatus);

    // Simulate the EventSource firing its error callback.
    mockInstance.onerror!();

    expect(mockInstance.close).toHaveBeenCalledTimes(1);
    expect(onStatus).toHaveBeenCalledWith("error");
    expect(onStatus).toHaveBeenCalledWith(
      "disconnected",
      expect.stringContaining("retrying"),
    );
    // No exception means no crash — the test completing is the assertion.
  });

  test("creates a new EventSource after the retry delay expires", () => {
    startSSEClient(onEvent, onStatus);
    expect(MockEventSource).toHaveBeenCalledTimes(1); // initial connection

    mockInstance.onerror!(); // triggers close + schedules retry in 1 s
    expect(MockEventSource).toHaveBeenCalledTimes(1); // not yet reconnected

    jest.advanceTimersByTime(1_001); // fire the 1 s setTimeout
    expect(MockEventSource).toHaveBeenCalledTimes(2); // reconnected
    expect(onStatus).toHaveBeenLastCalledWith("connecting", expect.any(String));
  });
});
