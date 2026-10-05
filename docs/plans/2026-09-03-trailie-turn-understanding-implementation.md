# Trailie Turn Understanding Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make `TRAILIE_RESPONSE_BEHAVIOR_V1` (`docs/superpowers/specs/2026-09-03-trailie-response-behavior-v1-design.md`) real: one atomic `TurnUnderstanding` result carrying `TravelerJob` and `TurnTripContext` as sibling outputs, computed once per turn, consumed by evidence planning, presentation, generation, and the frontend header — retiring every competing destination/entity/plan-identity authority the trace investigation found, without touching what those authorities feed downstream of the seam.

**Architecture:** `server/src/services/turnUnderstanding.js` already exists and already computes per-message signals (`destinationRefs`, `destinationRelationship`, `requestedArtifact`, `forbiddenArtifacts`, `structurePolicy`, and more) via `buildTurnUnderstanding({ userPrompt, priorTripState })` — real, tested (four existing test files), load-bearing. `server/src/services/trailieTravelerJobResolver.js`'s `resolveTravelerJob` is the higher-level function that already calls it and already composes its raw signals with `priorTripState`-aware job-decision logic into one returned object (`{ job, ..., understanding }`) — this, not `buildTurnUnderstanding` itself, is the correct, minimal-diff home for the atomic `TravelerJob` + `TurnTripContext` composition the spec's §3 describes (see Established Facts, Q4). This plan extends `turnUnderstanding.js` only with the low-level material `TurnTripContext` needs (hydrated `subjectDestinations`, and reading one new conversation-derived `priorTripState` key), and extends `resolveTravelerJob`'s own return object with a new `tripContext` sibling key that performs the actual `relationship`/`activeContextAction` resolution — then, phase by phase, makes the modules the trace found independently guessing destination/trip-identity/plan-target into consumers of this one result. `presentationManifest.js`, `evidencePlannerService.js`, canonical itinerary generation, validators, and repair logic are unmodified throughout; they keep reading `intent`/`resolvedEntities`/`priorTripState` exactly as today, just with correct inputs.

**Tech Stack:** Node/Express server, Jest via `cd server && npx jest <pattern>` for targeted runs and `cd server && npm run test:non-network` for the full non-network suite before any task is considered done; Next.js/React for the two frontend files in Phase 3; artifacts harness pattern from `artifacts/trailie-rollout-readiness-gate/harness.js` (scripted `executeResponses`, real `executeTrailieV2Turn`) for Phase 5's offline matrix.

**Hard scope limits (user-mandated):**
- No modifying `presentationManifest.js`, `evidencePlannerService.js`/WP5A internals, canonical itinerary generation, validators, or repair logic — these are unchanged consumers.
- No commit, no push, no deploy.
- No model/provider changes.
- No live/paid model calls until Phase 5's deterministic/offline matrix passes. Any live validation beyond that is a separate, later, explicitly-authorized task — not part of this plan.
- Do not reorder the five phases below; each is a prerequisite for the next as the user specified.

---

## Established facts (from code reading, 2026-09-03 — re-verified against current code for this plan, not copied from earlier trace reports without re-checking)

**The existing `TurnUnderstanding`-adjacent module (the single most important fact this plan is built on — not present in either earlier trace report):**

- `server/src/services/turnUnderstanding.js` (792 lines) exports `buildTurnUnderstanding({ userPrompt, priorTripState })` (`turnUnderstanding.js:619-776`). Its caller is **not** `trailieIntentClassifier.js` directly — that file only imports the `ARTIFACTS`/`STRUCTURE_POLICIES` constants straight from `turnUnderstanding.js` (`trailieIntentClassifier.js:82-83`). The actual call happens one level down, inside `resolveTravelerJob({ userPrompt, priorTripState, understanding })` (`server/src/services/trailieTravelerJobResolver.js:153-157`: `const turn = understanding || buildTurnUnderstanding({ userPrompt, priorTripState })`), which `trailieIntentClassifier.js:198` calls and then reads `travelerJobResolved.understanding`/`.job`/`.structurePolicy`/etc. from throughout the rest of the classifier, finally re-exposing some of it at the top level of its own return value (e.g. `understanding`, `destinationRelationship` — `trailieIntentClassifier.js:558,563`).

