# Trailie V2 — Progressive Response Architecture Study

**Date:** 2026-08-27
**Mode:** offline only. No model calls, no providers, no network, no paid run, no commit, no push, no deploy.
**Status:** study. Nothing in this document has been implemented.

---

## Measured motivation (carried in, not re-measured)

| Stage             | Measured   |
| ----------------- | ---------- |
| evidence wall     | 2,265 ms   |
| model "TTFE"      | 1,915 ms   |
| model production  | 17,916 ms  |
| validation        | 78 ms      |

Backend evidence optimisation is complete enough. The dominant traveler wait is
model artifact production.

**One correction to that table before anything is designed on top of it.**
`timeToFirstEventMs` is computed in `server/src/utils/modelLatencyAnatomy.js`
from `dispatchRow.firstEventAtMs`, which
`server/src/services/trailieV2ExecutionService.js` sets on the **first
normalised stream event of any type**:

```js
onEvent: (event) => {
  if (dispatchRow.firstEventAtMs == null) dispatchRow.firstEventAtMs = Date.now();
  if (event?.type !== 'text_delta') return;
  ...
}
```

For the OpenAI Responses stream the first normalised event is
`response.created` → `start`. So **1,915 ms is time-to-stream-open, not
time-to-first-output-token.** Every route tier is a reasoning model
(`server/src/config/trailieModelRouter.js`: luna/terra/sol at effort low or
medium), and reasoning tokens are emitted before any tool-argument token. The
claim "it can start producing around two seconds after model dispatch" is
**not established by this instrumentation** and is the single gating unknown
for options B and C below.

---

## Non-negotiable invariant

Unvalidated itinerary content must never be presented as an accepted plan.
A streamed stop or day later rejected by artifact validation, completeness,
traveler fit, hard constraints, or repair/routing must not already have been
shown as canonical travel advice.

---

## A — Current streaming path

Traced, not inferred from names.

### A.1 Server: one canonical event source, one dialect adapter

`POST /api/ai/chat-stream` (`server/src/routes/ai.js:2494`):

1. `resolveTrailieTransportDialect(req)` picks `v2` or `legacy`.
2. `createTrailieTransportAdapter({ dialect, mode:'stream', emit: writeSseEvent })`
   is the single serialization sink.
3. `transport.responseStarted(...)` fires at turn admission, before
   `prepareChatContext`.
4. `createV2StreamEventBinder(...)` supplies `emitCanonicalEvent` to
   `runTrailieV2FromPreparedContext`.
5. `transport.responseFinalized(...)` is the authoritative terminal.

**Dead scaffolding:** `earlyEvents` (`createEarlyEventEmitter`), `revisionOne`
and `revisionOneSnapshot` are constructed at `ai.js:2530-2538` and never
referenced again on this route. `TRAILIE_EARLY_ITINERARY_EVENTS` therefore has
no effect on `/chat-stream`; the live event source is the binder,
unconditionally.

### A.2 Canonical events actually emitted, in order

From `trailieV2ExecutionService.js`:

| Line | Event | When |
| ---- | ----- | ---- |
| 926  | `response_started` | after intent classification — **ignored by the binder**; the route's own admission call is the one on the wire |
| 1017 | `evidence_ready` | after evidence resolution + gate |
| 1211 | `progress` | once per attempt, immediately before provider dispatch |
| 1317 | `content_delta` | per `text_delta` only |
| 1468 | `itinerary_ready` | **inside `if (validation.status === 'pass')`**, after `finalizeItinerary` and after the presentation manifest validates |
| 1187 / 1477 | `prose_ready` | deterministic render, or validated non-itinerary answer |
| 917  | `response_finalized` / `error` | terminal — **ignored by the binder**, route owns it |

### A.3 What is buffered and thrown away

`server/src/services/providers/openaiResponsesAdapter.js:176` already normalises
`response.function_call_arguments.delta` → `tool_argument_delta` and passes it to
`onEvent`. The execution service drops it:

```js
if (event?.type !== 'text_delta') return;
```

Itinerary turns dispatch with `tools: [itineraryTool]`, `toolChoice: null`
(`trailieV2ExecutionService.js:1263`), so the plan arrives as function-call
argument deltas. **The entire itinerary — including `intro` — is already
streaming into the server across the ~18 s window and is discarded.** This is
the raw material any progressive design would use, and it costs nothing extra
to obtain.

### A.4 What reaches the client

