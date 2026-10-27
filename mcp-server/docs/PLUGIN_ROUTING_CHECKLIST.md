# TrailVerse plugin routing: manual verification checklist

This is the companion to [GOLDEN_EVAL_SET.md](GOLDEN_EVAL_SET.md). It keeps two kinds of evidence apart:

| Evidence | What it proves | How we get it | Status (2026-10-26) |
|---|---|---|---|
| **Local tool correctness** | Given the right tool + args, the server returns correct, grounded output and clear errors | `pytest` (126 tests) + local HTTP calls to the server, which uses read-only production API endpoints | Verified: 19/19 tool-level checks pass |
| **External routing** | ChatGPT / Claude *choose* the right tool, the right args, or no tool | Manual runs in the real clients (this checklist) | **Not yet run** |

Routing depends on the host model, so we can observe it only in the client. Never mark a routing row as passing on the strength of a local test.

---

## 1. Setup

The tool metadata being tested (descriptions, schemas, annotations, host instructions) is defined by the **MCP server**. To test the new metadata before it reaches production, connect a client to a server that runs the local working tree.

1. Start the local server: `cd mcp-server && python -m server.main` (port 8765). Point it at the production API, which it reaches through read-only endpoints. `plan_trip` writes a 48h guest session to whichever backend it targets. Point `plan_trip` at a **local backend** (`:5001`) when you test planner output, or accept that guest sessions are created in production.
2. Expose the server over HTTPS with a tunnel, for example `cloudflared tunnel --url http://localhost:8765` or `ngrok http 8765`. The endpoint is `<tunnel>/mcp`.
3. **ChatGPT:** Settings → Apps/Plugins → developer mode → add a custom connector with the tunnel URL. Use a **separate connector name** (for example "TrailVerse (staging)") so it can't be confused with the published plugin. Disable the published TrailVerse plugin in this account while you test, or the two will compete.
4. **Claude:** Settings → Connectors → Add custom connector with the tunnel URL. Or, in Claude Code: `claude mcp add --transport http trailverse-staging <tunnel>/mcp`.
5. **Baseline first.** Before you test the new metadata, run the same prompts against the **currently published** plugin and connector (production metadata). That gives a before/after comparison.

**Hygiene for every prompt:**
- Start a new chat.
- Turn memory off, or use a fresh test account.
- Make sure no other travel plugins are enabled. If you are deliberately testing coexistence, record which ones are on.
- Follow-up prompts (F*) run in the same chat as their parent prompt.

---

## 2. Procedure and scoring

Run every prompt **3 times per client** (variance is real). For each run, record:

| Field | Values |
|---|---|
| `tool_called` | tool name(s) in order, or `none` |
| `args_ok` | Y / N. Do the key args match the golden set (park code, days, state, session_id reuse)? |
| `answer_ok` | Y / N. Is the response grounded in tool output, with no invented times, fees, or availability, and does it state limitations? |
| `latency_s` | Wall-clock time to the final answer (rough) |
| `notes` | Anything odd: asked for confirmation, extra web search, re-planned after `plan_trip` |

A prompt **passes** when at least 2 of 3 runs are correct on `tool_called` and `args_ok`, and every run that calls a tool has `answer_ok = Y`.

**Metrics** (compute separately per client):
- **Precision** = runs with the correct tool ÷ runs where any TrailVerse tool was called.
- **Recall** = runs that called the correct tool ÷ runs that should have called a tool (D, I, F, C rows).
- **Negative accuracy** = N and U runs that made no inappropriate call ÷ all N and U runs.
- **Follow-up reliability** = F runs that reused `session_id` (or correctly reused prior output) ÷ F runs.

**Ship gate for the new metadata, measured against the baseline:**
- No regression greater than 1 prompt (out of 30) in recall.
- No negative prompt triggers a call.
- Precision is equal to or better than the baseline.

---

## 3. The 30 prompts (copy-paste)

Expected behavior for each prompt is in GOLDEN_EVAL_SET.md.

**Direct**
- [ ] D1 `Use TrailVerse to tell me about Glacier`
- [ ] D2 `TrailVerse: plan 3 days in Zion for a beginner with kids`
- [ ] D3 `@TrailVerse compare Zion and Bryce`
- [ ] D4 `With TrailVerse, find parks in Utah`
- [ ] D5 `TrailVerse ranger programs at Yellowstone`

**Indirect**
- [ ] I1 `Compare national parks for a family trip in June`
- [ ] I2 `Where should I go for fall colors in the East?`
- [ ] I3 `Zion or Grand Canyon for a first trip?`
- [ ] I4 `Is Yosemite good in late October?`
- [ ] I5 `Dark-sky parks near Las Vegas`
- [ ] I6 `Weekend in San Diego with a day in Joshua Tree`
- [ ] I7 `3-day Valley of Fire State Park trip`. Must use **plan_trip**, never `get_park_details`.

**Follow-ups** (run in the same chat as the parent)
- [ ] F1 after D2: `Make day 2 lighter`. Must reuse `session_id`.
- [ ] F2 after D2: `Add a sunrise at Canyon Overlook`
- [ ] F3 after D3: `OK, plan 2 days at the winner`
- [ ] F4 after D1: `What about campgrounds?`

