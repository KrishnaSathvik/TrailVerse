# Trailie Response Behavior v1 Design

**Date:** 2026-09-03

**Status:** `TRAILIE_RESPONSE_BEHAVIOR_V1 — APPROVED FOR IMPLEMENTATION PLANNING` (approved for planning, not for blind implementation — an implementation plan is a separate, later task. `presentation-manifest-v1` and WP5A remain unchanged, not-yet-implemented-elsewhere designs this spec sits above; see Section 11.)

**Scope:** Trailie web chat (authenticated and guest), restored/shared conversations — the turn-understanding seam that sits above evidence planning and presentation

**Architecture choice:** Two deterministic, server-authored turn-understanding outputs (`TravelerJob`, `TurnTripContext`), emitted as sibling results of one resolution pass per turn, and consumed — never re-derived — by evidence planning, presentation, generation, and persistence

## 1. Decision summary

Every Trailie turn answers two independent questions before any evidence is fetched or any word is generated:

```text
TravelerJob     = what the traveler wants this turn (Q&A, recommendation,
                  comparison, logistics, itinerary, refinement, ...)
TurnTripContext = what destination(s) this turn's answer is about, whether a
                  saved plan needs to be read or mutated, and whether the
                  trip actively being planned changes as a result
```

`TurnTripContext` deliberately separates three facts that are easy to conflate but independent: **what this turn's answer is about** (`subjectDestinations`), **what plan, if any, this turn operates on** (`targetTripId`), and **whether the actively-planned trip changes going forward** (`activeContextAction`). A question that names a different park than the active trip does not, by itself, mean any of the last two change — see Section 5.3.

Today neither `TravelerJob` nor `TurnTripContext` has one authority. The investigation behind this spec found five to seven modules independently guessing destination (`activeTripContextService.js`'s `resolveActiveTripContext`, `ai.js`'s client-echoed `metadata.parkCode` fallback, `planningState.js`'s `destination` field, `trailieIntentClassifier.js`'s per-message `intent.entities`, `constraintEngine.js`'s persisted `tripScope.destinations`, the frontend's sticky `selectedParkName`), a plan-mutation target (`existingCanonicalPlan`) resolved purely from "whichever conversation is currently open" with no relationship to what the turn is actually about, and two separate `classifyTrailieIntent` calls per turn built from two different prior-state shapes, only one of which is authoritative.

This spec does not redesign evidence planning or presentation. It defines the two upstream outputs as sibling results of one resolution pass, states the resolution contract for each, and names every existing module that must become a **consumer** of these outputs instead of an independent authority.

## 2. Goals and non-goals

### 2.1 Goals

- Give the system exactly one deterministic answer, per turn, to "what does the traveler want" and "which trip(s) is this about."
- Make an active itinerary a *signal*, never a forcing function, for response shape.
- Make naming a different destination in an ordinary question never, by itself, change which trip is actively being planned — a side-query is not a switch.
- Treat a turn about more than one destination (compare, road trip, regional set) as first-class, not a degraded single-destination case.
- Make an explicit, itinerary-shaped destination switch propagate to every consumer in one turn — no stale `tripScope`, no stale header, no wrong plan mutated — while never destroying the plan it switched away from.
- Make a reference to a prior, non-active trip resolve to a real trip identity or produce one clarifying question — never a silent no-op against the wrong plan.
- Keep evidence planning and presentation manifest architecture unchanged; make them explicit, cited consumers of the new outputs.
- Establish this document as the authority for Trailie's voice — both prohibited internal vocabulary and positive behavioral quality — and make the existing leak scanner its enforcement mechanism for the former, not a redefinition of the latter.

### 2.2 Non-goals

- Redesign `presentationManifest.js` or its `intent → presentationKind` mapping (`docs/superpowers/specs/2026-08-12-trailie-presentation-manifest-v1-design.md`). This spec produces one of that builder's existing inputs (`intent`) more reliably; it does not change the builder.
- Redesign `evidencePlannerService.js` / WP5A (`docs/superpowers/specs/2026-08-09-trailie-wp5a-evidence-broker-nps-shadow-design.md`). This spec produces `resolvedEntities`/`priorTripState` inputs more reliably; the planner's topic-selection logic is untouched.
- Redesign `destinationRelationship.js`'s resolver. This spec reuses its enum and function verbatim as the source of `TurnTripContext.destinationRelationship` (Section 5.2); it does not add a relationship value or change its logic.
- Specify the exact regex/resolver implementation for trip-title disambiguation, the `subjectDestinations` ranking algorithm, the `activeContextAction` decision-rule implementation, file boundaries, or a migration/rollout plan (Section 14).
- Change how the model is prompted, what tools it calls, or how canonical plans are structured.
- Fix every individually-cited bug from the prior trace as a standalone patch. Several (stale `tripScope`, entryContext priority, the two-classification split) are symptoms this contract is designed to make structurally impossible, not items on a punch list.

## 3. Turn understanding: one resolution pass, two sibling outputs

```text
raw user message + conversation history + activeTripBeforeTurn
                 |
                 v
      +----------------------------+
      |      TurnUnderstanding       |   <- ONE resolution pass, computed
      |     (single resolution)      |      once per turn. Internal ordering
      +----------------------------+      between job resolution and
            |              |             destination-candidate resolution is
            v              v             an implementation detail (Section 14).
      TravelerJob    TurnTripContext        <- SIBLING outputs, not a chain —
            |              |                  neither is computed FROM the other
            +------+-------+
                   v
   +-------------------------------------------------------------+
   v                 v                    v                      v
evidencePlannerService  presentationManifest  generation/prompt  persistence/header
(unchanged, consumer)   (unchanged, consumer)  (consumer)         (consumer)
```

