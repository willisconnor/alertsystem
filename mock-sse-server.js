// mock-sse-server.js
// Run with: node mock-sse-server.js
// Test with: curl -N http://localhost:4000/events
const http = require("http");
const baseEvents = [
  { source: "checkout-api", metric: "error_rate", value: 2.1 },
  { source: "checkout-api", metric: "error_rate", value: 7.5 },
  { source: "payment-worker", metric: "queue_depth", value: 800 },
  { source: "checkout-api", metric: "latency_ms", value: 1200 },
  { source: "checkout-api", metric: "error_rate", value: 8.2 },
];
const server = http.createServer((req, res) => {
  if (req.url !== "/events") {
    res.writeHead(404);
    res.end("Not found");
    return;
  }
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "Access-Control-Allow-Origin": "*",
  });
  let index = 0;
  const timer = setInterval(() => {
    const base = baseEvents[index % baseEvents.length];
    const event = {
      ...base,
      id: `evt-${String(index + 1).padStart(3, "0")}`,
      timestamp: new Date().toISOString(),
    };
    res.write(`id: ${event.id}\n`);
    res.write(`data: ${JSON.stringify(event)}\n\n`);
    index += 1;
  }, 1000);
  req.on("close", () => {
    clearInterval(timer);
    res.end();
  });
});
server.listen(4000, () => {
  console.log("SSE mock server running at http://localhost:4000/events");
});
