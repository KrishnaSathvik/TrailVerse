# Pass 3B — voice and bounded live integration follow-up

Later offline follow-up identified and repaired a repeated URL-trip restoration loop and passed the functional harness preflight. See [offline stabilization](trailie-offline-chat-harness-2026-10-13.md). The failed live attempt and unknown costs below remain unchanged evidence.

**Verdict: voice overlap resolved for the prototype; live integration gate did not pass. Production remains held.**

## Changes and browser evidence

The global VoiceButton already returns nothing on `/plan-ai` and its subroutes. Playwright inspected an authenticated mobile chat at 390×850 after the hint delay and confirmed neither the invitation nor floating voice button existed. The previous overlapping screenshot was from `/dev/trailie-preview`. Added that development route to the same exclusion; a browser check confirmed it too. No itinerary redesign or shared renderer change was needed.

A live setup failure exposed a separate client gap: a streaming fetch rejected before response headers did not acquire the `noAutomaticRetry` marker. The chat then fell back to non-streaming generation. The preview-enabled branch now propagates any streaming failure instead of falling back. The default-off production path is unchanged. A Playwright connection-reset interception subsequently observed exactly one `/api/ai/chat-stream` request and no `/chat` retry. This is a browser request-failure check, not a mid-generation disconnect test.

Fifteen focused frontend tests passed: draft transport (8), rendered harness (4), chat import/contract smoke (3). `git diff --check` passed.

## Isolated live setup

- Real model-first `/api/ai/chat-stream` router, JWT authentication middleware, quota middleware, TripPlan model, guard and canonical store.
- Temporary local MongoDB and a synthetic local test account; no production database connection.
- Existing Zion/Bryce conversation and frozen research, clarified policy, unchanged proposal format/model settings. Research acquisition was replaced by the frozen capture; no provider research fetching or corrections.
- Hard ceiling of three proposal dispatch attempts, with optional bounded memory verification. No successful fresh generation was repeated automatically by the test driver.
- The isolated server omitted unrelated product endpoints; their 404s, websocket failures and a composer hydration warning were visible. This was not a complete production backend deployment.

## What actually happened

The first submission reached the real route. The isolated server's CORS configuration omitted `Access-Control-Allow-Credentials`, while chat fetch uses credentials. The browser rejected the response. Server telemetry recorded `responses_cancelled`, `APIUserAbortError`, about **34.47ms** of adapter latency, no usage and no accepted itinerary. This configuration error belonged to the test harness; it does not establish a production CORS defect.

Before the preview fallback fix, the client initiated a second, non-streaming proposal dispatch. The test processes were stopped. No completed response or usage was captured for that dispatch. **Actual billed token usage and cost are unknown for both attempts; they must not be reported as zero.** Two local dispatch attempts are not evidence that two complete generations occurred at OpenAI.

Credentialed CORS was corrected and the remaining one-slot budget preserved. Subsequent browser attempts did not reach a third provider dispatch. Composer interaction was unstable in this isolated setup: bulk entry sometimes cleared; another observation showed the exact message while Send was disabled. Submission did not produce a draft. Its cause remains unresolved; these observations do not establish a production composer defect. The bounded experiment was stopped with the counter still at **2 proposal attempts / 0 memory calls**.

There is no valid fresh time-to-first-draft or time-to-final-saved-plan measurement from this test. No accepted fresh itinerary was verified. The earlier 26-second parser observation and synthetic 1.3-second browser replay remain separate evidence.

## Remaining gates

Resolve isolated composer/submission readiness before additional paid work. Then verify a fresh stream to a durably saved canonical plan, draft exclusion from persistence/share/export/navigation, and a controlled mid-stream disconnect/cancellation including a commit-race check. Repeated independent live reliability is still unmeasured.

All local servers were stopped and temporary MongoDB shut down. Private captures/scripts are gitignored under `artifacts/private/pass3b-live/` with restricted permissions. Local fixture records were created; production trips were untouched. The second attempt's persistence outcome was not captured before teardown and is not claimed verified.

No commits, deployment, public activation, reserve discovery or broader Passes 4–5. The two narrow changes remain uncommitted.
