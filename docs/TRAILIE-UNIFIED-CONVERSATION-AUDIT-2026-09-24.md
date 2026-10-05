# Trailie unified conversational architecture — final audit

**Date:** September 24, 2026  
**Scope:** Offline implementation of the unified Trailie conversational fixes (understanding / sufficiency / action resolution / presentation / canonical consistency).  
**Model stack:** Unchanged (GPT-6 Luna low → Sol low → Sol medium → Astra medium escalation only).  
**Deploy / production / live paid runs:** None. Not authorized; not performed.

## Verdict

**Offline acceptance gate: PASS.**  
**Live GPT-6 qualification: NOT RUN.**  
**Production cutover readiness: NO.**

The deterministic conversational architecture changes requested in the final implementation prompt are in the working tree and verified offline. They do not replace the need for a controlled live qualification against disposable MongoDB. Prior live/funded findings from September 23 remain the last live behavioral evidence and are **not** cleared by this offline pass.

## What this audit covers

| Covered | Not covered |
|---|---|
| Material sufficiency / turn execution decision layer | Paid GPT-6 conversation qualification |
| Action / temporal resolution (no undated guessing) | Browser / iOS rendering certification |
| Pushback + conditional after-plan presentation | Live Google route/map authorization |
| Failure messaging categories | End-to-end smoke of the 10 live cases |
| Narrative / display-label / derived-hash invariants | Production cutover |
| Provider-isolated offline regression suites | Fine-tuning or model-stack changes |

## Offline verification

| Measure | Result |
|---|---|
| Suites | **21 / 21 passed** |
| Tests | **497 / 497 passed** |
| Runner | `server/scripts/test-trailie-repair-offline.js` |
| Provider isolation | `liveAnthropicConstructors: 0`, `liveOpenAiConstructors: 0`, `liveProviderDispatches: 0`, `externalProviderHttpRequests: 0` |
| New unified fixture suite | `server/src/utils/__tests__/unifiedTrailieConversation.test.js` — **19** regression cases |

Evidence log from the gate run: `/tmp/trailie-offline-final.log`.

## Architecture rule preserved

Deterministic code owns truth, state, scope, provenance, and action safety. GPT-6 retains travel judgment, wording, and recommendation shape.

No new destination-specific decision branches were added in production code. Hardcoding scan of this-session production files found destination names only inside **pre-existing comments**, not new runtime rules. The previous `KNOWN_NON_NPS_DESTINATIONS` readiness list was removed.

| Check | Count |
|---|---:|
| Destination-specific production rules added | 0 |
| Canned destination answers added | 0 |
| Fixed traveler response templates added | 0 |
| Fine-tuning | none |

## Implementation map

### Understanding / sufficiency

| Change | Location |
|---|---|
| Semantic execution decisions (`answer_now`, `answer_and_refine`, `sketch_now`, `plan_now`, `clarify_before_plan`, `edit_now`, `clarify_before_action`, `pushback`, `adapt`) | `server/src/utils/turnSufficiencyDecision.js` |
| Attached to turn contract | `server/src/services/turnUnderstanding.js` |
| Itinerary readiness uses material gaps (not force-require dates/lodging/fitness/party) | `server/src/utils/itineraryReadiness.js` |
| JSON/itinerary emit path consumes the same readiness decision | `server/src/utils/discoveryQuery.js` |

### Action resolution

| Change | Location |
|---|---|
| Resolve booking / stop action targets before mutation | `server/src/utils/actionTargetResolution.js` |
| Wire unresolved booking anaphora into refinement scope | `server/src/utils/refinementScope.js` |
| Undated `tomorrow` / `today` → unresolved (no day-2 / day-1 guess) | `server/src/utils/refinementScope.js` |
| Pass trip lodging state into scope resolution | `server/src/services/trailieExecutionService.js` |

### Planning / repair (preserved + exercised)

Eligibility-before-model, identical-input retry short-circuit, light-day validity, closure-without-filler, wheelchair/exposure hard constraints, and city park-identity contamination guards remain in the existing repair path and continue to pass in:

- `offlineRepairQualification`
- `fundedRuntimeRegressions`
- `itineraryCompleteness`
- related repair suites in the offline runner

No new destination-specific repair branches were introduced.

### Presentation