`TravelerJob` reuses `trailieTravelerJobResolver.js` (`resolveTravelerJob`) and `trailieIntentClassifier.js` (`classifyTrailieIntent`) machinery. `TurnTripContext` reuses `activeTripContextService.js`'s destination-resolution logic (`resolveActiveTripContext`) for `subjectDestinations`/`primaryDestination`, and `destinationRelationship.js` verbatim for `destinationRelationship`; it adds trip-identity resolution (`targetTripId`) and the `relationship`/`activeContextAction` split, both new (Section 5).

`TravelerJob` and `TurnTripContext` are **siblings**, not a pipeline: neither is derived from the other's finished output. Both are computed exactly once per turn, by one resolution pass, before evidence planning begins. Nothing downstream may re-derive either from raw message text, a different prior-state shape, or client-echoed state.

## 4. `TravelerJob`

Not new invention — this formalizes what `trailieTravelerJobResolver.js` (`resolveTravelerJob`) and `trailieIntentClassifier.js` (`classifyTrailieIntent`) already compute, and fixes the double-computation problem found in this investigation.

### 4.1 The double-computation problem this section closes

Today, `classifyTrailieIntent` runs **twice** per turn, from two different prior-state builders:

1. `prepareChatContext` (`server/src/routes/ai.js:1165-1168`) computes `intentV2` from `intentPriorTripState` (`ai.js:1150-1164`). The code comment immediately above it is explicit: *"Trailie v2 WP2 — observational classification only. This value is returned for post-response telemetry and MUST NOT influence legacy fetch planning, prompts, provider selection, itinerary generation, or response payloads."* This result is discarded before generation.
2. `executeTrailieV2Turn` (`server/src/services/trailieV2ExecutionService.js:1754`) computes the **actual, authoritative** `intent` from `frozenTripState`, itself `buildClassifierPriorTripState(preparedContext)` (`server/src/services/trailieV2RouteBridge.js:235-274`) — a differently-shaped prior-state object (spreads `activeTripContext` fields directly, adds `activeDecision`, `existingCanonicalPlan`, `entryContext`) than `intentPriorTripState` above.

Both calls receive the same message text but different prior-trip-state shapes, and only the second result reaches the model. This is not a bug in either function — it is two independent, hand-assembled prior-state objects with no shared contract.

### 4.2 Contract

`TravelerJob` is computed **once**, as one of the two sibling outputs of the single `TurnUnderstanding` resolution pass (Section 3) — never chained after `TurnTripContext`, and never re-derived downstream from a second, independently-assembled prior-state object. That single result is what `classifyTrailieIntent`/`resolveTravelerJob` return, what reaches `evidencePlannerService`, and what reaches generation. There is no second, telemetry-only computation with its own prior-state assembly. If a diagnostic classification is still wanted for observability, it must be a projection *of* the one authoritative `TravelerJob`, not a second classification run against different inputs.

## 5. `TurnTripContext`

### 5.1 Shape

```text
TurnTripContext = {
  // What this turn's answer is about — never collapsed to one destination.
  subjectDestinations: [{ name, parkCode, lat, lon, source, confidence }],
  primaryDestination: { name, parkCode, lat, lon, source, confidence } | null,
  destinationRelationship: 'single' | 'compare' | 'alternative_choice'
    | 'combine' | 'route' | 'regional_set' | 'unknown',
  explicitDestinationMention: boolean,

  // What was active before this turn, and what happens to it.
  activeTripBeforeTurn: { destination, tripId } | null,
  relationship: 'new' | 'continuation' | 'historical_reference',
  activeContextAction: 'preserve' | 'set',

  // What plan, if any, this turn reads or mutates.
  targetTripId: string | null,
  targetConversationPlanId: string | null,

  confidence: number,
  ambiguity: { reason: string, candidates: [...] } | null   // present only
                                                              // when a clarifying
                                                              // question is required
}
```

### 5.2 `subjectDestinations`, `primaryDestination`, `destinationRelationship` — reuse, don't rebuild, and don't collapse to one

`resolveActiveTripContext` (`server/src/services/activeTripContextService.js:350-543`) already computes destination candidates correctly for the common case, including the parkCode-mismatch switch detection that does not depend on keyword matching (`isParkSwitchMessage`, `activeTripContextService.js:263-279`, specifically the `storedPrimary.parkCode !== parks[0].parkCode` branch at line 268) and the `messageNamesDestination` short-circuit (`activeTripContextService.js:413-420`) that lets an explicit destination in the message override everything else, including a locked plan. `TurnTripContext.subjectDestinations` is this resolution's full output — every destination the turn's answer is about, not a single winner. `primaryDestination` is a convenience projection (highest-confidence / first-named entry) for consumers that only need one value, such as the header (Section 5.5 of the prior trace report). `explicitDestinationMention` is the `messageNamesDestination` boolean the resolver already computes internally but does not currently expose past its own scope.

A turn can legitimately be about more than one destination — "Yosemite or Sequoia?", "Zion vs Bryce?", "Plan Yellowstone + Grand Teton", "road trip between these three parks" — and the codebase already has a correct, reused answer for how those relate to each other: `destinationRelationship.js` (`server/src/utils/destinationRelationship.js:19-26` for the `DESTINATION_RELATIONSHIPS` enum, `resolveDestinationRelationship` as the resolver). `evidencePlannerService.js` already imports and consumes this correctly today (`const { CHOICE_RELATIONSHIPS } = require('../utils/destinationRelationship')` at `evidencePlannerService.js:12`, used at `evidencePlannerService.js:302-304` to decide whether the turn is a destination choice). `TurnTripContext.destinationRelationship` is this module's output, reused verbatim — not replaced by a singular `destination` field.

**What must stop happening**, per the Part-1 trace of this investigation, corrected for the multi-destination case:

- `resolveEntitiesFromContext` (`server/src/services/trailieV2RouteBridge.js:103-198`) must stop treating `preparedContext.entryContext.requestedDestinations` (pinned once at page-load from the URL `?park=`/`?name=` query params, never refreshed for the life of the conversation) as a higher-priority destination signal than the current turn's resolved destinations. Today it is checked **first** (`trailieV2RouteBridge.js:117-142`) and returns early when non-empty, which means a session that started from a park CTA can have its `resolvedEntities` silently pinned to the entry-point park for the entire conversation regardless of later switches or additional destinations named.
- `resolveEntitiesFromContext`'s `tripScope` branch (`trailieV2RouteBridge.js:144-147`) must stop reading `constraints.tripScope.destinations` as an independent source. `applyTripScopeRefinement` (`server/src/utils/planningState.js:861-905`) only handles route-shape, add, skip, and max-drive refinements — it has no branch for "the traveler named an entirely different destination set," so a persisted `tripScope` from an earlier turn can carry stale destinations into a later turn's `resolvedEntities` even after `subjectDestinations` has correctly updated. Under this contract, `resolvedEntities` is derived directly from `TurnTripContext.subjectDestinations` — **all of them**, not one — and `tripScope`/`entryContext` stop being independent entity sources and become, at most, disambiguation inputs *into* the one resolver.
- `planningState.js`'s `destination.{parkCode,parkName,region,state}` field (`planningState.js:40, 266-272, 444-447`) stops being independently merged from constraints/formData/tripState and is instead **set from** `TurnTripContext.primaryDestination` after resolution, not computed in parallel with it.
- The frontend's `metadata.parkCode`/`parkName` fallback (`server/src/routes/ai.js:1201-1207`, sourced from wizard `formData.parkCode` at `TripPlannerChat.jsx:1616-1617`) stops being consulted as a destination authority. It may still travel as a hint into `TurnTripContext` resolution, but never as a silent override when the resolver already has a message-derived or trip-derived answer.

### 5.3 `relationship` and `activeContextAction` — what changed vs. what this turn is about are different questions

A message naming a destination that differs from the active trip does **not**, by itself, mean the active trip changes. "By the way, is October good for Acadia?" while a Yellowstone itinerary is active must answer the Acadia question and leave the Yellowstone plan exactly as it was. So must "Is Zion hotter than Bryce in September?" (a comparison) and "Easy hikes at Olympic?" (a recommendation) while Redwood is active. None of these are a switch — they are ordinary Q&A/recommendation/comparison turns that happen to name a park.

`relationship` and `activeContextAction` answer two different questions and must not be collapsed:

> `relationship` describes how the current turn's conversational subject relates to the immediately relevant prior conversational subject. It does not describe whether the active trip is preserved or replaced; that is owned exclusively by `activeContextAction`.

The three values, exactly:

- `new` — the turn introduces a subject that is not a continuation of the immediately relevant prior subject.
- `continuation` — the turn continues the same subject or target plan, even if `TravelerJob` changes.
- `historical_reference` — the turn explicitly targets an established prior trip/plan that is not the current conversational subject.

`new` does not mean "create a new `TripPlan`," and `continuation` does not mean "leave active context unchanged." Both are independent of `activeContextAction`.

`activeContextAction` is the mechanical instruction: does the going-forward active trip context stay as it was (`preserve`), or does this turn make its destination the active focus (`set`)?

Because `relationship` is judged against the "immediately relevant prior conversational subject" — not against `activeTripBeforeTurn` — its resolver must consult conversation history, not only active-trip state. Section 3 already establishes that `TurnUnderstanding` receives conversation history as an input; this is a clarification of how `relationship` uses that input, not a new capability. A two-turn example makes the distinction concrete:

- Turn 1, Redwood active: "Is October good in Acadia?" → the immediately relevant prior subject is Redwood (the active trip), and Acadia is not a continuation of it → `relationship: 'new'`, `activeContextAction: 'preserve'` — Redwood stays active.
- Turn 2: "What about November?" → the immediately relevant prior subject is now Acadia — Turn 1 made it so, even though Redwood is still the *active trip* — so this turn continues that subject → `relationship: 'continuation'`, `activeContextAction: 'preserve'` — Redwood is still active and still untouched.

Judging Turn 2 against `activeTripBeforeTurn` alone (Redwood) would wrongly read `relationship: 'new'` again, since Acadia still differs from the active trip. The resolver's continuity judgment is about conversation history's most recent subject, which can be a temporary conversational thread entirely separate from whatever trip is active.

**Decision rule for `activeContextAction`** — driven by `TravelerJob` plus explicitness, never by "destination differs from active" alone:

```text
activeContextAction = 'set'  only when BOTH:
  (a) TravelerJob is itinerary-shaped (a new-itinerary request, or an
      itinerary-shaped refinement that names a new destination), AND
  (b) explicitDestinationMention names a destination that is not the
      activeTripBeforeTurn destination (or there was no active trip at all)

activeContextAction = 'preserve'  in every other case — every Q&A,
recommendation, comparison, and logistics turn, regardless of which
destination(s) it names or how many.
```

`activeContextAction` is deliberately a two-value enum, not three. `set` covers both "nothing was active, now something is" and "something else was active, now this is" — the mechanical effect (make this destination the active focus) is identical either way. A destination **switch** is therefore *derivable*, not a primitive of this contract: `activeTripBeforeTurn` exists AND `activeContextAction = 'set'` AND the new `primaryDestination` differs from the old one → a switch occurred. Nothing downstream needs a separate "switch" value to detect this.

**Decision rule for `relationship`:**