- **Q1 — reusable unchanged by `TurnTripContext`:** `requestedArtifact`/`forbiddenArtifacts`/`structurePolicy` (`turnUnderstanding.js:741-743`, feed `deriveExecutionContract`, entirely orthogonal to destination/trip-identity); `destinationRelationship`/`destinationRelationshipConfidence`/`destinationRefs` (`turnUnderstanding.js:745-751`, already scoped correctly to "how do the destinations *named in this one message* relate to each other" — this is the direct, correct source for the spec's `destinationRelationship`, and `destinationRefs` is the direct, correct raw material for `subjectDestinations` once hydrated with lat/lon/source/confidence); `temporalScope`/`operationalSubjects`/`explicitConstraints`/`softPreferences`/`taskFamily`/`taskStrength`/`confidence`/`underspecified`/`missingInformation` — all message-local or task-decision signals with no destination-continuity claim baked in, safe as-is.

- **Q2 — must NOT be reused for conversational-subject continuity (the spec's `relationship` field), even though they look adjacent:** `priorJob` (`turnUnderstanding.js:623`: `priorTripState?.activeDecision?.kind || priorTripState?.lastTravelerJob`) carries zero destination information — it is the active *decision/job*, not a subject. `continuationOfActiveDecision` (`turnUnderstanding.js:653-655`: `Boolean(priorJob && isShortFollowUp && task.strength !== EXPLICIT)`) asks "is this short follow-up still working the same active *task*," not "is this the same *destination* being discussed." `topicShift` (`turnUnderstanding.js:658-663`: `Boolean(priorJob && !continuationOfActiveDecision && task.strength !== WEAK && jobBelongsToFamily(priorJob) !== task.taskFamily)`) fires on a *task-family* change against the *active decision* — a traveler can ask about a brand-new park's weather (same `general_advice`/`current_conditions` task family) with `topicShift: false` even though the destination changed, or stay on the same destination while switching task family and get `topicShift: true` even though the subject didn't move. Neither field can distinguish the spec's Redwood-active → "Is October nice in Acadia?" → "What about November?" pair (subject: Redwood, then Acadia, then Acadia again; active trip: Redwood throughout) — both would read against `priorJob`/active-decision state, which never left Redwood, and so would never recognize Acadia as the continuing subject in turn two.

- **Q3 — the minimal additional input, re-verified against the real prior-state builder (not a new-plumbing exercise):** `buildClassifierPriorTripState(preparedContext)` (`trailieV2RouteBridge.js:235-274` — the real, authoritative prior-state builder; `ai.js`'s `intentPriorTripState` at `:1150-1164` is the discarded observational one and is out of scope here) **already receives the full conversation array** — `const conversation = saved?.conversation || preparedContext?.conversation || []` (`trailieV2RouteBridge.js:257`) — and already scans it once, `const lastAssistant = [...conversation].reverse().find((message) => message?.role === 'assistant')` (`:258`), but extracts only `lastAssistant?.intent?.travelerJob` from it (`:263-264`). Nothing about *what destination* the last exchange was about is extracted today. The minimal fix is therefore not a new parameter threaded into `buildTurnUnderstanding` — its signature (`{ userPrompt, priorTripState }`) does not need to change at all. It is: extend `buildClassifierPriorTripState` to derive one additional field (e.g. `lastConversationalSubject`) from the `conversation` it already has in scope, and add that field to the `priorTripState` object it already returns; `buildTurnUnderstanding` then reads this one new key off the existing `priorTripState` argument, exactly the way it already reads `priorTripState?.activeDecision?.kind`. The exact extraction mechanism (re-resolving destinations from recent message text, vs. reading a per-turn destination echo if one is already persisted on assistant messages) is Phase 1's implementation detail, not decided here.

- **Q4 — which function owns the atomic `TravelerJob` + `TurnTripContext` composition:** `resolveTravelerJob` (`trailieTravelerJobResolver.js:153-340`), not `buildTurnUnderstanding`. `resolveTravelerJob` is already the higher-level decision layer: it takes `buildTurnUnderstanding`'s raw per-message signals (`turn`) plus `priorTripState`, runs its own `priorTripState`-aware phrase ladder, and returns one composite object that already embeds `understanding: turn` (`trailieTravelerJobResolver.js:172-180`) alongside the decided `job`. That is precisely the spec's §3 shape — sibling outputs of one resolution pass — already instantiated in real code for `TravelerJob` alone. The correct, minimal-diff move is to add `tripContext: {...}` as a new sibling key on `resolveTravelerJob`'s existing return object, computed from the same `turn` + `priorTripState` already in scope there, rather than deepening `buildTurnUnderstanding` (a per-message signal extractor, pinned by four existing test files) with cross-turn continuity reasoning it was not designed to own.

- `turnUnderstanding.js` is tested by four existing files: `server/src/services/__tests__/turnUnderstanding.test.js`, `turnUnderstandingContinuity.test.js`, `turnUnderstandingHardening.test.js`, `turnUnderstandingInvariants.test.js`; `trailieTravelerJobResolver.js` by `server/src/services/__tests__/trailieTravelerJobResolver.test.js`. Phase 1 must read all five before touching either file, and must not break any of them (additive fields only on both — no renamed/removed existing keys on either function's return shape; `deriveExecutionContract` and other consumers of `requestedArtifact`/`forbiddenArtifacts`/`structurePolicy`/`job`/`understanding` must see no change).

**The double-classification problem, re-verified exact:**

- `server/src/routes/ai.js:1165-1168` computes `intentV2` from `intentPriorTripState` (built at `ai.js:1150-1164`), explicitly commented (`ai.js:1147-1149`) as observational-only. Re-verified line-exact against current code.
- `server/src/services/trailieV2ExecutionService.js:1754` computes the real, authoritative `intent` from `frozenTripState` = `buildClassifierPriorTripState(preparedContext)` (`server/src/services/trailieV2RouteBridge.js:235-274`) — a differently-shaped prior-state object than `intentPriorTripState`. Re-verified line-exact.
- `intentV2`'s only downstream reader, checked fresh for this plan (not assumed from the earlier trace): `server/src/services/trailieTurnLedger.js:203-215`, `intentFromEvent()` — reads `event.intentV2.{primaryIntent,verticals,depth,freshness,actionability,scope,entities,confidence,reasonCodes,compound}` purely for turn-ledger telemetry recording. No other consumer exists (`grep` for `.intentV2`/`.intentShadowInput` across `server/src` outside `ai.js` itself returns only this one call site). This confirms the WP2 comment's claim and means Phase 2's collapse can safely replace `intentV2` with a projection of the real classification, preserving `trailieTurnLedger.js`'s expected shape exactly.

**The stale-`tripScope` bug (Fix 2's concrete root cause), re-verified:**

- `applyTripScopeRefinement(persisted, message)` (`server/src/utils/planningState.js:861-905`) has branches for one-way/loop route-shape (`:868-872`), skip/remove (`:874-888`), add (`:890-897`), and max-drive (`:899-902`) — and **no branch at all** for "the traveler named a destination set that doesn't overlap the persisted one." When none of its regexes match, it falls through to `return normalizeTripScope(scope) || scope` (`:904`) — the untouched, stale scope. Re-verified line-exact.
- `resolveEntitiesFromContext` (`server/src/services/trailieV2RouteBridge.js:103-198`) consults, in order: `preparedContext.entryContext.{comparisonTargets,requestedDestinations}` (`:117-142`, returns early if non-empty), then `preparedContext.constraints.tripScope.destinations` (`:144-147`), then `preparedContext.allExtractedParks` (`:149-175`). Re-verified line-exact.
- **Correction to an assumption in the earlier trace report:** `resolveEntitiesFromContext` already builds an *array* of entities in every one of its three branches (`entryEntities`/`destEntities`/`entities`, all `Array`) — it already structurally supports multiple destinations. The bug is authority/priority ordering (stale/pinned sources checked before the current turn's real resolution), not a singular-vs-array representation gap. Phase 3's fix is a source swap, not new multi-destination plumbing.

**The `planningState.destination` field, re-verified exact:** `server/src/utils/planningState.js:40` (empty-state shape), `:266-272` (`normalizePersistedPlanningState`'s hydration from a raw persisted object), `:444-445` inside `buildPlanningStateFromRuntime({ previous, constraints, tripState, formData, parkCode, parkName, ... })` (`planningState.js:412-...`) — `next.destination.parkCode = c.parkCode || ts.destination?.parkCode || parkCode || fd.parkCode || next.destination.parkCode`. Called from exactly one site: `server/src/utils/constraintEngine.js:586`. Re-verified line-exact; the earlier trace's citation (`planningState.js:40, 266-272, 444-447`) holds.

**The Turn-E historical-reference gap, re-verified exact:** `tripId = metadata.tripId || body.tripId || body.conversationId` (`server/src/routes/ai.js:916`), used at `ai.js:920` (`TripPlan.findById(tripId)`). No other resolution path exists. `buildArtifactNotAppliedMessage`'s generic copy is at `server/src/services/artifactFulfillment.js:135` exactly (not 131-140 loosely — the literal string is line 135). `unrelated_assistant_mutation` is at `server/src/validation/tripWriteContract.js:337`.

**Frontend header, re-verified exact:** `next-frontend/src/hooks/usePlanAI.js:87` (`selectedParkName` state, never set again outside mount/URL/session-restore effects), `:111` (wizard `formData` default `groupSize: 2`) vs. `:47` (chat form default `groupSize: 1`). `next-frontend/src/lib/planAiHeaderMeta.js:72` (`resolvePlanningParkName`, prop-wins-if-set), `:33` (`buildDateSubtitle`, reads `formData.groupSize` raw, not provenance-filtered). `next-frontend/src/components/plan-ai/TripPlannerChat.jsx:1605-1620` (`requestMetadata` construction — `travelerOwnedFormData` is correctly provenance-filtered for the model at `:1620`, but the header path never calls `selectTravelerOwnedFormData`).

**One imprecise citation caught by re-checking (not code drift — my own earlier citation was off by two lines):** `destinationRelationship.js`'s `DESTINATION_RELATIONSHIPS` enum previously cited as `:19-26`; re-verified the array literal actually spans `:17-25` (`const DESTINATION_RELATIONSHIPS = Object.freeze([` at line 17 through the closing `]);` at line 25). Corrected below.

**`destinationRelationship.js`, `evidencePlannerService.js`, `presentationManifest.js`, `travelerVoiceLeakage.js`, `activeTripContextService.js`, `artifactFulfillment.js`, `tripWriteContract.js` — every other line citation from the earlier trace reports re-verified byte-exact against current code; no other drift found.**

---

## Phase 1 — one atomic `TurnUnderstanding` result, isolated, no live-path wiring

### Task 1a: `turnUnderstanding.js` — additive low-level material only

**Files:**
- Modify: `server/src/services/turnUnderstanding.js`
- Read first (do not break): `server/src/services/__tests__/turnUnderstanding.test.js`, `turnUnderstandingContinuity.test.js`, `turnUnderstandingHardening.test.js`, `turnUnderstandingInvariants.test.js`
- Test: extend `server/src/services/__tests__/turnUnderstanding.test.js` (or a sibling file in the same directory, matching the existing four files' convention)

Reuse unchanged (Q1): `requestedArtifact`, `forbiddenArtifacts`, `structurePolicy`, `destinationRelationship`, `destinationRelationshipConfidence`, `taskFamily`, `taskStrength`, `temporalScope`, `operationalSubjects`, `explicitConstraints`, `softPreferences`, `underspecified`/`missingInformation`. None of these change.

Add, additively, to `buildTurnUnderstanding`'s return object (no existing key renamed or removed, `buildTurnUnderstanding`'s *signature* stays `{ userPrompt, priorTripState }` — unchanged):

```js
subjectDestinations: [{ name, parkCode, lat, lon, source, confidence }],
primaryDestination: {...} | null,
```

Hydrate the existing `destinations` array (already resolved via `resolveDestinationsFromMessage`, `turnUnderstanding.js:627`) with `lat`/`lon`/`source`/`confidence`, reusing `activeTripContextService.js`'s `toPrimaryDestination()` shape (`activeTripContextService.js:31-46`) as the target shape so downstream consumers (Phase 3) see one consistent destination object everywhere. This is a pure hydration of `destinationRefs`'s existing content — no continuity/subject reasoning here.

Additionally, read one new key off the existing `priorTripState` argument (do not add a parameter): `priorTripState?.lastConversationalSubject` — populated by Task 1c, not by this file. Expose it unchanged as `priorConversationalSubject` in the return object, for `resolveTravelerJob` (Task 1b) to consume; `turnUnderstanding.js` itself performs no continuity decision — per Q2, `continuationOfActiveDecision`/`topicShift`/`priorJob` stay exactly as they are (task/active-decision signals) and are **not** touched or reused for subject continuity.

**Steps (TDD):** Failing test: `priorTripState.lastConversationalSubject = { name: 'Acadia', parkCode: 'acad' }` → asserts `buildTurnUnderstanding(...).priorConversationalSubject` round-trips it unchanged. Failing test: message "Yosemite or Sequoia?" → asserts `subjectDestinations` has two hydrated entries with lat/lon/source/confidence populated (today's `destinationRefs` lacks these). Run `cd server && npx jest turnUnderstanding --silent` to see them fail, implement, green — including the four pre-existing files in that same run, zero regressions (additive-only).

### Task 1b: `resolveTravelerJob` — the atomic `TravelerJob` + `TurnTripContext` composition site

**Files:**
- Modify: `server/src/services/trailieTravelerJobResolver.js`
- Test: `server/src/services/__tests__/turnTripContext.test.js` (new)

Add `tripContext` as a new sibling key on `resolveTravelerJob`'s existing `result(...)` helper (`trailieTravelerJobResolver.js:172-180`), alongside the current `job`/`durationDays`/`understanding`/etc. — computed from the same `turn` (now carrying `subjectDestinations`/`primaryDestination`/`priorConversationalSubject` per Task 1a) and `priorTripState` (carrying `activeTripBeforeTurn`, distinct from `priorConversationalSubject`) already in scope in this function:

```js
tripContext: {
  subjectDestinations, primaryDestination,        // from turn, Task 1a
  destinationRelationship,                          // from turn, unchanged (Q1)
  explicitDestinationMention: subjectDestinations.length > 0,
  activeTripBeforeTurn,                             // from priorTripState
  relationship: 'new' | 'continuation' | 'historical_reference',
  activeContextAction: 'preserve' | 'set',
  ambiguity: null,                                  // populated in Phase 4
}
```

`relationship` (spec §5.3, exact rule): `continuation` when `subjectDestinations` matches `turn.priorConversationalSubject` (the most recent conversational subject — which may differ from `activeTripBeforeTurn`), or the turn is a bare follow-up/refinement carrying no explicit destination of its own; `historical_reference` when `subjectDestinations` names something that was an *older*, no-longer-current subject (not `priorConversationalSubject`, and not `activeTripBeforeTurn`) AND reference language points at it specifically; `new` otherwise — this correctly covers both a first-ever ask and an ordinary side-query about a brand-new park, per spec §5.3.

`activeContextAction`: `set` only when both hold — this turn's `job` is itinerary-shaped (`day_by_day_itinerary`/`itinerary_refinement` naming a new destination — reuse `shouldForceStructuredItinerary`, already exported from this file, `trailieTravelerJobResolver.js:387-389,401`) AND `subjectDestinations` names a destination that is not `activeTripBeforeTurn`'s (or there is no `activeTripBeforeTurn`); `preserve` otherwise.

**Steps (TDD):** Write failing tests first, covering every row of the spec's §5.3 worked-examples table and §9.1's six-row table verbatim (Acadia-while-Yellowstone as `new`+`preserve`, the Acadia→November pair as `continuation`+`preserve` — this is the case that specifically requires `priorConversationalSubject` to differ from `activeTripBeforeTurn`, Zion-first-ask, Redwood→Badlands switch, Badlands "Make Day 2 easier" as `continuation`, Badlands→Redwood historical reference). Run `cd server && npx jest turnTripContext --silent` to see them fail. Implement. Green. Then `cd server && npx jest trailieTravelerJobResolver --silent` for the existing suite — zero regressions.

### Task 1c: derive `lastConversationalSubject` in the existing prior-state builder

**Files:**
- Modify: `server/src/services/trailieV2RouteBridge.js` (`buildClassifierPriorTripState`, `:235-274`)
- Test: `server/src/services/__tests__/trailieV2RouteBridge.test.js` (extend)

Per Q3: this function already has `conversation` in scope (`:257`) and already scans it for `lastAssistant` (`:258`) — extend it to also derive `lastConversationalSubject` from that same array (e.g. the most recent turn's resolved/echoed destination, distinct from and not required to match `active?.primaryDestination`) and add it to the returned object alongside the existing `hasActiveTrip`/`hasItinerary`/`lastTravelerJob`/`activeDecision` keys. No new parameter on `buildClassifierPriorTripState` itself, and — per Phase 1 staying isolated, no live-path wiring yet — this task only makes the field available; nothing calls `resolveTravelerJob` with it live until Phase 2/3 wire the real call sites.

**Steps (TDD):** Failing test: conversation array where the most recent exchange discussed Acadia (via whatever field the implementation reads — decide and document during implementation, not here) while `active.primaryDestination` is Redwood → asserts the returned `lastConversationalSubject` is Acadia, not Redwood. Run `cd server && npx jest trailieV2RouteBridge --silent`, fail, implement, green.

### Task 2: `targetTripId` shape only (resolution logic deferred to Phase 4)

**Files:**
- Modify: `server/src/services/trailieTravelerJobResolver.js` (same `tripContext` object as Task 1b)
- Test: extend `turnTripContext.test.js`

Add `targetTripId: string | null` and `targetConversationPlanId: string | null` to `tripContext`, always `null` in this phase (no DB access yet). Add `needsTargetTripId: boolean` computed per the spec's §5.5 gate (`job` is a refinement / historical-plan question / saved-trip operation / plan-needing itinerary request) so Phase 4 has a ready-made boolean to consume instead of re-deriving the gate.

**Steps (TDD):** Tests assert `targetTripId === null` and `needsTargetTripId` matches the spec's gate for each `TravelerJob` category (general_qa/recommendation/comparison/logistics → `false`; refinement/historical_reference/itinerary → `true`). `cd server && npx jest turnTripContext --silent`.

---

## Phase 2 — retire competing authorities: collapse the double classification, make `tripScope` a consumer

### Task 3: collapse the double `classifyTrailieIntent` call

**Files:**
- Modify: `server/src/routes/ai.js` (remove the `intentV2`/`intentPriorTripState`/`intentShadowInput` computation at `:1150-1172`; `preparedContext` no longer carries an independently-computed `intentV2`)
- Modify: `server/src/services/trailieV2RouteBridge.js` (`runTrailieV2FromPreparedContext`, `:403-421`) — after `executeTrailieV2Turn` returns `result`, build a `trailieTurnLedger`-shaped projection of `result.intent` (the one call already made inside `executeTrailieV2Turn` at `trailieV2ExecutionService.js:1754`) instead of a second classification
- Modify: `server/src/services/trailieTurnLedger.js:203-215` only if the projection's field names differ from what `intentFromEvent` expects (they shouldn't, per Established Facts — same `classifyTrailieIntent`-shaped object)
- Test: `server/src/services/__tests__/trailieTurnLedger.test.js` (extend), `server/src/routes/__tests__/*` (search for any test currently asserting `preparedContext.intentV2` exists and update it to assert the projection instead)

**Steps (TDD):** First, `grep -rn "intentV2\|intentShadowInput" server/src --include="*.test.js"` to find every test that references the old shape — read each before touching anything. Write/adjust a failing test asserting the turn ledger receives a correct intent projection sourced from the *single* real classification (assert, e.g. via a spy/stub on `classifyTrailieIntent`, that it is called exactly once per turn, not twice). Run to see it fail against current code (two calls). Implement the removal + projection. Run `cd server && npx jest trailieTurnLedger --silent`, then the full `cd server && npm run test:non-network` — zero regressions.

### Task 4: `tripScope` becomes a consumer of `TurnTripContext`, not a second destination-switch detector

**Files:**
- Modify: `server/src/utils/constraintEngine.js` (wherever `parseConstraints` calls `applyTripScopeRefinement`/`buildTripScopeFromMessage`, `constraintEngine.js:488-490` per the Established Facts citation) — thread `TurnTripContext.primaryDestination`/`subjectDestinations` through as an input
- Modify: `server/src/utils/planningState.js` (`applyTripScopeRefinement`, `:861-905`) — add a synchronization step, not a detection branch
- Test: `server/src/utils/__tests__/planningReadinessPass2.test.js` or wherever `applyTripScopeRefinement`'s existing coverage lives (check first)

The earlier draft of this task added a "does the message name a different destination" branch directly inside `applyTripScopeRefinement`, re-reading the message to detect a switch. That would make `tripScope` independently smart about destination switches — a second authority computing the same judgment `TurnTripContext.relationship`/`activeContextAction` already makes in Phase 1, exactly the duplication the spec exists to eliminate. **Do not implement that.**

Instead: `applyTripScopeRefinement` keeps only its current, legitimate route-shape/skip/add/max-drive responsibilities (`:868-902`) and gains no message-driven destination-switch detection of its own. Synchronization happens one level up, where the caller already has both the persisted `tripScope` and the resolved `TurnTripContext`: when `TurnTripContext.activeContextAction === 'set'` (Phase 1's field — already the authoritative "this turn's destination becomes the focus" signal, spec §5.3), the caller replaces `tripScope.destinations`/`type` with a fresh scope built from `TurnTripContext.primaryDestination`/`subjectDestinations` *before* handing anything to `applyTripScopeRefinement` — so by the time `applyTripScopeRefinement` runs its own route-shape/skip/add/max-drive logic, it is already operating on the correct destination set. When `activeContextAction === 'preserve'`, `tripScope` is left exactly as `applyTripScopeRefinement` would produce today (no change in behavior for continuation/refinement turns).

**Steps (TDD):** Write a failing test at the `constraintEngine.js` call site: `TurnTripContext` carrying `activeContextAction: 'set'`, `primaryDestination: Badlands`, persisted Redwood `single_destination` tripScope, message "Try again — plan a 2 day trip to Badlands National Park" → asserts the resulting `tripScope.destinations` is `[Badlands]`, not `[Redwood]` (today's bug, reproduced from the original trace's Turn B/C) — and that this happens via the `TurnTripContext` sync, not via any new message-matching logic inside `applyTripScopeRefinement` itself (assert `applyTripScopeRefinement` is called with the already-corrected scope, e.g. via a spy). Second test: `activeContextAction: 'preserve'` with a destination-differing side-query → asserts `tripScope` is unchanged, confirming `applyTripScopeRefinement`'s existing route-shape/add/skip/max-drive behavior is untouched. Run `cd server && npx jest constraintEngine --silent` (or wherever the new test lives) to see it fail, implement, green. Then `cd server && npx jest planningState --silent` for `applyTripScopeRefinement`'s own existing suite — zero regressions, since this function's internals are not being changed.

### Task 5: neutralize `entryContext.requestedDestinations` as an independent priority source

**Files:**
- Modify: `server/src/services/trailieV2RouteBridge.js` (`resolveEntitiesFromContext`, `:103-198`)
- Test: `server/src/services/__tests__/trailieV2RouteBridge.test.js` (extend)

Reorder: `preparedContext.allExtractedParks` (already reflecting the current turn's real resolution, post-Task-4) becomes the first-checked source; `entryContext.requestedDestinations`/`tripScope.destinations` become disambiguation-only inputs consulted **only** when `allExtractedParks` is empty. This is the source-swap referenced in Established Facts — no new array-handling logic needed (already array-shaped in every branch).

**Steps (TDD):** Failing test: session entryContext pinned to Redwood (`?park=redw` arrival), later turn's message names Badlands with `allExtractedParks = [Badlands]` → asserts `resolveEntitiesFromContext` returns Badlands, not Redwood (today's bug). Run, see fail, implement, green. Run `cd server && npx jest trailieV2RouteBridge --silent`, then full non-network suite.

---

## Phase 3 — synchronize `resolvedEntities`, `planningState.destination`, and the frontend header from one result

### Task 6: wire `buildResolvedContext`/`resolveEntitiesFromContext` to `TurnTripContext.subjectDestinations`

**Files:**
- Modify: `server/src/services/trailieV2RouteBridge.js` (`buildResolvedContext`, `:200-225`; `resolveEntitiesFromContext`, `:103-198`) — accept the `TurnTripContext` result (now available from Phase 1's module, called once inside `runTrailieV2FromPreparedContext` before `executeTrailieV2Turn`) and project `resolvedEntities` directly from `subjectDestinations`
- Test: `server/src/services/__tests__/trailieV2RouteBridge.test.js` (extend)

This supersedes Task 5's reordering with the spec's actual target state: once `TurnTripContext` exists, `resolveEntitiesFromContext`'s three-branch chain is replaced outright by a direct projection, not merely reprioritized. Task 5 remains valuable as an intermediate, independently-testable fix in case Phase 3 slips; Task 6 is the spec-conformant end state.

**Steps (TDD):** Failing test: multi-destination turn ("Yosemite or Sequoia?") → asserts `resolvedEntities` contains both, sourced from `subjectDestinations`, with no dependency on `entryContext`/`tripScope` at all. Run, fail, implement, green. Full suite.

### Task 7: `planningState.destination` reads from `TurnTripContext.primaryDestination`

**Files:**
- Modify: `server/src/utils/constraintEngine.js:586` (the sole call site of `buildPlanningStateFromRuntime`) to pass `TurnTripContext.primaryDestination` through as the `parkCode`/`parkName` params, taking priority over the existing `c.parkCode`/`ts.destination?.parkCode`/`fd.parkCode` chain at `planningState.js:444-445`
- Modify: `server/src/utils/planningState.js:444-445` only if the priority order itself needs to change (likely: `TurnTripContext` result first, existing chain as fallback for turns where `TurnTripContext` wasn't computed — e.g. legacy/non-v2 paths)
- Test: `server/src/utils/__tests__/trailieContextBuilder.test.js` or wherever `buildPlanningStateFromRuntime` already has coverage (check first with `grep -rln "buildPlanningStateFromRuntime" server/src/utils/__tests__`)

**Steps (TDD):** Failing test: `TurnTripContext.primaryDestination = Badlands`, stale `tripState.destination = Redwood` → asserts `planningState.destination.parkCode === 'badl'`. Run, fail, implement, green. Full suite.

### Task 8: frontend header — stop trusting the sticky `selectedParkName` prop unconditionally

**Files:**
- Modify: `next-frontend/src/lib/planAiHeaderMeta.js` (`resolvePlanningParkName`, `:72-91`) — prefer the latest assistant message's `parkName`/`parkNames` (already server-echoed from `TurnTripContext.primaryDestination` per Phase 1-3) over the `parkName` prop when the two disagree and the message is newer than whatever last set the prop; keep the prop as the pre-first-response fallback only
- Modify: `next-frontend/src/lib/planAiHeaderMeta.js` (`buildDateSubtitle`, `:33-42`) — route `formData` through `selectTravelerOwnedFormData` (`next-frontend/src/lib/formDataProvenance.js`) before reading `.groupSize`, so an untouched wizard default (`groupSize: 2`) never renders as "2 travelers"
- Test: `next-frontend/src/lib/__tests__/planAiHeaderMeta.test.js` (extend — this file already exists per the earlier trace)

**Steps (TDD):** Failing test 1: `parkName` prop = "Redwood" (stale, set at mount), latest assistant message `.parkName` = "Badlands National Park" → asserts the resolved header name is Badlands. Failing test 2: `formData` has untouched `fieldProvenance: {}` and `groupSize: 2` → asserts `buildDateSubtitle` does not include "2 travelers". Run `cd next-frontend && npx jest planAiHeaderMeta` (or the repo's configured test runner — verify exact command via `next-frontend/package.json`'s `"test"` script before running), see both fail, implement, green.

---

## Phase 4 — historical-plan targeting: wire `targetTripId` resolution into `prepareChatContext`

### Task 9: build the 5-step `targetTripId` resolver

**Files:**
- Create: `server/src/services/tripIdentityResolver.js`
- Test: `server/src/services/__tests__/tripIdentityResolver.test.js`

Implement the spec's §5.5 five-step order as a standalone, DB-touching function: `resolveTargetTripId({ turnTripContext, userId, isAnonymous, anonymousSessionPlans })`. Step 1 (explicit title) and step 3 (destination + disambiguators) require a `TripPlan.find({ user: userId, ... })` query scoped to the traveler's own saved trips only. Steps 4-5 are pure logic over the query result (single match / zero-or-many → ambiguity). Only called when `turnTripContext.needsTargetTripId === true` (Phase 1's Task 2 field) — never for Q&A/recommendation/comparison/logistics.

**Steps (TDD):** Failing tests per step: explicit title match; conversation-plan association (delegates to existing behavior, no DB query needed — this step stays as `ai.js`'s current `tripId` lookup, wired in Task 10, not reimplemented here); single unambiguous destination match; zero matches → `ambiguity` populated, `targetTripId: null`; two-or-more matches (the "Redwood weekend · May" / "Redwood family trip · August" case from the spec) → `ambiguity` populated with both candidates. Run `cd server && npx jest tripIdentityResolver --silent`, fail, implement, green.

### Task 10: wire into `prepareChatContext`'s tripId lookup

**Files:**
- Modify: `server/src/routes/ai.js` (around `:916-926`) — when `TurnTripContext.relationship === 'historical_reference'` and `needsTargetTripId === true`, call `resolveTargetTripId` instead of trusting `metadata.tripId || body.tripId || body.conversationId` as the plan to load/mutate; on `ambiguity`, short-circuit the turn to a clarifying-question response (reusing whatever response-shaping mechanism `ai.js` already uses for other early-return clarification cases — locate and reuse, do not invent a new response path)
- Test: `server/src/routes/__tests__/*` (new or extended — locate the existing test file pattern for `prepareChatContext` route-level behavior first)

**Steps (TDD):** Failing test reproducing the exact original trace transcript: Badlands active, saved Redwood plan exists, message "For my Redwood trip, on Day 2…" → asserts `savedTripPlan` resolves to the Redwood `TripPlan`, not whatever `conversationId` the client happened to send. Second failing test: two Redwood trips exist → asserts the turn short-circuits to a clarifying question, never reaches `validateArtifactFulfillment`/`artifactFulfillment.js:135`'s generic copy. Run, fail, implement, green. Full non-network suite.

### Task 11: pin the Turn-E regression as a named fixture

**Files:**
- Create: `server/src/routes/__tests__/fixtures/historicalPlanReference/redwood-badlands-turnE.json` (or extend whichever fixture directory Task 10's test file uses)
- The Task 10 test reads this fixture so the exact original trace transcript survives future refactors, matching this repo's existing fixture-pinning convention (see the Sept 1 reliability-pass plan's Task 4 for precedent).

---

## Phase 5 — behavior-matrix acceptance: deterministic/offline, before any live validation

### Task 12: build the offline, park-rotated 8×5 matrix harness

**Files:**
- Create: `artifacts/trailie-turn-understanding-matrix/harness.js` (modeled on `artifacts/trailie-rollout-readiness-gate/harness.js`'s scripted-turn pattern)
- Create: `artifacts/trailie-turn-understanding-matrix/cases.js` (the 8×5 = 40 scripted turns, park-rotated per the spec's §12 requirement — no category repeats a park pair, and `general_qa`/`recommendation`/`current_logistics`/`comparison` each include at least one destination-differs-from-active case per the spec's cross-cutting acceptance sentence)

This harness asserts `TurnUnderstanding` output (`TravelerJob`, `subjectDestinations`, `destinationRelationship`, `relationship`, `activeContextAction`, `targetTripId`, `ambiguity`) and the resulting `presentationManifest.buildPresentationManifest` selection — both pure/deterministic given a scripted `TurnUnderstanding` input, requiring **no model dispatch**. This is why the matrix can run fully offline: presentation selection is already proven deterministic in `presentation-manifest-v1`, and this plan does not touch it.

**Steps:** DRY-RUN mode first (assert harness wiring/case count/park-rotation constraint itself, no real module calls) — see `trailie-rollout-readiness-gate/harness.js` for the DRY_RUN precedent. Then a real offline pass: for each of the 40 cases, call the Phase 1 module + `buildPresentationManifest` directly (no HTTP, no DB, no model) and assert against the spec's §9/§12 expected values. Run via `node artifacts/trailie-turn-understanding-matrix/harness.js` (or the equivalent invocation the harness script defines — match the existing harness's own CLI convention).

### Task 13: report

**Files:**
- Create: `artifacts/trailie-turn-understanding-matrix/REPORT.md`

Table of all 40 cases, pass/fail, and — for any failure — which phase's fix it traces back to. Explicitly states: no live/paid model call was made to produce this report; any live validation of actual generated response content (as opposed to `TravelerJob`/`TurnTripContext`/`presentationKind` selection) is a separate, later task requiring its own authorization, per this plan's hard scope limits.

---

## Known TravelerJob classification residuals, deferred to the behavior-matrix/classification-quality pass

Task 1b's fix to `resolveArtifactIntent` (`turnUnderstanding.js`) corrected the build-frame-vs-advice-frame distinction for the phrasings it was pinned against (see the six pinned cases plus the adversarial regression set in `trailieTravelerJobResolver.test.js`). It did not, and was not meant to, make the underlying regex-based classifier grammatically complete. A known residual, found and deliberately NOT patched:

- **Sentence:** "I want to plan carefully around the crowds when visiting Acadia this October."
- **Expected:** `job: general_advice`, `tripContext: { relationship: 'new', activeContextAction: 'preserve' }`.
- **Actual (as of Task 1b's fix):** `job: day_by_day_itinerary`, `tripContext: { relationship: 'new', activeContextAction: 'set' }` — because `PLAN_VERB_CIRCUMSTANCE_OBJECT` (`turnUnderstanding.js`) requires "plan" and its preposition to be adjacent (`plan\s+(?:around|for|ahead|...)`), and this phrasing separates them with "carefully" ("plan **carefully** around the crowds").

This is a **classifier-accuracy residual, not an architecture bug**: `activeContextAction` correctly trusts `job` here, exactly as Task 1b's fix requires — the layering is sound. `job` itself is merely imprecise on this one paraphrase, because the underlying signal is still a regex family (`PLAN_VERB_CIRCUMSTANCE_OBJECT`, `TRIP_ARTIFACT_OBJECT`, `EXPLICIT_REDIRECT`, and the rest of `resolveArtifactIntent`'s pattern ladder), not a semantic parse — regex families are inherently enumerable-paraphrase-sensitive, and "plan carefully around" is a paraphrase the current pinned set didn't cover.

**Explicitly deferred, not patched now:** per direct instruction, no regex in `turnUnderstanding.js` or `trailieTravelerJobResolver.js` was touched to close this gap. One-off regex tweaks chasing individual paraphrases is the wrong instrument for this class of residual — it is earmarked for a later semantic-family paraphrase pass (or Phase 5's behavior-matrix/classification-quality work, which is the right place to catalog and close a broader set of these at once, rather than accreting single-sentence patches to the ladder one adversarial example at a time).

---

## What this plan does not do

Per the spec's own non-goals and this plan's hard scope limits: no change to `presentationManifest.js`'s selection logic, `evidencePlannerService.js`'s topic switch, canonical itinerary generation, validators, or repair logic. No change to `destinationRelationship.js`'s resolver (reused verbatim, per spec §5.2). No new banned-vocabulary wiring for `travelerVoiceLeakage.js` (spec §10.2 defers whether it becomes live-wired at all). No positive-voice enforcement mechanism (spec §10.3/§14 explicitly defers this — it has no implementation path yet, in this plan or the spec). No commit, push, deploy, or live/paid model call.