| Change | Location |
|---|---|
| Remove `You asked:` pushback prefix | `server/src/utils/tripPushback.js` |
| After-plan note only if model-authored or material dependency (permit / shuttle / seasonal road / etc.) | `server/src/utils/visibleItineraryCompleteness.js`, architect contracts / tool schema |
| Traveler-facing failure categories; always states saved plan unchanged | `server/src/services/artifactFulfillment.js` (+ execution wiring) |

Prompt budget note: after-plan guidance was kept short enough that architect turns no longer fail with `prompt_v2_budget_infeasible` in the offline execution suite.

### Canonical / prose / identity / derived state

| Change | Location |
|---|---|
| Narrative may not describe unsaved stops; empty `changedDays` cannot narrate a full rewrite | `server/src/utils/canonicalPlanNarrative.js` |
| Grounded `displayName` separate from canonical identity | `server/src/utils/stopDisplayLabel.js` (+ `finalizeItinerary.js`) |
| Derived logistics remain hash-bound | existing `planDerivedState` (covered by unified fixtures) |
| Removed-stop stale alternatives / narrative cleanup | existing `invalidateRemovedStopReferences` (still covered) |

## Offline acceptance matrix (from the implementation prompt)

### Understanding / sufficiency

| Gate | Offline status |
|---|---|
| Simple factual → answer now | Pass |
| Comparison → answer first | Pass |
| Discovery → answer now | Pass |
| Materially underspecified committed planning → focused clarification | Pass |
| Same planning request with sufficient saved context → plan now | Pass |
| Ambiguous action → clarify | Pass |
| Undated temporal target → no guessing | Pass |

### Planning / repair

| Gate | Offline status |
|---|---|
| Hard traveler constraints propagate into repairs | Pass (existing + funded regressions) |
| No pointless retries on deterministic blockers | Pass |
| Light days can be valid | Pass |
| Closure can reduce a day without filler | Pass |
| Bounded edits preserve unaffected days | Pass (existing suites) |

### Presentation / consistency

| Gate | Offline status |
|---|---|
| No `You asked:` pushback prefix | Pass |
| No mandatory generic after-plan note | Pass |
| Failure reason useful / nontechnical | Pass |
| Canonical identity and display label stay separate | Pass |
| Narrative only describes saved plan | Pass |
| Removed stops cannot remain in alternatives | Pass |
| Important known logistics renderable when stamped | Pass (hash/stamp contract) |
| Current derived artifacts match canonical hash | Pass |

## Relationship to prior audits

| Prior document | Role relative to this audit |
|---|---|
| [TRAILIE-LOCAL-QUALIFICATION-AUDIT-2026-09-23.md](TRAILIE-LOCAL-QUALIFICATION-AUDIT-2026-09-23.md) | Broad live qualification; smoke 8/10; cutover blockers listed |
| [TRAILIE-CORE-RUNTIME-FIX-REPORT-2026-09-23.md](TRAILIE-CORE-RUNTIME-FIX-REPORT-2026-09-23.md) | Core repair/accessibility/continuity fixes; funded retry still failed live |
| This report | Conversational sufficiency / action / presentation unification; **offline-only** acceptance |

This report does **not** claim that the September 23 funded-retry failures (wheelchair repair typing, exposure polarity in live threads, stale alternatives in live narrative, Seattle park-code contamination under live generation) are live-cleared. Several of those have offline regressions; live confirmation is still required.

## Remaining deterministic limits

1. Booking / “that reservation” resolution needs lodging objects present in trip state in the shapes the resolver reads.
2. Display labels improve only when grounded evidence/official titles exist; otherwise the traveler-facing name stays the canonical title.
3. Drive rows in UI still depend on logistics actually being populated by the existing derived path; this work enforces hash currency, not new provider routing.
4. Active-trip place disambiguation is handled at sufficiency/context readiness level; it is not a full geographic NER disambiguator.

## Offline freeze

**Stop changing Trailie offline** unless a live run proves a deterministic regression.

Frozen unless a live failure forces a narrow fix:

* GPT-6 Luna / Sol / Astra routing
* core Trailie voice
* clarification / sufficiency architecture
* canonical trip design
* repair eligibility
* response-shape philosophy
* presentation architecture