```text
relationship = 'continuation'         subjectDestinations is the SAME subject
                                       already being discussed in this
                                       conversation — the destination this
                                       turn is about was also the subject of
                                       a recent turn (typically the active
                                       plan). Covers plain continuation and
                                       refinement of the active plan.

relationship = 'new'                  subjectDestinations names a destination
                                       that was NOT already the subject of
                                       this conversation — whether or not a
                                       DIFFERENT trip is currently active.
                                       This covers three distinct situations
                                       that share the same relationship value:
                                       a first-ever itinerary ask (nothing was
                                       active), an explicit itinerary-shaped
                                       destination switch, and an ordinary
                                       side-query about a brand-new park
                                       while something else stays active.
                                       What differs between these is
                                       `activeContextAction`, a SEPARATE
                                       field (Section 5.3 above) — not
                                       `relationship`.

relationship = 'historical_reference' subjectDestinations names a
                                       destination that WAS already the
                                       subject of this conversation earlier —
                                       it has its own resolved plan — but is
                                       not the CURRENT subject, and language/
                                       context indicates the traveler is
                                       pointing at that SPECIFIC PRIOR trip
                                       ("for the Redwood trip", "back on my
                                       Yellowstone plan") rather than
                                       introducing it for the first time.
                                       activeContextAction always stays
                                       'preserve' for this value — see
                                       Section 5.4.
```

Worked examples:

| Turn (active trip in parentheses) | `TravelerJob` | `subjectDestinations` | `relationship` | `activeContextAction` |
|---|---|---|---|---|
| "By the way, is October good for Acadia?" (Yellowstone) | Q&A | [Acadia] | `new` | `preserve` |
| "Is Zion hotter than Bryce in September?" (Redwood) | comparison | [Zion, Bryce] | `new` | `preserve` |
| "Easy hikes at Olympic?" (Redwood) | recommendation | [Olympic] | `new` | `preserve` |
| "Actually, plan Badlands instead" (Redwood) | itinerary | [Badlands] | `new` | `set` |
| "For my Redwood trip, on Day 2…" (Badlands) | refinement | [Redwood] | `historical_reference` | `preserve` |

Four of these five rows share `relationship: 'new'` and still take opposite `activeContextAction` values — that is the point, not an inconsistency: `relationship` says whether this subject has been discussed before, and `activeContextAction` says whether it becomes the active focus. Collapsing the two into one field is exactly the mistake this contract corrects (Section 9.1 walks this through with a dedicated four-row table).

