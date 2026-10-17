# Trailie Stage 14.5 — Restore, share, and export for revisioned responses

**Offline implementation and deterministic tests only. Zero provider calls.**
Both Stage 14 flags disabled by default. Nothing committed or pushed. No
automatic prose continuation. Anonymous persistence untouched.

---

## 1. The common stored-presentation resolver

```js
deriveTrailieStoredPresentation({ response, canonicalPlan, viewerContext, recoveryCapability })
→ { state, showItinerary, showProse, showEmptyAssistantBubble,
    showRecoveryAction, publicNotesStatus, notesLabel, content,
    lifecycleDiagnosticCode }
```

`state` is a bounded enum: `legacy_terminal | itinerary_only | prose_complete |
fallback_complete | invalid`.

It exists twice — `server/src/utils/trailieStoredPresentation.js` and
`next-frontend/src/utils/trailieStoredPresentation.js` — because the share
payload is built on the server while restore and export run in the browser.
**One interpretation is an enforced property, not a convention:**
`shared/trailieStoredPresentation.fixtures.json` holds 17 cases with their exact
expected presentation, and both suites run it. A divergence fails both. This
mirrors the existing `shared/itineraryArtifacts.fixtures.json` pattern.

All three surfaces read it:

| Surface | Entry point |
|---|---|
| authenticated restore | `TripPlannerChat` message render |
| shared-trip payload | `sharedTripPayload.js` → `selectSharedAssistantMessages` + `deriveNotesStatus` |
| export / PDF | `lib/pdf/buildTripExportPayload.js` |

The resolver is pure (asserted: it mutates neither argument), never rebuilds an
itinerary from prose (asserted with markdown that looks like a day list), and
never repairs corruption.

---

## 2. Legacy and revision interpretation

| Stored shape | State | Notes |
|---|---|---|
| no `responseRevision` | `legacy_terminal` | **empty content is NOT revision 1** — persistence normalizes a missing revision to terminal, and presentation agrees. Guessing here would offer "Generate trip notes" on responses that never had a checkpoint. |
| rev 1 + `itinerary_ready` + `content === ''` + matching hash | `itinerary_only` | itinerary, no prose bubble, bounded label |
| rev 2 + `prose_ready` + content + matching hash | `prose_complete` | itinerary + prose |
| rev 2 + `fallback_complete` + content + matching hash | `fallback_complete` | identical layout, **no error styling** |

Invalid combinations are returned as `invalid` with a bounded
`lifecycleDiagnosticCode`, never silently normalized:

`revision_1_content_not_empty` · `missing_canonical_plan` ·
`itinerary_hash_mismatch` (both revisions) · `revision_2_content_empty` ·
`unsupported_lifecycle_status` · `unsupported_revision`

Every `invalid` case is asserted to show no prose, no recovery action, and no
empty bubble. `lifecycleDiagnosticCode` is internal — it never reaches a share or
export payload.

---

## 3. Owner restore

A stored explicit revision 1 renders the persisted `EarlyItineraryCard` (days,
stops, feasibility warnings), **no empty assistant prose bubble**, and a passive
`Trip notes were not completed.` The card stays keyed on `itineraryHash`.

Loading a trip performs zero provider calls, zero lease calls and zero
persistence calls — restore is pure rendering; the only thing that spends is the
button.

The `Generate trip notes` action appears **only** when all of these hold:
owner viewer context, capability enabled, valid explicit revision 1, real
(non-`temp-`) trip. It is absent for legacy terminal, revision 2, invalid state,
shared viewers and export. With capability off, revision 1 is still fully
readable as an itinerary.

---

## 4. Recovery capability exposure

`lib/trailieCapabilities.js` returns exactly `{ trailieProseRecoveryEnabled }`,
read from `NEXT_PUBLIC_TRAILIE_PROSE_RECOVERY` — a **separate, explicitly public**
build variable. A test asserts the function's source never references
`process.env.TRAILIE_PROSE_RECOVERY` or any lease-timing variable. Default false.
`getSharedViewerCapabilities()` returns false even when the build enables it.

This is presentation gating, not authorization: the endpoint independently
enforces its own server flag and ownership, so a stale bundle with the capability
baked in still gets a `404`.

---

## 5. Shared revision-1 and revision-2 behavior