`v2Binder.ensureDisplayContent(v2Content)`: when no `text_delta` ever arrived
(the normal tool-first case), the whole rendered answer is emitted as **one
`content_delta`** immediately before the terminal.

Client: `consumeAiSseStream` (`next-frontend/src/services/aiService.js:82`) feeds
every raw line through `createTransportEventNormalizer`
(`next-frontend/src/utils/transportEventNormalizer.js`), which dispatches to the
existing callbacks in `TripPlannerChat.jsx:1962-2137`.

### A.5 Dialect reality

Both switches default OFF and are commented out in `server/.env.example`:
`TRAILIE_TRANSPORT_V2` (server) and `NEXT_PUBLIC_TRAILIE_TRANSPORT_V2` (client).
**Production runs `legacy`.** On legacy the adapter:

- renders `progress` as `{type:'thinking', stage:<verbatim internal string>}`
- renders `evidence_ready` as `{type:'thinking', sources:[...]}`
- **drops `itinerary_ready` and `prose_ready` entirely** (`return false` —
  "legacy is terminal-only for the plan")

So the Stage-14 early-revision reveal path, the whole
`earlyRevisionCoordinator` / `earlyRevisionLifecycle` machinery, and the
persist-before-reveal design are **built, tested, and inert in production.**

---

## B — First visible-content timing

Reconstructed legacy timeline for a normal THRO creation turn:

```
t≈0 ms       thinking{sources:[], parkName}   → "Understanding your trip details..."
t≈2,265 ms   thinking{sources:[nps,...]}      → "Checking park info..."
t≈2,265 ms+  thinking{stage:building_structured_itinerary}
                                              → "Building a realistic plan..."
t≈2,270 ms → ~22,000 ms   ─── NOTHING ON THE WIRE ───
t≈22,150 ms  chunk (entire answer, one event)
t≈22,150 ms  stream_end, done
```

**First real content: ~22 s. Dead air: ~19.9 s, one uninterrupted block.**

### B.1 The dead air is currently filled by a fabricated timer

`TripPlannerChat.jsx:729-780` runs a 1 Hz `setInterval` keyed on wall-clock
elapsed seconds that overwrites `thinkingMessage`:

```
seconds <  5  → "Thinking..."
 5–10         → source-based copy
10–15         → "Combining trip details..."
15–20         → "Building a realistic plan..."
20–30         → "Checking the plan for timing and tradeoffs..."
30+           → "Finishing your response..."
```

This is not a fallback. It runs unconditionally while `isGenerating`, and it
**overwrites the server's real stage copy within one second of it arriving.**
The server says `building_structured_itinerary` at 2.3 s; the timer pulls the
label back to "Checking park info…" at 5 s, forward to "Combining trip
details…" at 10 s, and announces "Checking the plan for timing and tradeoffs…"
at 20 s — while the server has been in one single un-exited generation stage the
whole time and validation has not started.

The brief for this study said: *"No timers pretending work is happening. Events
must correspond to real stages."* **That rule is currently violated in
production, by the client.** This is the first thing to fix and it is free.

---

## C — Streamable-content taxonomy

Three classes, pinned conservatively.

### SAFE_PREVALIDATION
May be shown before the artifact validates. Nothing here can be falsified by a
repair or a rejected attempt.

- Acknowledgement of the request.
- Restatement of traveler-supplied constraints (dates, party, mobility, pace)
  — these are **inputs**, not outputs; repair cannot change them.
- Destination identity, once `destination_identity` has resolved through the
  evidence gate.
- Real stage transitions (see D).
- Park display context (`parkName`, `parkNames`, `parkImages`) — already
  first-class on both dialects via `display_context`.

### VALIDATION_DEPENDENT
Truth depends on the artifact surviving validation. Must not be shown early.

- General planning framing ("I'll bias toward wildlife drives and short walks").
  **This looks safe and is not** — see F.
- Traveler-fit claims of any kind.
- Pacing and "why this shape works" statements.
- Duration, drive time, route sequencing.
- Any statement about what the plan contains or omits.

### CANONICAL_ONLY
Only after validation, finalization and the hash checkpoint.

- Any specific stop or day assignment.
- Permit / reservation / access claims attached to a stop.
- Exposure and difficulty ratings.
- Anything the `create_itinerary` tool authored.

### C.1 The `intro` field is VALIDATION_DEPENDENT, not framing

