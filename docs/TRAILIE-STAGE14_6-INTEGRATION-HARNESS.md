# Trailie Stage 14.6 — Deterministic composed-lifecycle integration harness

**Deterministic synthetic providers only. Zero live provider calls.**
Both production flags disabled by default. Nothing committed or pushed. No new
product behavior. Anonymous persistence untouched.

---

## 0. Both corrections accepted

**§7 cross-surface invariant.** My proposed `displayed === persisted === shared`
was wrong: share and export are deliberately privacy-filtered *projections*. The
harness now asserts the two correct invariants separately — owner-visible content
equals the persisted canonical revision, and shared/exported output equals the
permitted projection of that state. `plan_only` reporting `notesStatus: complete`
while omitting the prose string is now an explicit passing assertion.

**"Duplicate request → one trip".** That was my own contradiction: Stage 14.1 §12
documents that two independently submitted AI requests mint two `responseId`s and
are *not* deduped by `plan.responseId`. Scenario K is now **duplicate delivery /
persistence of the same logical response**, and the report says so where it could
otherwise be misread.

---

## 1. Harness architecture

```
next-frontend/src/__tests__/integration/
  stage14Harness.js    persistence adapter · SSE recorder · simulated client · journal
  stage14Turn.js       drives one server turn with synthetic providers
  stage14Lifecycle.test.js   scenarios A–N + cross-surface + ordering
```

It runs under **vitest**, importing the frontend ESM modules directly and the
server CommonJS modules through `createRequire` rooted in `server/src`, so each
half resolves its own `node_modules`. No production module was changed to make
this work.

Flow per scenario:

```
real server seams → real writeSseEvent → real wire bytes
                  → real consumeAiSseStream (frontend parser)
                  → real coordinator + reducer + message reducers
                  → real persistence DECISIONS over an in-memory store
                  → real stored-presentation resolver + share builder
```

### Stated limitation

The harness does **not** drive `routes/ai.js`. Express wiring, auth and
`prepareChatContext` remain covered by the server-side route contracts
(`earlyEventRouteScope`, `trailieRouteContract`, `routeReplayCanonicalEquality`,
`proseRecoveryRoute`). What 14.6 proves is that the seams *below* those compose.
I am flagging this rather than implying full end-to-end HTTP coverage.

---

## 2. Real seams exercised

| Half | Modules |
|---|---|
| server | `finalizeItinerary.deepFreeze`, `buildRevisionOneOutbound`, `buildRevisionTwoOutbound`, `assertItineraryUnchanged`, `buildMismatchSafeTerminal`, `createEarlyEventEmitter`, `writeSseEvent`, `runProseConsistency`, `canonicalResponse.hashPayload`, `resolveCanonicalResponsePersistence`, `resolveCreateIdempotency`, `mergeTerminalRevisionIntoConversation`, `trailieStoredPresentation`, `sharedTripPayload`, `storedRevisionValidation`, `proseRecoveryLease` |
| client | `consumeAiSseStream`, `earlyRevisionLifecycle`, `earlyRevisionCoordinator`, `earlyRevisionMessages`, `persistCanonicalPlan`, `responseSavePayload`, `trailieStoredPresentation` |

Synthetic only: the two providers, the HTTP layer, and the trip store's storage.
Persistence **decisions** are never mocked as unconditional success — the adapter
tracks `persistenceAttempts / acceptedWrites / idempotentWrites / staleWrites /
conflictingWrites` from real outcomes, and every test starts isolated.

Per §4, the client never has its callbacks invoked manually: the exact frames the
server wrote are re-encoded to bytes and pushed through the production parser.

---

## 3. Scenario results — 48/48 passing

| # | Scenario | Result |
|---|---|---|
| A | normal early delivery | transcript `response_started·thinking·itinerary_ready·prose_generation_started·chunk·stream_end·prose_ready·done`; 2 accepted writes; 1 trip/plan/turn; no third write |
| B | structured failure / prose-only | chunks render, `stream_end` finalizes, 1 legacy terminal write, no card, no rev-1 shell |
| C | disconnect before `itinerary_ready` | 0 persistence attempts, 0 Phase B |
| D | disconnect after `itinerary_ready` | rev 1 durable, `itinerary_only` on restore, recovery offered to owner |
| E | Phase B failure → fallback | `fallback_complete` rev 2, itinerary unchanged, 1 turn |
| F | verifier fail → retry pass | retry becomes rev 2; rejected draft absent from wire, DOM, store **and share** |
| G | retry fail → fallback | neither draft visible; fallback persisted via the normal rev-2 path |
| H | rev-2 itinerary mismatch | no `prose_ready`; candidate absent from the wire; safe terminal from the rev-1 snapshot; accepted by **both** a rev-1-holding client and an old done-only client |
| I | rev-1 persistence failure | no card, no typed rev 2, chunks stay suppressed, exactly 1 terminal write, 1 assistant turn revealed only after it succeeds |
| J | SSE failure during Phase B | rev 1 durable, no partial prose, `itinerary_only`, no automatic paid continuation |
| K | duplicate delivery of one logical response | 1 trip, 1 plan, 1 assistant turn; duplicates idempotent; no extra provider work |
| N | malformed `itinerary_ready` | faults closed; no rev-1 write; chunks suppressed; 1 safe direct-terminal write; malformed payload never displayed or stored |