Telling "this subject is new to the conversation and becomes the active focus" (`new` + `set`) apart from "this subject is new to the conversation and does not touch the active focus" (`new` + `preserve`), and both apart from "this subject was already discussed and I'm reaching back to it specifically" (`historical_reference`), is the genuinely new piece of language understanding this spec requires; the investigation confirmed there is **no existing concept** of any of the three in the codebase (`destinationRelationship.js` answers a different question — how multiple destinations *named in one turn* relate to each other, not how this turn relates to the conversation's history; a `grep` across `server/src` for any "switch" concept in intent classification, traveler-job resolution, or turn understanding returned nothing).

### 5.4 Plan identity semantics

Getting `activeContextAction` right is necessary but not sufficient — a switch that silently overwrites the plan it switched away from destroys the very thing a later `historical_reference` turn needs to find. Walking the actual transcript this investigation traced makes the requirement concrete: Redwood itinerary → "Actually plan Badlands instead" → Badlands itinerary → "For the Redwood trip…". If the Badlands switch had overwritten the Redwood `TripPlan`'s identity, there would be no Redwood plan left to reference back to.

Because `relationship: 'new'` covers both itinerary-shaped and ordinary Q&A/recommendation/comparison turns (Section 5.3), it has a plan-identity effect only when paired with an itinerary-shaped `TravelerJob`. A `new`-relationship side-query ("Is October good in Acadia?") is never itinerary-shaped, so it never reaches `targetTripId` resolution at all (Section 5.5's gate) and has no plan-identity effect whatsoever — no plan is created, read, or touched.

| Turn `relationship` | Plan identity effect |
|---|---|
| `continuation` (no destination change) | same plan identity |
| `continuation` carrying a refinement | same plan identity, mutated in place |
| `new`, from an explicit itinerary-shaped destination switch while a different trip was active | a **new** conversational plan identity is created; the previous plan is **not** overwritten and remains addressable |
| `new`, from a first itinerary ask (no prior active trip) | new plan identity; nothing to preserve |
| `new`, from an ordinary Q&A/recommendation/comparison side-query (never itinerary-shaped) | no plan-identity effect — `targetTripId` resolution does not run (Section 5.5) |
| `historical_reference` | targets the previous, non-active plan for this one operation; does **not** change `activeContextAction` and does **not** touch whatever is currently active |

Only an explicit replace/delete instruction from the traveler ("Replace my Redwood trip with Badlands," "delete my Redwood trip") may destroy or overwrite a previous plan record. An itinerary-shaped destination switch alone — "Actually, plan Badlands instead" — is never such an instruction: it changes current focus (`activeContextAction: 'set'`) while leaving the Redwood `TripPlan` record fully intact and addressable by a later `historical_reference` turn.

### 5.5 `targetTripId` — when it resolves, and in what order

`targetTripId` resolution runs **only** when `TravelerJob` actually needs plan context: a refinement (any plan mutation), a question explicitly about a named prior/historical trip, an explicit saved-trip operation (rename/archive/delete), or an itinerary-shaped request that reads, extends, or replaces plan context. It does **not** run for `general_qa`, `recommendation`, `comparison`, or `logistics`-shaped `TravelerJob`s, even when those turns name a destination or a trip in passing — "Is October nice in Acadia?" and "Yosemite or Sequoia?" perform no `TripPlan` lookup or mutation at all; `targetTripId` stays `null` and nothing downstream needs it. This also removes the accidental plan coupling a side-query would otherwise risk.

**Never resolve `targetTripId` from destination name alone.** A traveler can have multiple prior trips to the same destination (e.g. "Redwood weekend · May" and "Redwood family trip · August"). When resolution does run, the order is:

1. **Explicit trip identifier/title**, when the traveler names one directly (a saved trip's title, or an explicit "that May trip" style reference against a short list of named candidates).
2. **Conversation-plan association** — the trip already bound to *this* conversation/session, i.e. what `prepareChatContext` already loads via `TripPlan.findById(tripId)` where `tripId = metadata.tripId || body.tripId || body.conversationId` (`server/src/routes/ai.js:916-922`). This is correct and stays as the default **only** when `relationship` is `continuation` (including refinement of the active plan). It does **not** apply when `relationship` is `new` from a destination switch — that case gets a fresh plan identity (Section 5.4), never a reuse of the outgoing conversation's existing `tripId`.
3. **Destination + contextual disambiguators** — when `relationship === 'historical_reference'`, search the traveler's saved trips by destination plus whatever disambiguating context is present (season/month mentioned, "the one from May," recency).
4. **Single unambiguous matching prior plan** — if exactly one saved trip matches step 3's candidates, that is `targetTripId`.
5. **Otherwise: ask.** If step 3 returns zero or more than one candidate, `targetTripId` is `null`, `ambiguity` is populated, and the turn must produce a clarifying question — never guess, and never silently fall back to "whichever conversation is currently open."

This directly closes the mechanism found in Turn E of the prior trace: today, `savedTripPlan`/`existingCanonicalPlan` is loaded solely by step 2's rule with no fallback to steps 3-5 and no gate on whether `TravelerJob` even needs it, so a message naming a different, non-active trip ("For the Redwood trip: on Day 2…") flows straight into `validateArtifactFulfillment` (`server/src/services/artifactFulfillment.js:50-108`) or `validateAssistantMutationScope`'s `unrelated_assistant_mutation` check (`server/src/validation/tripWriteContract.js:314-341`) against the *wrong* plan, producing the generic, non-diagnostic failure copy at `artifactFulfillment.js:135` — *"I couldn't apply that change to your saved itinerary, so your current plan has not been changed."* Under this contract, that same input either resolves `targetTripId` correctly (step 3/4) or produces one clarifying question (step 5) — it never reaches patch validation against an unrelated plan.

### 5.6 `confidence` and `ambiguity`

`confidence`/`ambiguity` generalize `activeTripContext.lowConfidenceClarification` (`activeTripContextService.js:496-503`), which today is populated in exactly one narrow branch (no destination resolved, a short follow-up, and follow-up language needing a destination). Under this contract, `ambiguity` is populated whenever *any* part of `TurnTripContext` resolution — `subjectDestinations`, `relationship`, or (when it runs at all, per Section 5.5) `targetTripId` — could not resolve to a single confident answer, not only the one destination-only case that exists today.

## 6. Response mode follows `TravelerJob`, not "an active itinerary exists"

This is a behavioral rule, not a new mechanism: **an active canonical plan is a piece of context, never a forcing function.** A general question asked while an itinerary is active must still resolve to `plain_answer`; a comparison question must still resolve to `comparison`; only a request whose `TravelerJob` is itinerary-shaped (new plan or refinement) may resolve to `itinerary`.

The mechanism for this already exists and is not touched by this spec: `presentationManifest.js`'s `primaryFor()` (`server/src/utils/presentationManifest.js:142-220`) already keys off `envelope.intent.primaryIntent`/`travelerJob`, not off "does `canonicalPlan` exist" — the itinerary branch (`presentationManifest.js:153-160`) is explicitly gated on `shouldShowDayByDayItinerary({ job: travelerJob })` or a small set of itinerary-shaped `primaryIntent` values, **and** `fulfilled(envelope, 'canonicalPlan')`. This spec's contribution is making sure the `intent`/`travelerJob` handed to that function is the single authoritative `TravelerJob` from Section 4, computed once, not a stale or telemetry-only classification. `activeContextAction` must never leak into presentation selection either — whether this turn sets a new active trip governs what a *later* turn targets (Section 5.4/5.5), not what *this* turn's `presentationKind` is; that still comes solely from `TravelerJob`. The full `intent → presentationKind` mapping table already lives in `docs/superpowers/specs/2026-08-12-trailie-presentation-manifest-v1-design.md` Section 7 and is reused verbatim — it is not restated or modified here.

## 7. Evidence follows information need, unchanged

`evidencePlannerService.js`'s `planEvidenceRequirements` (`server/src/services/evidencePlannerService.js`) does question-scoped topic selection via `switch (intent.primaryIntent)`, consuming `intent`, `resolvedEntities`, `priorTripState`, `constraints`, `tripScope` as inputs. This spec does not touch that switch statement or its topic logic, nor the module's existing, correct use of `destinationRelationship.js`'s `CHOICE_RELATIONSHIPS` (`evidencePlannerService.js:12, 302-304`). It changes what feeds two of those inputs:

- `resolvedEntities` becomes a direct projection of `TurnTripContext.subjectDestinations` — **all** of them, not one — replacing the entryContext-priority and stale-`tripScope` paths described in Section 5.2, which today can silently truncate or override a multi-destination turn to a single stale entry.
- `priorTripState` becomes the single `TurnTripContext.activeTripBeforeTurn` + `relationship` + `activeContextAction`, replacing the two divergent prior-state builders described in Section 4.1.

`evidencePlannerService.js` remains exactly what it is today: a consumer, correctly scoped, that receives correct inputs instead of resolving anything itself.

## 8. Presentation follows the existing manifest, unchanged

`presentationManifest.js`'s `buildPresentationManifest` (`server/src/utils/presentationManifest.js:229-257`) picks response shape purely from the `intent`/`presentation`-envelope object it is handed. It does not resolve destination/trip identity itself today, and this spec does not ask it to. See Section 6 — the only change in its effective behavior is that the `intent` it receives is now backed by one authoritative `TravelerJob`/`TurnTripContext` pair instead of whichever of the two competing classifications happened to reach it.

## 9. Response behavior table

This is the product-level behavior contract. `presentation-manifest-v1` Section 7's `intent → presentationKind` mapping is its implementation-facing counterpart and is not restated here.

| Traveler asks | `TravelerJob` | `activeContextAction` | Response |
|---|---|---|---|
| "Is October good for Zion?" | Q&A | preserve | Natural prose |
| "Best easy hikes in Zion?" | Recommendation | preserve | Recommendations |
| "Yosemite or Sequoia?" | Comparison | preserve | Comparison |
| "Do I need a permit?" | Logistics/Q&A | preserve | Direct answer |
| "Plan 3 days in Zion" | Itinerary (new) | set | Day-by-day plan, new plan identity |
| "Make Day 2 easier" | Refinement | preserve | Patch existing plan in place |
| "Plan Badlands instead" (Redwood active) | Itinerary (new) | set | New day-by-day plan for Badlands; Redwood plan record untouched and still addressable |
| "For my Redwood trip, on Day 2…" (Badlands active) | Refinement / historical reference | preserve | Operates on the referenced Redwood plan; Badlands stays the active context |
| "By the way, is October good for Acadia?" (Redwood active) | Q&A | preserve | Natural prose about Acadia; Redwood plan untouched |

`set` is the same value whether there was no prior active trip at all or a different one was active — the mechanical effect (this destination becomes the active focus) is identical either way. Whether a genuine *switch* occurred (as opposed to a first-ever active trip) is derivable from `activeTripBeforeTurn` and the old/new `primaryDestination`, per Section 5.3 — it is not a distinct `activeContextAction` value.

### 9.1 Four independent axes, not one collapsed decision

The following turns demonstrate the core separation this document establishes: **what** is being asked (`TravelerJob`), **what place** it's about (`subjectDestinations`/`primaryDestination`), **how this turn's subject relates to the conversation** (`relationship`), and **whether active context changes** (`activeContextAction`) are independent axes — not one collapsed decision. (A fifth axis, **which plan** is being operated on — `targetTripId` — is addressed separately in Section 5.5, since it does not apply to every row below; see the gate there.)

| Traveler turn | `TravelerJob` | Relationship | Active action |
|---|---|---|---|
| Redwood active → "Is October nice in Acadia?" | Q&A | new | preserve |
| → "What about November?" | Q&A | continuation | preserve |
| No trip → "Plan Zion for 3 days" | itinerary | new | set |
| Redwood active → "Actually plan Badlands instead" | itinerary | new | set |
| Badlands active → "Make Day 2 easier" | refinement | continuation | preserve |
| Badlands active → "For my Redwood trip, change Day 2" | refinement | historical_reference | preserve |

Rows 1 and 3-4 share `relationship: new` and yet take different `activeContextAction` values — `relationship` and `activeContextAction` are independent fields, exactly as Section 5.3 states, not two names for the same fact. (Row 1's `relationship` is `new` rather than `continuation` because Acadia was not the immediately relevant prior subject; the Redwood trip itself is untouched precisely because `activeContextAction` stays `preserve`.) Row 2 shows why `relationship` cannot be judged against `activeTripBeforeTurn` alone: Redwood is still the *active trip* throughout rows 1-2, yet row 2 is `continuation` — because the immediately relevant prior *subject* is now Acadia, per Section 5.3's Turn-1/Turn-2 worked example. Row 5 shows the same `continuation` value arising from an entirely different situation — a refinement of the currently active plan — underscoring that `relationship` tracks subject/target continuity, not a fixed meaning tied to one `TravelerJob`.

## 10. Trailie voice rules

### 10.1 This document is the authority; the leak scanner is enforcement, not the definition

Voice has two parts: **prohibited internal vocabulary** and **positive behavioral quality**. This document is the authority for both. `server/src/utils/travelerVoiceLeakage.js` is the enforcement/regression mechanism for the first part only — a pinned, negative list of forbidden internal/machine vocabulary. It is not, and must not be treated as, the definition of Trailie's voice as a whole.

Stated plainly: **behavior spec = authority for Trailie's voice. `travelerVoiceLeakage.js` = enforcement/regression list for known forbidden leakage, not the definition of voice itself.**

This is a **content/voice** concern, orthogonal to the structural concerns in Sections 4-8. `TravelerJob`/`TurnTripContext`/`presentationManifest` decide *what shape* a response takes and *which trip* it is about; voice rules decide what words are permitted and how Trailie speaks, regardless of shape. A response can have a perfectly correct `activeContextAction: 'set'` and a correct `presentationKind: 'itinerary'` and still leak internal machinery into the sentence Trailie speaks, or answer correctly but in a generic, over-explained, architecture-narrating voice — both are voice failures this section covers, and neither is caught by a vocabulary scanner.

### 10.2 Prohibited vocabulary (enforcement mechanism: `travelerVoiceLeakage.js`)

`server/src/utils/travelerVoiceLeakage.js` is a real, already-built scanner, pinned by `server/src/utils/__tests__/travelerVoiceLeakage.test.js` (692 tests referenced in prior work). Its own header states the scope precisely: *"A pure, offline detector for internal/machine vocabulary that must never reach a traveler-visible field — intro, narrativeSections[].markdown, day.label, stop.note, stop.why, stop.alternatives[].note, patch response."* It already bans, among others: `canonical (?:itinerary|plan)`, `(?:frozen )?evidence bundle`, `existing stops?`, `replacement experience`, `validators?`, `repairs?(?:ed|ing)?`, `obligations?`, `coverage`, `constraint eligib\w*`, `(?:compatible |eligible )?candidates?`, `placeRef`/`stopRef`/`dayRef`/`stopId`, `patch_itinerary`/`apply the patch`/`bounded (?:patch|operation)` (`travelerVoiceLeakage.js:25-51`).

Its own header also states, twice, that it is **not wired into generation, validation, or repair** — it exists only so tests can pin captured output, "the way the fixed schema descriptions and instruction text... are meant to prevent it at the source."

This spec's requirement for the vocabulary half of voice: `BANNED_PATTERNS` in this one file remains the single source of truth, including the destination/trip-identity vocabulary this investigation surfaced (e.g. Trailie must never say "I don't have Badlands information here" — an internal-retrieval-state leak — or "verified replacement" for a destination switch, or expose `tripId`/`conversationId`/`responseId` in prose). New banned patterns belong in `BANNED_PATTERNS`, not a second scanner. Whether this scanner becomes wired into a live/pre-send check (as opposed to remaining offline/test-only) is an implementation decision explicitly deferred by Section 14 — this spec only fixes that the vocabulary contract lives in one place.

### 10.3 Positive behavior (owned by this spec — a vocabulary scanner cannot express these)

None of the following currently has an enforcement mechanism in the codebase; that is an implementation gap, not a reason to leave the requirement unspecified here.

- **Answer the question first.** The direct answer leads; supporting detail follows. A traveler asking "Is October good for Zion?" should not have to read past a paragraph of throat-clearing to get to the answer.
- **Be specific, not generic.** Trailie's advantage is the trip in front of it — named trails, named stops, actual dates. Generic travel-blog phrasing that could apply to any park is a voice failure even when factually correct.
- **Don't over-explain.** State the answer and the material caveat; do not narrate every consideration that went into it.
- **Don't narrate the architecture.** This is the positive form of Section 10.2's negative list — even without a banned phrase, describing *that* evidence was fetched, a plan was patched, or a destination was resolved is out of voice. Trailie talks about the trip, never about its own process for producing the answer.
- **A natural opening.** No fixed template greeting; the first sentence responds to what was actually asked.
- **Structure only when it helps.** Bullets, headers, and day-by-day formatting exist because the content is genuinely structured (an itinerary, a comparison, a checklist) — not by default on every response.
- **A natural ending.** No mandatory boilerplate sign-off; an ending exists when there is a real caveat or a real next step, not as a fixed closing ritual.
- **No repetitive or redundant summary sections.** A response must not restate, in a closing paragraph, what its own structured artifact (itinerary, comparison table, requirements list) already shows.

### 10.4 Additions this investigation surfaces

- Never expose that a destination switch, historical-plan lookup, or ambiguity resolution happened mechanically ("I resolved your destination to Badlands," "target trip identified") — Trailie states the trip-facing conclusion ("Switching to Badlands — here's a fresh 2-day plan") in its own voice, never its resolution process.
- Never use the generic, mechanism-revealing failure copy from `artifactFulfillment.js:135` as a substitute for actually asking a disambiguating question when `TurnTripContext.ambiguity` is populated (Section 5.5, step 5). A `targetTripId` ambiguity is a **conversational** event ("You have two Redwood trips — the May weekend and the August family trip. Which one?"), not a generic apply-failure message.

## 11. Relationship to existing specs

```text
docs/superpowers/specs/2026-08-12-trailie-presentation-manifest-v1-design.md
docs/superpowers/specs/2026-08-09-trailie-wp5a-evidence-broker-nps-shadow-design.md
                              ^
                              | consume, unchanged
                              |
                 +------------------------+
                 |  TravelerJob            |   <- this spec
                 |  TurnTripContext         |
                 +------------------------+
```

This spec sits **above** both. It produces `TravelerJob` and `TurnTripContext`; presentation-manifest-v1 and WP5A remain live, unmodified, and consume them exactly as they consume `intent`/`resolvedEntities`/`priorTripState` today. Neither existing spec's schema, validation rules, or selection logic changes. If a future revision of either spec changes what it needs from upstream, that is a change to their own documents, not this one.

## 12. Behavior test matrix

The acceptance principle is explicit: **"a destination switch works" is an invariant of the system, not a fact about Badlands.** Any fixture pinned to one specific park pair is a regression fixture, not the definition of correctness. The Redwood→Badlands transcript from the prior trace becomes exactly one row in the `destination_switch` category below — not the spec's success criterion.

8 categories × 5 cases, park-rotated (no park name repeats across a category's 5 cases, and no category is pinned to the same park pair the prior trace used):

| Category | What it proves | Example rotation (parks vary per run) |
|---|---|---|
| `general_qa` | `TravelerJob` resolves to Q&A regardless of an active itinerary, **including when the question names a different destination than the active trip** — `activeContextAction` stays `preserve`; response mode stays `plain_answer` | 5 factual questions, each posed both with and without an active plan for a *different* park |
| `recommendation` | `TravelerJob` resolves to recommendation without silently entering itinerary mode, **including when the recommendation is about a park other than the active trip's** — `activeContextAction` stays `preserve` | 5 "where should I..." asks across 5 different park pairs |
| `current_logistics` | Evidence/response mode reflect a live/operational ask, not a plan mutation; `targetTripId` resolution never runs (Section 5.5) | 5 conditions/access/hours asks, distinct parks |
| `comparison` | `presentationKind: comparison` regardless of which park has an active plan; `destinationRelationship` correctly resolves `compare`/`alternative_choice` for the named pair without touching `activeContextAction` | 5 compare pairs, none reusing a park from another category's active-plan case |
| `new_itinerary` | `relationship: 'new'`, no prior trip referenced, no `activeTripBeforeTurn` | 5 first-ask itinerary requests, distinct parks |
| `refinement` | `relationship: 'continuation'`, `targetTripId` resolves to the active conversation's plan via Section 5.5 step 2 | 5 refinement asks against 5 different active plans |
| `destination_switch` | An explicit itinerary-shaped destination switch: `relationship: 'new'`, `activeContextAction: 'set'`, `subjectDestinations` updates in the same turn with no stale `tripScope`/`entryContext` carryover, and the previous plan's identity is preserved and remains addressable (Section 5.4) — distinguished from the `general_qa`/`recommendation`/`comparison` categories' `new` + `preserve` cases by `TravelerJob` and `activeContextAction` alone, per Section 5.3 | 5 switch pairs (the original Redwood→Badlands pair is one of the five) |
| `historical_plan_reference` | `relationship: 'historical_reference'`, `activeContextAction` stays `preserve`, `targetTripId` resolves via Section 5.5 steps 3-5, including the ambiguous-multiple-trips-same-destination case that forces a clarifying question | 5 cases: 3 with a single unambiguous match, 2 with 2+ same-destination candidates requiring Section 5.5 step 5 |

Each case asserts, at minimum: the resolved `TravelerJob`, the resolved `TurnTripContext` (`subjectDestinations`, `destinationRelationship`, `relationship`, `activeContextAction`, `targetTripId`, `ambiguity`), the `presentationKind` that reached the manifest, and — for `destination_switch`/`historical_plan_reference` — that no plan record other than the correctly-resolved `targetTripId` was mutated.

At least one case in `general_qa`, `recommendation`, `current_logistics`, and `comparison` must reference a destination different from the currently active trip and assert `activeContextAction: preserve`.

## 13. Acceptance criteria

The design is ready for implementation planning when the user approves this written spec and the following statements are unambiguous:

- `TravelerJob` and `TurnTripContext` are computed once per turn, by one resolution pass, as sibling outputs — neither derived from the other's finished result (Section 3).
- No second, independently-assembled prior-trip-state object is built anywhere downstream of that resolution pass (closing the `intentPriorTripState`/`buildClassifierPriorTripState` split in Section 4.1).
- `resolvedEntities` is a direct projection of `TurnTripContext.subjectDestinations` (all of them, never truncated to one); `entryContext.requestedDestinations` and persisted `tripScope.destinations` are no longer independently-consulted destination sources.
- Naming a different destination in a turn never, by itself, sets `activeContextAction: 'set'`; `set` requires an itinerary-shaped `TravelerJob` explicitly naming a new destination (Section 5.3). Every Q&A, recommendation, comparison, and logistics turn preserves the active trip context regardless of which destination(s) it names, even though `relationship` may correctly read `new` for that turn's subject (Section 5.3/9.1) — and the test matrix (Section 12) asserts this with real cases, not only as a stated rule.
- An explicit itinerary-shaped destination switch creates a **new** plan identity and never overwrites the plan it switched away from; only an explicit replace/delete instruction from the traveler may do that (Section 5.4).
- `targetTripId` resolution does not run at all for `general_qa`/`recommendation`/`comparison`/`logistics`-shaped `TravelerJob`s (Section 5.5); when it does run, the five-step order is followed, ending in a clarifying question rather than a guess when ambiguous.
- `presentationManifest.js` and `evidencePlannerService.js` are unmodified as consumers; this spec changes their inputs, not their logic. `destinationRelationship.js` is reused verbatim, not replaced.
- An active canonical plan never forces `presentationKind: itinerary` for a non-itinerary `TravelerJob`.
- This document is the authority for Trailie's voice, including the positive behavioral qualities in Section 10.3; `travelerVoiceLeakage.js` remains the enforcement/regression list for prohibited vocabulary only, and all new banned-phrase additions extend its existing `BANNED_PATTERNS` rather than a new scanner.
- The behavior test matrix in Section 12 is park-rotated; no acceptance claim is stated in terms of one specific park pair.

## 14. Explicitly deferred implementation decisions

This document authors the product contract. It does not authorize:

- File boundaries for where `TurnTripContext`/`TravelerJob` resolution lives (a new module vs. absorbed into `activeTripContextService.js`/`trailieIntentClassifier.js`).
- The exact ranking/selection algorithm for `subjectDestinations → primaryDestination` (which named candidate becomes "primary" when several are named in one turn).
- The exact mechanical decision-rule implementation for `activeContextAction` (Section 5.3) — how "itinerary-shaped `TravelerJob`" and `explicitDestinationMention` are combined in code, beyond the product rule stated.
- The exact algorithm/regex/NLU approach for trip-title disambiguation (Section 5.5 steps 1 and 3) — "explicit trip identifier" and "contextual disambiguators" are named as resolution *inputs*, not specified as implementations.
- Whether `travelerVoiceLeakage.js` becomes wired into a live pre-send check versus remaining an offline/test-only scanner (Section 10.2) — only that any new vocabulary lives in that one file, and that positive-voice qualities (Section 10.3) need their own, separate enforcement mechanism not yet specified.
- A migration or rollout plan (flag names, shadow-mode comparison, cohort sequencing) for retiring the competing destination authorities named in Section 5.2.
- Data-model changes needed to support multi-trip same-destination disambiguation (e.g. whether `TripPlan` needs a queryable title/date index for step 3/4 lookups).
- Any change to `TripPlan`, `TrailieConversationPlan`, or other persistence schemas.

No implementation, provider/model call, migration, deployment, or live validation is authorized by this design document.