`server/src/utils/itineraryToolSchema.js:9` — `required: ['intro', 'days']`,
`intro` first. It is tempting to read `intro` as safe conversational framing.
It is not. `validateGeneration` runs three independent checks over it *after*
`finalizeItinerary` has already mutated the plan:

- `evaluateMobilityClaimConsistency` on
  `[output.text, finalized.itineraryData.intro, ...narrativeSections]`
  (`trailieV2ExecutionService.js:2088-2097`)
- `evaluateProseConstraintSafety` on the same text (`:2111`) — flagged
  `hardConstraintViolation: true`
- `evaluateTravelerLanguage({ intro })` (`:2126`)

An `intro` can therefore **fail on its own** and force a repair attempt whose
replacement `intro` says something different. It is also validated against the
*finalized* plan, so an intro that was true of the raw model output can be false
of the plan that ships.

---

## D — Official facts

`evidence_ready` today carries an allowlist only —
`{ coverage, freshness, publicSources }` — enforced as invariant #3 in
`trailieTransportAdapter.js`. It carries **no claim text**.

Streaming a fact such as *"NPS currently has no smoke alert posted"* is
architecturally coherent: that claim is bound to
`resolution.selectedEvidence[].claim`, has already passed authority, freshness,
scope and absence-proof gates, and does not depend on the itinerary artifact.
Absence semantics are already correctly modelled — the coverage evaluator
refuses a negative-polarity claim unless
`requirement.absenceSemantics === 'proves_absent'` **and**
`candidate.absenceProof.providerDeclaredComplete === true`.

But shipping it means widening `EVIDENCE_READY_ALLOWLIST` to carry claim text to
the browser. That allowlist is a privacy/leak boundary, not a convenience: it is
what keeps item internals, TripState, raw provider bodies, broker diagnostics
and refresh keys off the wire. Widening it is a deliberate decision that needs
its own bounded projection (topic + claim text + source class + observedAt, hard
character cap, no URLs beyond the existing `publicSources`), not a field added in
passing.

**Verdict: coherent, genuinely safe, and out of scope for a first
implementation.** Park-condition facts are also the *least* of the traveler's
wait — they land at 2.3 s, inside the part of the turn that already feels fine.

---

## E — Option 1: deterministic stage UX

The server vocabulary already exists and is already product-level:
`PRODUCT_STAGE` in `trailieTransportAdapter.js` defines ten stages, and
invariant #2 strips everything that is not one of them, so model and provider
identity can never leak into progress.

What is actually emitted is **one** `progress` event per attempt
(`trailieV2ExecutionService.js:1211`), carrying
`building_structured_itinerary` or `writing_response`. Six of the ten declared
product stages are never emitted. `validating_trip` and `checking_response`
exist in the vocabulary, in the client copy table
(`next-frontend/src/utils/thinkingStageCopy.js`), and in the normalizer's
inverse map — and nothing ever sends them.

So Option 1 decomposes into three pieces of very different cost:

| Piece | Cost | Value |
| ----- | ---- | ----- |
| Delete the client wall-clock timer | trivial | stops the product lying |
| Emit the stages that already exist (`validating_trip` around the 78 ms validation span, `checking_response`) | small | honest, but they mark a 78 ms window — near-zero perceived benefit |
| Add real sub-stages inside the ~18 s generation window | **impossible without D/F** | this is the entire problem |

**This is the crux.** Deterministic stage UX cannot help with the dead air,
because during the dead air *there is exactly one real stage*. Emitting more
labels for one stage is precisely the fake progress being removed. The only
honest way to subdivide the generation window is to observe the model's own
output as it arrives — which is options F/G, not E.

Honest Option-1 outcome: the traveler sees "Building a realistic plan…"
correctly, from 2.3 s, and it **stays** until the plan is real. That is better
than today (it stops lying) and it does not feel faster.

---

## F — Option 2: safe framing from the existing call

Question: can the current generation protocol emit a bounded pre-artifact
section guaranteed not to make specific plan claims?

**Mechanically, the plumbing already exists.** `tool_argument_delta` reaches the
execution service and is discarded by one line. A streaming JSON-prefix parser
over the accumulating `create_itinerary` arguments could extract `intro` (the
first required property) well before `days` completes.

**Three findings say do not do this.**

1. **`intro` is validated content** (see C.1). It can fail
   `prose_constraint_safety` with `hardConstraintViolation: true`. Streaming it
   pre-validation is exactly the failure mode the invariant forbids — it is prose
   *about the plan*, authored by the same attempt that can be rejected.