A revision-1 assistant turn has `content: ''`. Publishing it would render an empty
bubble for the recipient — precisely the "valid itinerary looks broken" failure
this stage removes. It is **dropped**, and a coarse `notesStatus` carries the fact:

| Scope | Revision 1 | Revision 2 |
|---|---|---|
| `plan_only` | itinerary, no conversation | itinerary, **no prose** (scope wins) |
| `plan_plus_explanation` | itinerary, `conversation: []`, `notesStatus: not_available` | itinerary + prose, `complete` |
| `full_conversation` | user messages kept, empty assistant turn dropped | itinerary + prose |
| legacy terminal | unchanged | unchanged |

`notesStatus` is bounded to `complete | not_available` and **never overrides the
privacy scope** — asserted: a `plan_only` share of a completed revision 2 reports
`complete` while the prose string is absent from the payload.

A revision-2 itinerary-hash mismatch publishes **no prose** and reports
`not_available`.

---

## 6. Export

The export path was already plan-only — prose was never embedded — so §7's risk
was a *blank* notes section, not a leak. `buildTripExportPayload` now runs the
same resolver:

- revision 1 → full itinerary + feasibility warnings + `Trip notes were not generated.`
- revision 2 / fallback → `notesStatus: complete`, label dropped, no internal provenance
- hash mismatch → fails closed to `not_available`
- plan-only stays plan-only; export never starts recovery (pure function)

---

## 7. Share freshness after prose completion

Proven by test: the same shared URL stays valid, `JSON.stringify(after.plan) ===
JSON.stringify(before.plan)` (the public itinerary is byte-for-value unchanged
when prose completes), a fresh fetch flips `notesStatus` to `complete` and
surfaces the prose, and no duplicate assistant message appears.

**No parallel share record was introduced** — the payload key set is asserted to
be exactly `{title, parkName, plan, conversation, notesStatus, createdAt, scope,
sharedBy}`, one additive coarse field over the pre-existing shape. The payload is
built per request from the live trip, so a completed revision 2 is visible on the
next permitted fetch; there is no Stage-14-specific cache to invalidate.

---

## 8. Privacy-field stripping evidence

`sanitizePlan` gained six deletions: `responseRevision`, `previousRevision`,
`expectedPreviousRevision`, `lifecycleStatus`, `itineraryReadyAt`, `proseReadyAt`.

A parameterized test serializes the payload for **all three scopes × both
revisions** and asserts the absence of 18 forbidden keys — the six above plus
`reviewMeta`, `auditTrail`, `promptHash`, `contentHash`, `itineraryHash`,
`responseId`, `responseVersion`, `provider`, `model`, and the three lease fields
`leaseToken`, `expectedContentHash`, `generationCompletedAt`. Also asserted
absent: reviewer notes, audit values, `TRAILIE_*` markers, `[ITINERARY_JSON]`,
`input_schema`.

The export payload runs the equivalent check over 15 forbidden plan fields for
revision 1, revision 2, fallback and legacy.

**Recovery lease privacy (§10):** neither restore, share nor export imports the
lease model or service. A user learns recovery is already running only by
pressing the button and receiving the bounded `409` copy.

---

## 9. Cross-surface consistency

The 17 shared fixtures include the same valid revision 1 under `owner`, `shared`
and `export` viewer contexts. All three derive `state: itinerary_only`,
`showItinerary: true`, `showProse: false`, `showEmptyAssistantBubble: false`,
`publicNotesStatus: not_available` — differing only in `showRecoveryAction`
(owner-only) and the surface-appropriate label:

| Surface | Label |
|---|---|
| active stream (14.3) | `Preparing trip notes…` |
| owner restore | `Trip notes were not completed.` |
| shared view | `Trip notes are not available yet.` |
| export | `Trip notes were not generated.` |

A test asserts no stored-state label matches `/preparing|generating|in progress/i`
— stored revision 1 is never presented as proof that Phase B is still running.
The live label wins only while a stream is active (`message.pendingProseLabel`).

For revision 2, all three surfaces report `publicNotesStatus: complete` while
share and export still apply their own scope.

---

## 10. Test results