Scenarios **L (explicit recovery)** and **M (concurrent recovery)** are covered by
the Stage 14.4 route suite (33 tests) rather than re-driven here — including
one-lease-winner / one-409 / exactly-one-Phase-B, the `awaiting_persistence`
transition, and lease retirement on accepted persistence. I did not duplicate
them into the harness; that is a deliberate gap in this stage's scenario list and
is called out rather than papered over.

---

## 4. Provider-call and persistence-write counts

| Scenario | Phase A 1st | Phase A retry | Phase B 1st | Phase B retry | accepted writes |
|---|---|---|---|---|---|
| A normal | 1 | 0 | 1 | 0 | **2** |
| B structured failure | 1 | 0 | **0** | 0 | **1** |
| C disconnect pre-rev-1 | 1 | 0 | **0** | 0 | **0** |
| D disconnect post-rev-1 | 1 | 0 | **0** | 0 | **1** |
| E fallback | 1 | 0 | 1 | 1 | **2** |
| F retry passes | 1 | 0 | 1 | 1 | **2** |
| G retry fails → fallback | 1 | 0 | 1 | 1 | **2** |
| H mismatch fail-safe | 1 | 0 | 1 | 0 | **1** (terminal) |
| I rev-1 write fails | 1 | 0 | 1 | 0 | **1** (terminal) |
| K duplicate delivery | 1 | 0 | 1 | 0 | **2**, replay adds none |
| N malformed rev 1 | 1 | 0 | 1 | 0 | **1** (terminal) |

Every refusal and conflict path spends zero unintended provider calls.

---

## 5. Visibility-before-persistence evidence

Each simulated client keeps an ordered journal. Across **five** scenario shapes
(normal, fallback, retry-then-pass, mismatch fail-safe, disconnect-after-rev-1)
the harness asserts:

```
revision_1_persist_succeeded < itinerary_revealed
revision_2_persist_succeeded < prose_revealed
terminal_persist_succeeded   < terminal_revealed
```

plus `displayedBeforePersistenceCount === 0` and
`displayedPersistedMismatchCount === 0` in every one. Scenario A additionally
asserts `itinerary_revealed < revision_2_persist_started`.

---

## 6. Card, message and plan identity

- card mount count for the `itineraryHash` key is **1** after prose arrives, and
  `cardMounts.size === 1` (no second key ever appears)
- assistant turn keeps its `responseId` while `responseRevision` moves 1 → 2
- conversation length is identical before and after prose
- revision 1 never yields an empty assistant bubble
- no legacy chunk creates a second assistant turn (`legacyChunks === ''`)
- exactly one message carries `itineraryPlan`, even under duplicate delivery

---

## 7. Lease lifecycle evidence

Proven in the Stage 14.4 suites, re-run green here: acquire → Phase B →
`awaiting_persistence` before `prose_ready` → client persists rev 2 →
`tripController` retires the matching lease; stale owner cannot clear a reclaimed
lease; conflicting/stale persistence does not clear it; a repeat before expiry
makes zero provider calls; connection loss after the transition retains it.

Not re-proven in this harness: the *composed* lost-acknowledgment-then-matching-`done`
reconciliation path end to end. The reducer-level behavior is covered
(`revision_2_uncertain` → one idempotent terminal attempt), but not stitched to a
real lease document. Recorded as a gap.

---

## 8. Owner / share / export projections

```
owner-visible content === persisted canonical revision content   ✅ asserted
shared payload        === permitted projection of persisted state ✅ asserted
export payload        === export-contract projection of the plan  ✅ (14.5 suite)
```