2. **A "safe framing" field would have to be a new field, and the safety would
   have to be enforced, not requested.** "For three relaxed days I'm biasing
   toward wildlife drives and short walks" is a traveler-fit claim. If repair
   converts the plan to a scenic-drive plan because the short walks failed
   exposure limits, that sentence is retroactively false. A prompt instruction
   ("do not make plan claims here") is not a guarantee; it would need a
   deterministic gate, and the only gate that can decide "does this sentence
   commit to plan content" is a validator we do not have.

3. **The timing may not exist at all.** Reasoning models emit reasoning tokens
   before any tool-argument token. If first-`tool_argument_delta` is at 14 s of
   an 18 s window, a schema-first field buys ~4 s of a ~20 s wait, and the whole
   design collapses. **Nothing currently measures this.**

**Verdict: reject as designed. Do not stream `intro`.** The prerequisite
measurement is cheap and belongs in the first implementation regardless (see L).

---

## G — Option 3: two-phase model path

Phase 1: a tiny conversational framing dispatch. Phase 2: the artifact.

Cost from the existing corpus, offline:

- Phase 1 re-sends the prompt. The WP7 cache design sends the public prefix once
  as a cached developer breakpoint with a 30 m TTL
  (`trailieV2ExecutionService.js:1265`), so phase 1 would take a cache write or
  hit on the same prefix and add only its own output tokens. Input cost is
  therefore modest.
- Latency is **not** modest and **must not be assumed**. A second dispatch pays
  its own stream-open cost — measured at 1,915 ms for the dispatch we have — and
  a reasoning model pays reasoning before its first token even for two
  sentences. `luna_low` exists as a tier, but the 2026-08-18 Luna calibration
  concluded Luna stays disabled.
- If phase 1 runs **before** phase 2, it *adds* to total latency. If it runs
  **concurrently**, it is a second in-flight dispatch that the `liveBudgetGuard`
  pre-dispatch cap must be taught about — the guard exists precisely because
  three in-turn escalations once turned a $0.12 run into $0.1996.
- Phase 1 output is subject to the same problem as F: two sentences of framing
  written *without* the plan is either vacuous or a claim the plan may contradict.

**Verdict: real, but the most expensive option with the weakest safety story.
Not first.** Its latency is explicitly UNMEASURED and must stay labelled that way.

---

## H — Option 4: client-side progressive artifact

Reject, and the historical record says why. Each of these was a real live
failure that validation caught **after** the model had already produced the
content:

| Failure | What a progressive renderer would have shown |
| ------- | -------------------------------------------- |
| `zero_duration_stops` (Canyonlands ladder, 2026-08-24) | days rendered with 0-minute stops, then silently rewritten |
| traveler-fit incompatibility | a hike shown to a traveler whose mobility limits exclude it |
| missing requested experience | a plan visibly lacking what the traveler asked for, then replaced |
| `plan_patch_scope` failures | a refinement rewriting an afternoon nobody mentioned |
| unsafe repaired anchor (composition/feasibility chain) | repair itself introduced the unsafe stop |

The 2026-08-24 gate-#4 result — attempt-1 acceptance at **2/6** — is the number
that settles it. On a majority of turns, the first artifact the model produces is
not the artifact that ships. Rendering it progressively would show the traveler
a rejected plan most of the time.

