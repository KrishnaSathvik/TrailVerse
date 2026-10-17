# Pass 3B — disabled progressive preview prototype

Implemented locally on 2026-10-13. Default off, development only. Not approved for activation.

## Behavior and isolation

- The existing Sol adapter can stream Responses function-call arguments when explicitly opted in. Complete `plan.days` objects become bounded display-only events; raw arguments, evidence, coordinates and identity fields are not sent as previews.
- The complete response must still match the streamed arguments before entering the unchanged normalization, grounding, guard and persistence path. Model, policy, proposal schema, tools and reasoning settings are unchanged. Automatic SDK retries remain disabled.
- The route enables previews only for new itineraries, with both server and client opt-in. Existing-plan edits are excluded. Correction generation retains its existing behavior and does not stream previews; rejection withdraws the initial draft before correction.
- Frontend draft state is separate from canonical plan and message-history state. The UI labels every day unvalidated, warns against booking/navigation, and offers no trip actions. A final response with `persisted: true` and a canonical plan clears the draft and installs the saved plan in one React update batch.
- Rejection, failed persistence, disconnect or cancellation withdraws the draft. Response IDs, event sequence checks and active request ownership prevent stale events from reviving it. A reconnect does not resume drafts or automatically retry generation. Reloading retrieves any canonical outcome separately.
- Cancellation can race with an already completed server commit. Withdrawal copy therefore does not promise that no final plan was saved; it directs the traveler to reload and check.
- Completed model usage and pricing still use the existing normalizer/ledger. Stream header observation is preserved; argument-delta, first-complete-day and completion timings are separate from complete-response latency. An interrupted stream without final usage cannot establish its billed cost.

## Local opt-in and replay

Both switches are unset by default; neither works under `NODE_ENV=production`:

- Backend: `TRAILIE_DRAFT_PREVIEW=true` in development, plus request header `x-trailie-draft-preview: 1`.
- Frontend: `NEXT_PUBLIC_TRAILIE_DRAFT_PREVIEW=true` in development; it sends the header.

The development-only `/dev/trailie-preview` page uses synthetic SSE, the actual SSE consumer, preview component and accepted-plan renderer. It offers accepted, rejected, disconnected, stale, out-of-order and cancelled scenarios without API calls or persistence. Its accepted fixture is explicitly labelled as a fixture; it does not establish a real saved outcome. The route returns not-found with the switch off or in production. No environment files were enabled.

## Verification

- **40 server tests passed** across preview/parser/runtime persistence, existing telemetry and day-completeness guard suites. After preserving stream header telemetry, the affected 19-test subset passed again.
- **37 frontend tests passed** across SSE parity, model-first transport, draft isolation, chat smoke/failure rendering, and four rendered replay scenarios. These are jsdom checks, not browser visual tests.
- Three offline replays of the private captured Sol stream each yielded exactly five days matching the final arguments. Captures remain private and gitignored. Replaying one capture is not independent live reliability evidence.
- New UI/helper/replay files passed ESLint; `git diff --check` passed.
- Provider-isolation counters remained zero. No paid model calls, research, saved-trip writes, commits, deployment or public activation occurred in this task.

## Outstanding acceptance work

Update: subsequent user-authorized standalone Playwright checks verified the replay page at desktop/mobile widths and repaired a mobile harness width issue. See [browser verification](trailie-preview-playwright-2026-10-13.md). The following records the original environment blocker; live-stream and full-chat gates remain open.

Desktop/mobile browser verification is **incomplete**: the Browser runtime reported no available browser, and discovery returned an empty list. Starting the local Next server also failed with sandbox `EPERM` on `127.0.0.1:3107`. No screenshots, browser timing measurements or visual responsiveness claims are made.

Before exposing this to travelers, verify the real chat integration at desktop/mobile widths, scroll/focus behavior, delayed persistence, proxy buffering and real disconnect/reconnection behavior. Repeated independent live streams remain unmeasured. The earlier 26.14-second first day and 70.28-second final validation belong to the isolated feasibility experiment; this prototype does not establish faster generation or browser preview timing.

Production activation, reserve discovery, broader Passes 4–5, historical saved-plan remediation, commits and deployment remain held.
