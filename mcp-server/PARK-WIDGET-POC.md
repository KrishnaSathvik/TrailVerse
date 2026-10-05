# Park widget PoC

## Scope and baseline diagnosis

This opt-in experiment tests the existing `search_parks` and `get_park_details`
tools through the existing `ui://widget/park-list.html` and
`ui://widget/park-details.html` resource addresses. No planner, authentication,
ranking, park resolution, backend API, or saved-trip changes.

Before implementation, widget resources existed but neither tool linked its
resource in tool metadata. The list renderer only opened website links and did
not issue a tool call. Each renderer accepted only its own payload shape.
Enabling all widgets would also change unrelated tools' structured output.

The existing static HTML/MCP Apps architecture supports this interaction; no
framework replacement is needed. The PoC serves one small shared renderer at
both existing park resource addresses when explicitly enabled. The original
five generated widgets remain intact. A UI-initiated `tools/call` returns data
to the calling iframe: the list iframe renders the detail payload itself using
the same renderer served at the detail resource. It does not assume ChatGPT
will swap resources after a button click.

## Run

From `mcp-server`:

```sh
MCP_PARK_BROWSER_POC=true MCP_MARKDOWN_ONLY=true MCP_ENABLE_WIDGETS=false .venv/bin/python -m server.main
```

Only the two park resources and their tool metadata/structured payloads are
activated by this flag. Existing all-widget flags retain their old behavior.
The flag defaults off (`MCP_PARK_BROWSER_POC=false`), including in `.env.example`.
Keep the work alongside Trailie and the existing MCP tools. Do not create a
separate PoC deployment, branch, or environment. When the combined work is ready,
deploy the intended mainline once, then enable this flag on the existing MCP
service for acceptance. Refresh/reconnect TrailVerse MCP and start a fresh
ChatGPT conversation to avoid cached resource HTML. After acceptance, decide
whether interactive widgets should become the normal experience.

Repository note (2026-10-05): the combined local testing branch is
`local/trailverse-unified-test`. It incorporates the original local work,
`origin/master`, Where Next, and cost fixes. No separate PoC environment exists.
`mcp-server/render.yaml` still targets `master`; release branch alignment remains
an explicit future release task, not a change made by this integration.

## Real ChatGPT acceptance (required before claiming success)

1. After deploying the combined mainline work and enabling the flag, refresh or
   reconnect the existing TrailVerse MCP connector in ChatGPT developer mode.
2. Ask the connector to `search_parks` with query `Utah`.
3. Record that a widget renders and compare names/order with structuredContent.
4. Click View park. Record a `get_park_details` call with exactly that result's
   parkCode; confirm detail name, alerts, and entrance information match its
   structuredContent without falling back to Markdown.
5. Click Parks and confirm original list/order remains. Also try an empty
   search and a failed detail call. Direct get_park_details should render too.

Local protocol/controller checks are not proof of any of these in ChatGPT.
No browser backend was available in the Codex session (discovery returned an
empty list), so real ChatGPT rendering/click acceptance remains unverified.

Protocol reference: https://developers.openai.com/plugins/build/chatgpt-ui

## Local verification

From `mcp-server`:

```sh
.venv/bin/python -m pytest tests/test_park_widget_poc.py tests/test_plan_trip.py -q
node --test tests/park_widget_controller.test.cjs
```

Results: 18 Python tests and 3 JavaScript tests passed. Python uses the actual
MCP client/server protocol over in-memory streams with mocked backend data;
it checks resource MIME/CSP, tool metadata, both park tool responses, default
mode isolation, and the planner's existing response behavior. Controller tests
use a minimal DOM double to check exact park-code forwarding, list/detail/back,
literal text rendering, missing identifiers, failures/timeouts, stale responses,
empty results, and direct details. No live backend/provider calls were made.

The hand-authored `widgets/park-browser-poc.html` is intentionally independent
of `scripts/build_widgets.py`; rebuilding the original widgets does not change
the PoC. Both park resource addresses load it only while the PoC flag is on.
It uses no external assets or direct network connections. Planning has no UI
action in this phase. Nothing has been deployed or production-enabled.