**The existing architecture already gets this right**, and it is worth naming so
it is not accidentally weakened: `itinerary_ready` is emitted *inside* the
validation-pass branch, after `finalizeItinerary` and after the presentation
manifest validates; the adapter records the published hash and **refuses a
terminal carrying a different one** (invariant #4), emitting a bounded error
instead. Progressive artifact rendering is not a missing feature. It is a
deliberately closed door.

---

## I — Repair behaviour

Retries are currently **invisible, and correctly so**. Each attempt emits one
`progress` with the same stage string, so the copy does not change; `content_delta`
never fires for tool-first turns; `itinerary_ready` fires only on a pass, so a
rejected attempt puts nothing on the wire. A three-attempt ladder and a
one-attempt turn are indistinguishable to the traveler except in duration.

Any progressive design must preserve this. Two rules:

1. **Never surface attempt count, tier, escalation, or "retrying".** That is
   model/provider mechanics; invariant #2 already forbids it in `progress`.
2. **Never withdraw shown content.** The moment anything plan-shaped is shown
   before the pass, a repair forces either a visible retraction or a silent
   swap. Both are worse than the dead air.

The honest UX for a long repair ladder is the *same* stage label persisting.
It is slow, and it is true.

---

## J — Refinement behaviour

Refinements differ in one way that matters: **a validated canonical plan is
already on screen.** In `TripPlannerChat` the prior assistant message and its
itinerary card are untouched while the new turn streams; a new message is
appended.

That is the correct behaviour and it should be stated as a rule:
**never hide or grey out a valid plan while its replacement is unvalidated.**

Refinements also use `usePlanPatch` with `PATCH_ITINERARY_TOOL` and a resolved
`refinementScope`, so the machine already knows *which day or daypart* is being
changed before the model answers — `scopeAllowsOperation` and
`bindOperationsToScope` enforce it. This is genuinely new information the
creation path does not have, and it is deterministic and pre-model.

**"Adjusting the second morning…" is derivable from `refinementScope`, with no
model call and no artifact, and it is true the moment the scope resolves.** It is
the one piece of specific, non-fabricated progress copy available anywhere in
this system today. It is also SAFE_PREVALIDATION by construction: it describes
the *request*, not the answer.

Caveat: `refinementScope.resolved` is not always true; unresolved scope must
fall back to the generic stage copy, never to a guess.

---

## K — Failure behaviour

Currently safe, by accident rather than design — because nothing streams, there
is no pseudo-plan to strand.

On routing exhaustion the execution service emits `error` with a
`terminalReason`, **which the binder ignores** ("admission + terminal stay on the
route"). The route unconditionally calls `transport.responseFinalized` with
`renderV2Content(result)`, which returns a bounded human string per terminal
class:

- `evidence_incomplete` → "I can't confirm that safely right now — the current,
  authoritative details needed to answer weren't available…"
- `constraint_infeasible` → "I can't verify an itinerary that satisfies your hard
  driving limit…"
- otherwise → "I couldn't complete this request. Please try again."

These are good: they explain the *class* of failure in traveler language without
exposing mechanics.

**The rule any progressive design inherits:** whatever was shown before the
failure must remain true after it. That is satisfiable for SAFE_PREVALIDATION
content (an acknowledgement and a resolved destination stay true when planning
fails) and is not satisfiable for anything in the other two classes.

---

## L — Recommendation

Ranked on perceived latency, actual latency, cost, correctness risk, complexity,
and Trailie personality.

| # | Option | Perceived | Actual | Cost | Risk | Complexity | Personality |
| - | ------ | --------- | ------ | ---- | ---- | ---------- | ----------- |
| 1 | Real-stage UX (delete the timer, emit the stages that exist, scope-derived refinement copy) | small–moderate | 0 | $0 | very low | low | +honest |
| 2 | Bounded evidence-fact streaming (D) | small | 0 | $0 | low, needs allowlist widening | medium | +knowledgeable |
| 3 | Same-call framing from `intro` (F) | large **if** the timing exists | 0 | $0 | **high** — `intro` is validated content | medium | +++ |
| 4 | Two-phase model (G) | large | **unmeasured, likely worse** | + tokens + dispatch | medium | high | ++ |
| 5 | Progressive artifact (H) | largest | 0 | $0 | **unacceptable** | high | destroys trust |

### Recommended first implementation

Not the hybrid of A + B as biased toward in the brief. The A half is right; the B
half is blocked on a measurement that does not exist yet, and on `intro` being a
validated field rather than framing.

**Ship, in one branch:**

1. **Delete the wall-clock `setInterval` in `TripPlannerChat.jsx:729-780`.**
   Drive `thinkingMessage` purely from `onThinking`. This removes fabricated
   progress and lets the server's real stage copy survive past 5 s. It is the
   only change here that improves honesty rather than perception.
2. **Emit the product stages that already exist but are never sent** —
   `validating_trip` around the `artifact_validation` span, `checking_response`
   where applicable. Small, but they are real and the copy tables are already
   written for them.
3. **Add scope-derived refinement progress copy** from `refinementScope` when
   `resolved` is true. Deterministic, pre-model, specific, and true.
4. **Instrument first-`tool_argument_delta`.** Add
   `firstOutputTokenAtMs` to `dispatchRow` alongside `firstEventAtMs`, set on the
   first `text_delta` **or** `tool_argument_delta`, and project it through
   `summarizeModelDispatch` as `timeToFirstOutputTokenMs`. This is a few lines,
   changes no behaviour, and is the **gating measurement for options F and G**.
   Without it, "the model starts producing at ~2 s" is an assumption, and the
   whole progressive-framing project rests on it.

Then stop and read the number. If first-output-token lands early in the window,
F becomes worth designing properly — with a *new, separately-validated* framing
field rather than `intro`. If it lands late, F and G are both dead and the real
project is reducing reasoning time, not surfacing it earlier.

Also worth noting: **none of the built early-reveal machinery runs in
production** (§A.5). Before designing a new progressive layer, decide whether
`TRAILIE_TRANSPORT_V2` is ever going to be turned on — otherwise the work lands
on a path no traveler reaches.

---

## M — Tests needed

Offline, no network, no model:

1. **Timer removal** — `thinkingMessage` changes only in response to a dispatched
   `onThinking`; assert no state change across a simulated 30 s with no events.
2. **Stage vocabulary closure** — every stage the execution service emits maps
   through `INTERNAL_STAGE_TO_PRODUCT` → `PRODUCT_STAGE_TO_INTERNAL` →
   `STAGE_THINKING_COPY` to non-null copy. Today six product stages have no
   emitter and this test would document which.
3. **Refinement scope copy** — resolved day/daypart scope yields specific copy;
   unresolved scope falls back to generic and never guesses.
4. **Latency anatomy** — `timeToFirstOutputTokenMs` is null when no
   content-bearing delta arrives, is set by `tool_argument_delta` alone, and
   never precedes `timeToFirstEventMs`.
5. **Taxonomy guard (regression fence)** — a unit test asserting the execution
   service emits no plan-shaped payload outside the `validation.status === 'pass'`
   branch. This is the invariant's tripwire; it should exist before anyone
   attempts F.
6. **Failure survivability** — for each terminal class, whatever
   SAFE_PREVALIDATION content was emitted remains true in the terminal payload.

---

## N — Isolation

Must not be touched by any progressive work:

- The five adapter invariants in `trailieTransportAdapter.js`, especially #1
  (exactly one terminal / seal), #2 (product stages only), #3
  (`EVIDENCE_READY_ALLOWLIST`) and #4 (itinerary-hash succession).
- The client seal in `createTransportEventNormalizer` — exactly one
  `stream_finished`, exactly one terminal.
- `decideLegacyChunk` / `decideLegacyStreamEnd` suppression rules in
  `earlyRevisionLifecycle.js`.
- The placement of `emit('itinerary_ready')` **inside** the validation-pass
  branch. This is the invariant's physical location.
- Evidence planner, broker, coverage evaluator, and web-wave entry policy —
  closed as of 2026-08-27.

Separately, and not part of this work: `earlyEvents`, `revisionOne` and
`revisionOneSnapshot` in `/chat-stream` are dead locals
(`server/src/routes/ai.js:2530-2538`). They should be deleted in their own
commit so nobody reads them as a live path.

---

# Addendum — Honest Progress + First Artifact Byte (implemented, offline)

**Date:** 2026-08-27, same day. Offline only; no model calls, no providers, no
network, no commit.

Scope was narrowed on purpose: **stop lying about progress, expose the real
lifecycle, and measure when the first actual itinerary bytes arrive.** No new
progressive model content. No client artifact streaming.

## A — Fabricated client progress removed

Deleted the 54-line `setInterval` in `TripPlannerChat.jsx` that rewrote
`thinkingMessage` from elapsed wall-clock seconds (14 `setThinkingMessage` calls,
none tied to server state) and overwrote real stages within a second of arrival.

Pinned: **progress copy changes only when the server reaches a new lifecycle
stage.** `thinkingStartTime` survives — response-time telemetry is not progress.

## B — Real stages, on the transport already in production

Five lifecycle states now emit at actual transitions:

| Stage | Emitted at | Was |
| ----- | ---------- | --- |
| `understanding_request` | turn admission, before intent classification | nothing |
| `checking_park_information` / `checking_current_conditions` / `checking_permits` / `checking_transport` | before evidence resolution, **named from the requirements the planner actually produced** | nothing |
| `building_structured_itinerary` / `writing_response` | before provider dispatch | already existed |
| `validating_trip` | around the `artifact_validation` span | in the vocabulary, never sent |

**No transport change was needed for any of them.** The new stages are emitted
under their PRODUCT name, which legacy passes through verbatim and v2 accepts
because `PRODUCT_STAGES.has(stage)` is already true. `TRAILIE_TRANSPORT_V2` stays
off and untouched.

`evidenceStageFor(requirements)` picks one true label by decision-criticality
precedence (current conditions → permits → transport → park information). One
stage, not a tour of the broker.

**Client rule:** a stage owns the copy until the server reaches the next one. An
evidence event updates the source list only. The older source-derived copy
survives strictly as the pre-stage fallback (`sawServerStageRef`), for routes
that report sources without stages.

On a repair ladder the traveler now sees building → validating → building. That
reveals work is being redone; it never names attempt, tier, model, or retry.

## C — Refinement scope copy

`describeRefinementTarget(scope)` projects the already-resolved
`refinementScope` into `{ level, dayNumber, daypart, stopName }` and rides the
generation-dispatch `progress` event.

```
daypart     → "Adjusting the second morning…"
day         → "Reworking day 2…"
stop        → "Adjusting Boicourt Overlook…"
whole plan  → "Adjusting the itinerary…"
unresolved  → generic stage copy, never a guess
```

Two rules held deliberately:

- **Mirror the traveler's own reference.** A daypart scope usually resolves to
  exactly one stop; naming it back ("Adjusting Wind Canyon Trail…") would be true
  but asserts a referent the traveler never used. A stop is named only when they
  named a stop.
- **Say what is being worked on, never what will change.** "Adjusting X" is about
  the request and survives any patch. "Shortening X" would be a claim about an
  answer that does not exist yet.

### Transport widening (deliberate, bounded)

`progress` gained one optional field, `refinementTarget`, allowlisted and
range-checked by `pickRefinementTarget` in the adapter
(`REFINEMENT_TARGET_ALLOWLIST`, level enum, day 1–60, daypart enum, name ≤ 80
chars). Invariant #2 exists to keep **model and provider identity** out of
progress; this is neither — it is the traveler's own persisted plan content,
resolved deterministically before any dispatch, and the only producer reads the
prior plan. A caller passing `model`/`tier`/`attempt` has them stripped.

## D/E — The artifact clock

`onEvent` no longer discards `tool_argument_delta`. It times and sizes it:

```
responseCreatedDelayMs          dispatch -> stream open      (the old "TTFE")
timeToFirstTextDeltaMs          dispatch -> first prose token
timeToFirstToolArgumentDeltaMs  dispatch -> FIRST ITINERARY BYTE
toolArgumentStreamingMs         first -> last itinerary byte
postArtifactCompletionMs        last itinerary byte -> complete
toolArgumentDeltaCount / toolArgumentBytes
toolArgumentSamples[]           bounded { tMs, cumulativeBytes } curve
```

`timeToFirstEventMs` keeps its name and value, with a module comment stating
plainly that it is stream-open and was misread as first-token on 2026-08-27.

**Shape, not just first byte.** `createToolArgumentStreamRecorder` samples every
250 ms or 4 KB, always keeps the first and last points, and hard-caps at 32
samples with a `toolArgumentSamplesTruncated` flag. A test drives two synthetic
streams with the *same* first byte — one continuous, one a late burst — and
asserts the curve separates them.

**Privacy:** the recorder takes `byteLength`, never the delta string. There is no
code path by which plan content can reach telemetry, and a test asserts the
serialized output contains no artifact text.

Null means unmeasured. A tool-only itinerary turn correctly reports
`timeToFirstTextDeltaMs: null` — that is the right reading, not a gap.

## F — Nothing plan-shaped reaches the browser

The tool-argument branch returns before any `emit` can be reached. Tests assert
the stream callback contains exactly one `emit`, that it follows the `text_delta`
gate, that `CANONICAL_EVENTS` has no tool/partial member, that the client
normalizer has no vocabulary for partial artifact content, and that
`TripPlannerChat` never mentions `tool_argument`.

No partial itinerary JSON is parsed anywhere. This pass only measures.

## G — Stage-14 audit boundary (documented, NOT enabled)

`itinerary_ready` and `prose_ready` remain unreachable in production and were
**not** revived.

**Where they are produced.** `itinerary_ready` is emitted at
`trailieV2ExecutionService.js` inside `if (validation.status === 'pass')`, after
`finalizeItinerary` and after `validatePresentationManifest` succeeds — never
before. `prose_ready` is emitted on the deterministic-render branch and on a
validated non-itinerary answer.

**Why production drops them.** The adapter is in `legacy` dialect
(`TRAILIE_TRANSPORT_V2` unset), and legacy returns `false` for both: "legacy is
terminal-only for the plan". Nothing is silently discarded downstream — they
never reach the wire.

**Validation guarantees at each event.**

| Event | Guaranteed at emission |
| ----- | ---------------------- |
| `response_started` | turn admitted. Nothing about content. |
| `progress` | a real phase transition. No content claim. |
| `evidence_ready` | evidence gate evaluated; coverage/freshness/sources only, no claim text |
| `itinerary_ready` | artifact validated AND finalized AND presentation manifest valid; hash recorded for the adapter's succession guard |
| `prose_ready` | prose passed contradiction, mobility, constraint-safety, budget-claim and traveler-language checks |
| `response_finalized` | terminal; refused if the itinerary hash changed since `itinerary_ready` |

**Why "built and tested" is not "safe to enable."** Stage 14's assumptions
predate the failures in the composition/feasibility chain, the traveler-fit and
scope-violation classes, and the repair architecture that introduced its own
unsafe anchor. Gate #4 measured attempt-1 acceptance at 2/6 — the shape of what
gets revealed early has changed since the machinery was written. **Treat Stage 14
as prior art, not as the implementation plan.** Reviving it is its own audit.

Separately: `earlyEvents`, `revisionOne` and `revisionOneSnapshot` remain dead
locals in `/chat-stream`. Left in place; they belong in their own deletion.

## H — Tests

Server — `server/src/utils/__tests__/honestProgressArtifactClock.test.js` (20):
artifact clock vs stream-open; null-not-zero for unmeasured; stream shape
separating continuous from bursty; sample cap; size-only privacy; refinement
target derivation and mirroring; allowlist stripping model identity; both
dialects carrying the new stages unchanged; tool deltas not forwarded.

Client — `next-frontend/src/utils/__tests__/honestProgressCopy.test.js` (29):
timer gone (no elapsed-time derivation, no effect watching `thinkingSources`,
`setThinkingMessage` down from 23 call sites to 9); every emitted stage resolves
to copy; unknown stage leaves copy in place; no copy leaks model/provider/retry
language; evidence cannot overwrite a stage; per-turn reset; refinement copy for
each level; no internal scope terminology; no outcome prediction; malformed
target degrades to generic; no partial-artifact vocabulary anywhere.

One pre-existing assertion updated: `transportEventNormalizer.test.js` used
`checking_park_information` as its example of a product stage with no copy. That
gap is now closed, so the example moved to `building_route` — still declared,
still never emitted, still uncopied.

## Test results

```
server   26 suites /  503 tests   pass   (evidence sweep separately: 42 / 433 pass)
client   88 suites /  878 tests   pass
new      2 suites  /   49 tests   pass   (20 server + 29 client, this pass)
```

**Pre-existing failures, all verified as not mine (30 client tests, 13 server):**

- 11 client + 13 server integration tests fail on
  `connect ECONNREFUSED 127.0.0.1:27018` — the Stage-14.7 eval harness needs a
  local MongoDB. Confirmed by probing `defaultRunScenario` directly:
  `boundedCode: child_failed`, `step=boot`.
- 19 client unit tests across 6 suites (`Header`, `WeatherWidget`,
  `buildDayByDayPlanFollowUp`, `trailieDemoPlayback`, `TrailieDemoPlayback`,
  `useParkExploreIndex`). None imports any module touched here. Baselined by
  stashing the two tracked files changed in this pass and re-running: **the same
  6 suites fail with the same 19 tests.**

## The one live measurement this unblocks

Same ordinary THRO creation prompt, normal routing, no forced retries, no code
changes during the run. Read three numbers:

```
timeToFirstToolArgumentDeltaMs   when does the itinerary start arriving?
toolArgumentStreamingMs          how long does it stream?
toolArgumentSamples[]            is it continuous, or one byte then a late burst?
```

Decision tree, fixed in advance so the result cannot be rationalised after the
fact:

- **First bytes ~2–4 s, continuous** → the model is already progressively
  constructing the itinerary. Investigate a server-side shadow parser over the
  deltas — non-canonical, shown to nobody — and ask whether a completed Day 1 can
  be independently prevalidated.
- **First bytes ~12–18 s** → progressive artifact work buys little. The choice
  narrows to the honest stage indicator (shipped) or a deliberate fast framing
  phase, and Option C earns its study.
- **Early first byte, burst at the end** → same conclusion as late. First-byte
  timing alone was not enough, which is why the curve is being captured.