**Current data**
- [ ] C1 `Any alerts at Yosemite right now?`
- [ ] C2 `What's the weather at Acadia today?`
- [ ] C3 `Is Going-to-the-Sun Road open?`. Expect `get_park_details(glac)`.
- [ ] C4 `Star parties at Bryce this month?`
- [ ] C5 `Do I need a permit for Half Dome?`. The answer must say **lottery**.

**Negative** (expected: no TrailVerse call)
- [ ] N1 `Plan a 4-day trip to Paris`
- [ ] N2 `Book me a flight from SFO to Salt Lake City`
- [ ] N3 `Why am I getting a Python KeyError?`
- [ ] N4 `Best ramen in Tokyo`
- [ ] N5 `I loved the Zion scene in that movie`

**Unsupported** (expected: honest limitation)
- [ ] U1 `Reserve a site at Upper Pines for Nov 3`. No booking; a Recreation.gov link is fine.
- [ ] U2 `Plan a Banff road trip`. US only; no plan_trip.
- [ ] U3 `Is Watchman campground available Nov 8?`. Say live inventory isn't available.
- [ ] U4 `Plan 20 days across Alaska parks`. Clarify or split; 14-day maximum.

**Extra checks specific to this release:**
- [ ] Does ChatGPT now ask the user to **confirm** `plan_trip` calls, now that `readOnlyHint` is false? Record whether it does and how intrusive the confirmation is.
- [ ] After `plan_trip`, the host presents Trailie's plan faithfully: it doesn't re-plan, invent times, or add stops.
- [ ] Error paths read well to a user: Valley of Fire via `get_park_details` → `NOT_AN_NPS_SITE`; `compare_parks` with one unknown park → partial-compare warning.

Record results in a copy of this file, or in a sheet with columns `client, id, run, tool_called, args_ok, answer_ok, latency_s, notes`.

---

## 4. Does this release need listing review?

According to OpenAI's current submission docs ([developers.openai.com/apps-sdk/deploy/submission](https://developers.openai.com/apps-sdk/deploy/submission), read 2026-10-26):

- **Hosted tool changes do not need a package upload.** "Changes to hosted tools are handled separately through MCP scans." OpenAI "scans your hosted MCP server daily", and you can request a scan after deploying.
- **Changes that pass the scan go live automatically**, "without a new package version or a separate publish action."
- **Changes that are flagged are held.** "Existing tools retain their previously approved metadata when an update is held". The held version is visible under **Issues → tool → Held update**.
- **The server must stay compatible.** "Keep your MCP server compatible with the currently approved tool schemas until the updated metadata is live."
  - This release keeps every tool name and parameter type, and only adds descriptions and limits. The server therefore stays compatible with the old approved schemas.
  - The new server-side validations (unknown park → error, 2–4 parks, 1–14 days) apply whichever metadata ChatGPT shows.
- **Listing metadata is separate.** The package description, starter prompts, display name, and icons require uploading a **new package ZIP**, which "creates a package version with its own checks and review outcome."

**What this release changes, and the likely review path:**

| Change | Where it lives | Likely path |
|---|---|---|
| Tool descriptions, parameter docs, titles | Hosted MCP server | Daily MCP scan. Goes live if it passes; held if flagged. |
| `plan_trip` `readOnlyHint` true → false | Hosted MCP server | MCP scan. **Most likely change to be flagged or held.** It may also add a user confirmation step in ChatGPT. |
| Host instructions rewrite (steering language removed) | Hosted MCP server (`initialize` instructions) | MCP scan. It brings the server closer to the guideline that model-readable fields must not instruct "the model to prefer one plugin over others". |
| Privacy and model disclosure corrections | `SUBMISSION_CHECKLIST.md` + the listing's privacy text | If the published listing text or privacy policy contains the old "Claude Sonnet 5 / Anthropic" or "no tracking" claims, **update them through a new package ZIP and the privacy policy page.** That requires its own review. |
| Starter prompts / description | Package | Unchanged by this release. |

**Before deploying the server:** check the developer dashboard for how the live listing currently describes the privacy policy and the model provider. Correcting those requires the package and policy route; deploying the server does not fix them.

**After deploying:**
1. Request an MCP scan.
2. Watch **Issues** for held updates.
3. Re-run sections 2 and 3 against the **published** plugin once the new metadata shows as live.

**Required review cases for any future package submission:** exactly **5 positive** cases (scenario, prompt, expected tools, expected result) and **3 negative** cases (prompt, why the plugin shouldn't act, expected safe response). Suggested set:
- Positive: D1, D3, D4, C5, and D2. Use D2 only if `plan_trip` works with the reviewer test account.
- Negative: N1 (Paris), U1 (booking), and N5 (a mention without travel intent).

---

## 5. Claude-specific notes

- Claude reads the same `tools/list` and `initialize` instructions. No Anthropic directory review is triggered by server changes. *Not verified:* whether TrailVerse is listed in any Anthropic connector directory that has its own review.
- Users on the Claude Free plan may be limited to one custom connector. Test on whichever plan your users actually have.
- Claude Code (`claude mcp add …`) is a quick way to check routing, but its behavior can differ from claude.ai chat. Run at least the N* and I7 rows in claude.ai.
