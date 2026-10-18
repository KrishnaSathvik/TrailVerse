# Answer-only streaming experiment — local, default off

## Release boundary

This is an uncommitted local experiment, not part of frozen release candidate `db419a43`. No release configuration, environment file, deployment, hosted state, or frozen reference was changed by this work. No paid model or research request was made. Existing unrelated working-tree changes remain separate.

Both opt-ins are required: server `TRAILIE_ANSWER_STREAM=true` and frontend build-time `NEXT_PUBLIC_TRAILIE_ANSWER_STREAM=true`. A capable frontend sends `x-trailie-answer-stream: 1`. Neither flag was enabled. Disabling the server flag removes the handoff for subsequent requests immediately; removing the frontend flag requires restarting/rebuilding that frontend. Already-running turns retain their initial selection.

## Protocol and safety boundaries

1. The existing, buffered model-first call may select `begin_conversational_answer`, `read_travel`, `propose_trip_update`, or a normal buffered answer. There is no separate classifier, routing model, or mandatory new selection call. The handoff is an extra tool available within the existing decision call.
2. A completed, sole, valid handoff call commits the **runtime mode**, not a database write. No readable text from that selection call is exposed. Its accompanying prose, if any, remains buffered.
3. The next call uses the same GPT-6.1 Sol model/settings with no tools and `tool_choice: none`. The handoff consumes one additional generation within the existing three-call limit, never raises that limit, and is offered only when another call fits.
4. Only this tool-free call uses upstream text streaming. The collector rejects tool attempts, refusals, incomplete/failed streams, invalid ordering, inconsistent item identity, oversized output, and mismatches between streamed and completed text. The runtime independently rejects any tool call returned after the handoff. No research or mutation can execute afterward.
5. Dedicated `answer_started`, `answer_delta`, and `answer_withdrawn` events use the existing SSE connection in either wire dialect. They do not enter canonical content callbacks, stored message history, TripPlan, guest mirrors, or exports. The UI renders plain, provisional text with a not-saved label and a Stop response action; no sharing or trip actions appear.
6. Conversation acceptance still waits for complete generation and the existing store commit. Only the existing persisted terminal becomes the final answer. Failure, cancellation, disconnection, wrong-response terminal, navigation, or a new request clears provisional UI. No automatic paid replay is introduced.

The experiment is deliberately conservative: existing canonical-plan conversations, explicit edit scopes, mutation/correction turns, and draft-preview turns do not receive the handoff. Research must finish with `fulfilled`, nonempty evidence and no unresolved items before the handoff is offered. Failed/partial research retains the buffered response path. Existing draft-preview flags and behavior are unchanged.

Tool-free execution is a deterministic state boundary, not a proof of factual prose correctness. Selection and answer instructions prohibit itineraries and saved-state claims on this path, but model compliance and travel-answer quality still require controlled acceptance. Offline fixtures cannot demonstrate that the real model always chooses the right path or never hallucinates. This is not approved for production activation.

## Exact fixture call-count impact

| Path | Existing calls | Selected experiment calls | Added calls |
|---|---:|---:|---:|
| Direct ordinary answer | 1 | 2: handoff, streamed answer | 1 |
| Research then ordinary answer | 2 | 3: research selection, handoff, streamed answer | 1 |
| Model chooses an ordinary buffered answer | 1 | 1 | 0 |
| Direct accepted trip proposal | 1 | 1 | 0 |
| Failed research then buffered answer | 2 | 2 | 0 |
| Existing-plan modification/correction | Existing bounded path | Same bounded path; no handoff | 0 |
| Either opt-in off, or nonstream endpoint | Existing path | Existing path | 0 |

These are fixture execution counts, not live selection-rate or latency measurements. Research/provider calls and optional memory verification remain separate from these primary-model round counts. Eligible decision calls include an additional tool description/instruction, so even when no additional round is selected there is some extra prompt-token overhead. No dollar estimate or live speedup is claimed.

Runtime telemetry records `answerStream.handoffMs`, `firstTextMs`, and the actually dispatched `additionalModelCalls`, alongside existing per-call tokens, latency and priced cost. Timings start at runtime entry and measure server callback delivery, **not browser paint**.

## First-readable-text behavior

For direct Q&A, the traveler still waits for the full handoff-selection call. Text then begins on the first ordinary output-text delta of the second call; it does not wait for that call to finish or the conversation commit. For researched Q&A, research and the completed handoff decision both precede the first readable delta.

Offline authenticated and guest SSE endpoint tests hold the answer generator open and observe `answer_delta` arriving at the HTTP client while commit has not run. Frontend DOM tests display this provisional text before any final callback and remove it on terminal/error. This verifies progression and ordering, not real-provider latency, browser layout, or perceived speed.

Therefore the experiment may improve reading responsiveness but may also increase total latency/cost. Leave it disabled until a separately authorized comparison measures handoff time, first readable browser paint, final latency, tokens/cost and answer quality against the buffered baseline. No live acceptance was authorized or performed.

## Validation

- Backend: 150 tests across the new runtime/adapter/endpoint suites and existing runtime, draft-preview, transport and SSE suites passed with provider isolation counters all zero.
- Frontend: 37 tests across the new answer-stream suite and existing model-first stream, negotiation, draft-preview and chat smoke suites passed.
- Targeted ESLint: no errors; three existing warnings remain (two chat hook dependencies and the service's anonymous default export). `git diff --check` passed.
- Coverage includes pre-handoff silence, progressive delivery, research ordering, unexpected late tools, rejection, refusal, interruption, cancellation, commit failure/conflict, wrong terminal identity, stale events, feature rollback and unchanged canonical-plan paths.
- The test runner uses disposable local MongoDB and loopback fixture HTTP; sandbox socket permission was needed. No application/hosted database was used.

## Changed implementation files

- `server/src/utils/trailieAnswerStream.js`
- `server/src/services/trailieSimpleModel.js`
- `server/src/services/trailieSimpleRuntime.js`
- `server/src/utils/trailieTransportAdapter.js`
- `server/src/routes/modelFirstTrailie.js`
- `next-frontend/src/lib/trailieAnswerStream.js`
- `next-frontend/src/services/aiService.js`
- `next-frontend/src/components/ai-chat/ProvisionalAnswer.jsx`
- `next-frontend/src/components/plan-ai/TripPlannerChat.jsx` (also contains earlier, unrelated local UI changes)

New regression suites: `server/src/services/__tests__/trailieAnswerStream.test.js`, `server/src/routes/__tests__/answerStream.test.js`, and `next-frontend/src/services/__tests__/answerStream.test.jsx`. Do not stage the whole working tree as an experimental release.