| Suite | Tests |
|---|---|
| `server utils/__tests__/trailieStoredPresentation.test.js` | 30 |
| `server utils/__tests__/sharedTripRevisions.test.js` | 19 |
| `server utils/__tests__/sharedTripPayload.test.js` (existing, still green) | 9 |
| `frontend utils/__tests__/trailieStoredPresentation.test.js` | 19 |
| `frontend lib/pdf/__tests__/buildTripExportPayload.test.js` | 16 |
| `frontend lib/__tests__/trailieCapabilities.test.js` | 9 |
| **Stage 14.5 focused** | **102 passing** |

```
server src/ suite               : 138 suites, 1,493 tests → 1,488 passing
route parity, BOTH flags ON     :  26 suites,   298 tests → 298 passing
frontend full suite             :  59 files,    524 tests → 513 passing
eslint (all touched files)      : 0 errors
```

The 5 server failures are the unchanged pre-existing live-data ones
(`npsParkAdapter`, `astroFacts`, `npsParkConditions`, `parkChatImages`,
`trailieFetchPlanner`). The 11 frontend failures are the same pre-existing
unrelated four files (`Header`, `WeatherWidget`, `useParkExploreIndex`,
`buildDayByDayPlanFollowUp`). Both flags remain off by default.

Cumulative Stage 14: server suite grew 1,327 → 1,493 tests; frontend 416 → 524.

---

## 11. Proposed Stage 14.6 — deterministic end-to-end integration

### 11.1 Purpose

Every stage so far tested its own seam. 14.6 proves the seams compose, under
**synthetic providers only**, before any flag is enabled.

### 11.2 Scope

One harness under `server/src/eval/trailie/` driving complete turns with
deterministic providers, asserting the whole chain per scenario:

```
request → Phase A → freeze → itinerary_ready → client persist rev 1
        → Phase B → prose_ready → client persist rev 2 → done → reconcile
```

The client half is simulated by the real frontend modules — the Stage 14.3
coordinator, `earlyRevisionMessages`, and the real `resolveCanonicalResponsePersistence`
— wired to an in-memory trip store. That is what makes it end-to-end rather than
two independent suites.

### 11.3 Scenarios (the Stage 14.0 §13 failure matrix, all 12 rows)

1. normal early delivery — exactly 2 writes, 1 turn, 1 plan
2. Phase A structured failure → prose-only legacy terminal, 1 write
3. disconnect before `itinerary_ready` → nothing persisted
4. disconnect after `itinerary_ready` → rev 1 durable, recoverable
5. Phase B provider failure → rev 1 intact
6. verifier failure → retry → `prose_ready`
7. retry failure → deterministic fallback
8. mismatch fail-safe terminal (14.2A) → rev-1 snapshot preserved
9. rev-1 persistence conflict → single terminal write
10. SSE transport failure mid-stream
11. duplicate request → one trip
12. explicit recovery of a stored rev 1 → 1 provider call, lease fenced

Plus the four-route parity matrix with both flags on and off, and a
restore/share/export assertion per scenario using the 14.5 resolver.

### 11.4 What must be proven end to end

- displayed content === persisted content === shared content, per scenario
- exactly one trip and one assistant turn per `responseId`, always
- write counts match the Stage 14.3 §8 table exactly
- `itineraryHash` is identical from `itinerary_ready` through share and export
- no forbidden field reaches any outbound surface, in any scenario
- zero provider calls on every refusal path
- flag-off runs produce byte-identical output to pre-Stage-14

### 11.5 Non-goals

No live provider calls (that remains 14.7 only), no rollout, no new product
surface. 14.6 adds tests and a harness, not behavior.

---

## 12. Product decisions still unresolved

1. **Does regenerate consume quota?** Recommendation: yes — it is a real Phase B
   call. Currently it passes through existing authenticated admission but is not
   separately metered.
2. **Should a pending-notes plan be shareable at all?** 14.5 assumes yes, clearly
   labeled. If product prefers "complete responses only", the share endpoint
   would need to refuse revision-1 trips outright.
3. **Does a pending revision 1 stop offering regenerate after some age?** No
   expiry is implemented; the action is offered indefinitely.
4. **Should anonymous users get durable early itineraries?** Still out of scope —
   requires a canonical plan slot on `AnonymousSession`.
5. **Rollout order for the two flags.** `TRAILIE_EARLY_ITINERARY_EVENTS` and
   `TRAILIE_PROSE_RECOVERY` are independent; recovery is only useful once early
   delivery is on, so enabling recovery first would be inert.

---

## Stop

Stage 14.5 complete. Both flags off, zero provider calls, no commits.
