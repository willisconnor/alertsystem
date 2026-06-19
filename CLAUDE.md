# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Behavioral guidelines to reduce common LLM coding mistakes. Merge with project-specific instructions as needed.

Tradeoff: These guidelines bias toward caution over speed. For trivial tasks, use judgment.

1. Think Before Coding
   Don't assume. Don't hide confusion. Surface tradeoffs.

Before implementing:

State your assumptions explicitly. If uncertain, ask.
If multiple interpretations exist, present them - don't pick silently.
If a simpler approach exists, say so. Push back when warranted.
If something is unclear, stop. Name what's confusing. Ask. 2. Simplicity First
Minimum code that solves the problem. Nothing speculative.

No features beyond what was asked.
No abstractions for single-use code.
No "flexibility" or "configurability" that wasn't requested.
No error handling for impossible scenarios.
If you write 200 lines and it could be 50, rewrite it.
Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

3. Surgical Changes
   Touch only what you must. Clean up only your own mess.

When editing existing code:

Don't "improve" adjacent code, comments, or formatting.
Don't refactor things that aren't broken.
Match existing style, even if you'd do it differently.
If you notice unrelated dead code, mention it - don't delete it.
When your changes create orphans:

Remove imports/variables/functions that YOUR changes made unused.
Don't remove pre-existing dead code unless asked.
The test: Every changed line should trace directly to the user's request.

4. Goal-Driven Execution
   Define success criteria. Loop until verified.

Transform tasks into verifiable goals:

"Add validation" → "Write tests for invalid inputs, then make them pass"
"Fix the bug" → "Write a test that reproduces it, then make it pass"
"Refactor X" → "Ensure tests pass before and after"
For multi-step tasks, state a brief plan:

1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
   Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

These guidelines are working if: fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.

In this repository, I will want an AI_NOTES.md
This will include:
● Which AI tools used
● What I asked AI to help with
● What AI-generated suggestions I accepted
● What AI-generated suggestions I rejected or changed
● Any bugs or incorrect assumptions I found in AI output

I (the user) would like Claude to keep track of the suggestions accepted and rejected, then write them to AI_NOTES.md

This repository will be a Configureable Real-time alert system
This app receives real time metric events form a Server-sent events steam. Users can define alert rules. When an incoming event matches a rule, the app should trigger an alert through at least one notification channel.

Team wants to monitor service metrics in real time, each incoming event describes one metric value from one source. Users should be able to configure rules such as: Alert when checkout-api has error_rate >5
alert when any service has latency_ms >= 1000
alert when payment-worker has queue_depth > 500

User mock-sse-server.js; run it wth node mock-sse-server.js
Then npm run dev

We need to connect to the SSE stream and show our connection state

Configure our Alert rules, as users should be able to create rules, enable rules, and disable rules for their own preferences. Rules are managed via rules.json. It can be through a UI, JSON config, import field, or another interface. We do not need to make a full crud admin UI

Rules JSON with name, source, metric, operator, threshold, cooldownSeconds, enabled

Implement >, >=, <, <=, = operators

We need to match each incoming event with enabled rules, compare its value with the rule threshold (eg cooldown), trigger an alert (through whichever pathway(s) the user has established)

do not trigger an alert on disabled rules
do not trigger rules for a different metric or source that do not qualify for said rules

Phase 1: in app alert list. Phase 2: discord webhook.

Alert structure:

Rule name, source, metric, actual value, threshold condition, event timestamp, alert triggered time

For cooldown implementation: to prevent alert spam, we implenent a cooldownSeconds. If a rule has this implemented, and matching events keep arriving, the app should onyl trigger 1 alert for that rule in the given time period assigned by cooldownSeconds.

We also need to handle bad input and stream issues. This includes but is not limited to malformed JSONs, missing required fields, non numeric metric values, and a SSE connection error or disconnect. Show an erros message and skip invalid events when applicable.

Use Case: e-commerce platform on call triage

Putting on my product hat, this alert system could be used by a mid sized e-commerce company running a black friday sale.
Their on-call engineer is watching five services at once. Checkout, payments, inventory, search, and CDN, with no unified alert layer.
Metrics stream from each service in real time, bu tthe engineer is manually scanning dashboards an dmissing threshold breaches until customers are already impacted
This alert system sits between the metric stream and the engineer. Rules are configured before the sale kicks off: error rate spikes on checkout trigger immediately, queue depth on payment worker flags before it backs up, and latency on any service over 1 seconds fires a warning.
The cooldown window prevents the on call from getting paged 60 times a minute for the same degraded service, as they get one alert, investigate, and the system stays quiet until the window resets.
The value isn't detection, its signal reduction as we reduce clutter and noise into things that engineers can see, investigate, and more easily break up into actionable items, instead of spending half of their time trying to understand what an arbitrary alert value might mean. We want an engineer to fix, not filter.

Use suggested rules for the demo:

{
"name": "Checkout high error rate",
"source": "checkout-api",
"metric": "error_rate",
"operator": ">",
"threshold": 5,
"cooldownSeconds": 60,
"enabled": true
}