Structural offline goals are met: answer-now vs clarify-before-plan/action without becoming a form; ambiguous reservations and undated “tomorrow” do not get guessed into mutations; pushback wrappers, mandatory itinerary tails, canned failures, and prose/canonical drift are constrained at the correct layers — with **zero** new destination-specific production rules, canned destination answers, fixed response templates, or fine-tuning.

## Remaining live / provider work

1. One controlled paid core run (`final-check-1`) — four conversations once.
2. Only if 4/4 clean: one second core repetition (not automatic triple resume).
3. Only if both are 4/4 (8 consecutive clean core conversations): ten-case smoke once.
4. Local Google authorization for route/map artifact qualification (separate from GPT-6 core).

## Live check — `final-check-1` (September 24, 2026)

**Authorized:** one controlled paid core run.  
**Command:** `TRAILIE_CORE_RUN=final-check-1 node scripts/qualify-trailie-core-local.js --live`  
**Outcome:** **NOT 4/4. Stopped after Continuity failed** (per progressive rule: do not keep spending). Closure turn 1 had started; Seattle not reached.

| Case | Result | Notes |
|---|---|---|
| Wheelchair | **Clean on this turn** | `complete`, hash match, **1 Sol / 0 Astra**. Saved `mobility.wheelchair: true`. Stops were museum / patio viewpoint / lodge / visitor centers — **no hike types**. |
| Continuity | **FAIL** | Turn 1 `Give me four days in Zion.` → `evidence_incomplete` after Sol×2 + Astra (`stop_identity_unresolved`, `missing_experience_anchor`). No itinerary created. Later preference/edit turns mostly failed (`empty_day`, duplicates) with traveler copy saying the saved plan was not changed. Late turns 8–10 eventually showed hash matches / scoped day changes, but the conversation never had a clean committed start. |
| Closure → rain → fatigue | **Incomplete** | Turn 1 completed a 3-day Springdale plan (hash match; one identity retry then pass). Run killed before rain/fatigue turns. |
| Seattle | **Not run** | Stopped to avoid further spend. |

**Spend (partial run):** 25 GPT-6 dispatches — 21 Sol, 4 Astra; settled usage estimate **~$1.28** (harness accounting, not a bill). Cap was $8. Artifacts: `/tmp/trailie-core-final-check-1.log`, `/tmp/trailie-core-final-final-check-1.jsonl`.

**Gate decision:** do **not** run a second core repetition or smoke. Diagnose Continuity turn-1 failure offline first (`stop_identity_unresolved` / `missing_experience_anchor` on initial Zion four-day commit).

## Progressive live qualification (authorized progression)

Do **not** burn three expensive `resume-1/2/3` repetitions up front.

```text
497/497 offline
        ✅  (frozen)
         ↓
1 paid core run  (TRAILIE_CORE_RUN=final-check-1)
         ↓
   ┌────┴────┐
 FAIL      4/4 PASS
   │         │
 STOP        ↓
 fix      second run only
offline       ↓
          4/4 PASS
              ↓
        10-case smoke
              ↓
        if clean:
     production-cutover planning
```

### Step 1 — one controlled live run

From `server/`, disposable MongoDB, unchanged GPT-6 routing, no production writes:

```bash
TRAILIE_CORE_RUN=final-check-1 node scripts/qualify-trailie-core-local.js --live
```

Inspect only:

* Did all 4 behave correctly? (wheelchair, continuity, closure→rain→fatigue, Seattle)
* Did sufficiency ask when it should / avoid over-clarifying?
* Did continuity save the right changes?
* Did prose match the canonical plan?
* Did Sol finish without ridiculous retries? How often did Astra appear?
* Did city planning produce real places?
* Did adaptation change the actual plan?
* Did any hard constraint get violated?

### Step 2 — only if Step 1 is 4/4 clean

One second core repetition (not three). If that is also 4/4 → **8 consecutive clean core conversations**, then smoke once:

```bash
TRAILIE_CORE_RUN=smoke node scripts/qualify-trailie-core-local.js --live --smoke
```

### If Step 1 fails

**Stop immediately.** Do not spend another dollar repeating the same broken behavior. Diagnose offline, fix the deterministic cause, then re-run one controlled live check.

## Cutover statement

Offline conversational architecture acceptance is complete and **frozen**.  
Live behavioral qualification is incomplete until `final-check-1` (and the progressive path above) passes.  
**Do not treat this audit as production-cutover approval.**