Also asserted per scenario: the itinerary comes only from the persisted plan
(`stored.plan.days` deep-equals the client plan and the original fixture); the
itinerary hash is stable across owner restore and share (recomputed over the
shared payload's days); `plan_only` never exposes prose; a revision-1 trip
produces no empty public bubble under **any** of the three scopes.

---

## 9. Resolver differential results

The 17 hand-authored fixtures are retained for named regressions. On top of them,
a bounded matrix enumerates **960 inputs** —
`revision(4) × lifecycle(5) × content(2) × plan(2) × hash(2) × viewer(3) × capability(2)` —
and compares the **normalized presentation result** of the server and browser
resolvers. Zero divergences. Function source text is never compared.

The same sweep asserts, across all 960: never an empty assistant bubble, never
recovery for a shared/export viewer, never prose alongside `invalid`, and only
the bounded coarse notes status.

---

## 10. Privacy sweep

Applied per surface, not as one blanket list:

| Surface | Policy | Evidence |
|---|---|---|
| canonical persistence | revision fields **required** | stored plan carries `responseRevision`/`lifecycleStatus`; assertions read them |
| SSE wire | no markers/artifacts/candidate data | H asserts `Injected` absent; F asserts the rejected draft absent from `recorder.text` |
| visible prose | no internal fields | rejected drafts absent from `client.messages` in F and G |
| share | 18 forbidden keys, all scopes × both revisions | Stage 14.5 suite, re-run green |
| export | 15 forbidden plan fields | Stage 14.5 suite, re-run green |
| private eval capture | unreachable | structural import test unchanged |

---

## 11. Flag-off golden compatibility

Route parity re-run in all three configurations:

```
both flags off        : covered by the server src/ suite (131 → 138 suites, all green)
early events only     : 270/270
both flags on         : 270/270
```

Scenario B is the flag-off shape end to end: with no `itinerary_ready`, the
transcript is exactly `response_started · thinking · chunk · stream_end · done`,
chunks render, and there is exactly one terminal write — the pre-Stage-14 shape.

**Honest scope note:** I did not add frozen byte-level golden transcript files
with a pinned UUID source and clock. The harness uses deterministic ids, a fixed
`now`, and asserts event names, ordering, terminal content, canonical plan,
persistence payload and write count structurally. Byte-frozen goldens remain
outstanding — listed as a rollout prerequisite below.

---

## 12. Shared-route application-cache findings

**`/shared/:shareId` sets no cache headers at all** — verified by inspecting
`server/src/routes/trips.js` (no `Cache-Control`, `res.set`, `setHeader` or
`maxAge` on that route). The payload is built per request from the live trip, so
at the application layer a completed revision 2 is visible on the next fetch;
Stage 14.5 asserts `not_available → complete` across a fresh build.

Because no headers are set, any intermediary applies its own defaults. I could
not verify CDN/proxy behavior from the repository, and I changed nothing here.

**Rollout prerequisite:** verify production CDN/proxy freshness for
`/shared/:shareId` before enabling early delivery, or set an explicit
`Cache-Control` on that route as a separate, deliberate change.

---

## 13. Test results

| Suite | Tests |
|---|---|
| `__tests__/integration/stage14Lifecycle.test.js` | **48 (new)** |
| `utils/__tests__/resolverDifferential.test.js` | **6 (new, 960 inputs)** |
| Stage 14.3/14.3A frontend lifecycle | 190 |
| Stage 14.4 server focused | 137 |
| Stage 14.5 focused | 102 |

```
frontend full suite   : 61 files, 578 tests → 567 passing
server src/ suite     : 138 suites, 1,493 tests → 1,488 passing
route parity, flags on: 24 suites, 270 tests → 270 passing
```

The 11 frontend failures are the same pre-existing unrelated four files
(`Header`, `WeatherWidget`, `useParkExploreIndex`, `buildDayByDayPlanFollowUp`).
The 5 server failures are the unchanged pre-existing live-data ones. No
production module was modified in this stage.

Cumulative Stage 14: frontend 416 → 578 tests; server 1,327 → 1,493.

---

## 14. Remaining rollout prerequisites

1. **Verify `/shared/:shareId` CDN/proxy freshness** (§12) — the only finding
   that could surface stale revision-1 payloads to recipients.
2. **Byte-frozen flag-off golden transcripts** (§11) — currently structural.
3. **Scenarios L/M composed in the harness** — covered at route level, not stitched.
4. **Composed lost-acknowledgment lease reconciliation** (§7 gap).
5. **Recovery quota accounting is NOT metered.** Recovery passes through existing
   authenticated admission and rate limiting, and never increments
   `responseVersion` or anonymous quota — but there is no separate recovery
   budget counter. Stating this plainly rather than claiming it is metered.
6. **Stage 14.7 live confirmation** must run before either flag is enabled.

---

## 15. Proposed Stage 14.7 — two-scenario live latency confirmation

The only stage that spends. Purpose: confirm the projected
`timeToItineraryReadyMs` against the Stage 13.9A baseline, and prove the
displayed-vs-persisted mismatch count is genuinely 0 with real providers.

**Preflight gates** (all must pass before any call): both flags on in a staging
environment only; the same cap-enforced preflight used in 13.9A; explicit
per-run call budget; deterministic scenario inputs pinned in the runner.

**Two scenarios**, matching 13.9A so the numbers are comparable:

| | itinerary-ready (projected) | prose-ready (13.9A measured) |
|---|---|---|
| three-day | ≈ 36.2 s | 64.3 s |
| seven-day | ≈ 53.5 s | 82.3 s |

**Measure**: `timeToItineraryReadyMs`, `timeToProseReadyMs`,
`timeToResponseCompleteMs`, plus the client-side `timeToItineraryVisibleMs` and
`timeToProseVisibleMs` — the last two are what the user actually experiences and
have never been measured live.

**Rollout gates** (from Stage 14.0 §14): displayed-vs-persisted mismatch = 0;
duplicate response rate = 0; revision conflict rate ≈ 0; hard-invariant
violations = 0; `timeToItineraryReadyMs` p50 materially below
`timeToProseReadyMs` p50; post-disconnect provider cost = 0.

**Stop condition**: if `timeToItineraryVisibleMs` is not materially below the
13.9A prose-ready baseline, early delivery buys the user nothing and the flag
should stay off regardless of correctness.

---

## Stop

Stage 14.6 complete. Both flags off, zero live provider calls, no commits.
Stopping before Stage 14.7.
