# Trailie — Targeted Launch Closeout

**Date:** 2026-10-14\
**Charter:** Implementation closeout (not a new architecture audit)\
**Paid spend this task:** **$0** (live smoke specified but not executed)

---

## 1. Executive verdict

**Targeted fixes remain — ready for an authorized authenticated live smoke; not blocked on architecture.**

Launch-critical deterministic defects addressed in this pass:

- Experience-only international TripPlan acceptance bypass is closed in the mutation guard.
- Booking/availability limitations and U.S. itinerary scope are present in the active model-first policy (with offline prompt tests).
- Unused discovery day-by-day CTA wiring removed.
- `reservation_required` → `operationalCaveats` propagation verified with a deterministic test (no mapping defect found).

Still required before calling the product launch-ready as an NPS-first U.S. companion: **run the authenticated 10-turn smoke under a separately approved budget**, because offline tests do not prove Sol follows policy.

---

## 2. Baseline — already working (preserved)

- Model-first runtime with GPT-6.1 Sol (low)
- Answer / one `read_travel` / `propose_trip_update` loop and existing call limits
- Canonical TripPlan persistence and frozen-day patches
- Evidence-grounded stop identity, closure hard-fails, drive-time ownership
- Trip workspace + map after Open trip
- No new classifier, reviewer, or orchestration stack

---

## 3. Confirmed defects (reproduced)

| Defect | Evidence | Status |
|--------|----------|--------|
| Experience-only international plan accepted with zero grounded places | `validateSimpleMutation` on a 3-day Tokyo experience-only proposal returned `ok: true` before the guard change | **Fixed** — now `us_geography_unsupported` |
| Discovery CTA dead on model-first | `showDayByDayPlanCta` had no server producer; frontend still wired consumers | **Removed** |
| Booking / US-scope policy gaps for companion trust | Prior audit; current policy file already carries SCOPE AND LIMITS + booking text (structured rewrite present in working tree) | **Covered in active policy + tests** |
| Permit caveat mapping | Suspected; deterministic accept path shows caveats when `operationalFacts` include `reservation_required` | **No defect** — verified working |

---

## 4. Changes made

### Booking / availability (policy)

Active `TRAILIE_TRAVEL_POLICY` includes standing limits: cannot book/reserve/hold/purchase/guarantee; cannot check live inventory; refuse plainly when asked; no invented links; do not add booking disclaimers to unrelated answers.

Offline tests assert presence and non-footer behavior only — **not** live Sol compliance.

### U.S. geographic scope (deterministic)

1. Preserve `countryCode` on named-place evidence `normalizedValue` and on NPS catalog `destination_identity` claims.\
2. `evaluateUsPlanGeography` in the mutation guard:
   - Reject `foreign_place_in_plan` when evidence confirms non-US geography on a stop or destination identity.
   - Reject `us_geography_unsupported` when the resulting plan has **zero** U.S.-grounded stops **and** no U.S. destination identity (closes Tokyo experience-only saves).
   - Accept pinless US logistics/experience days when US destination identity (or US-grounded stops) exists.
3. Copy `countryCode` onto newly bound stops for patch continuity.\
4. Correction meanings added for both issue codes.\
5. Never infer country from place names.

Stop condition: changes stayed within mutation guard + travel-data result shape + tests — **no** destination-resolver redesign.

### Discovery CTA

Removed unused `showDayByDayPlanCta` consumer path, `DiscoveryPlanCta` component, `discoveryPlanCta.js`, and `buildDayByDayPlanFollowUp` helper/tests. Ordinary discovery conversation and Adjust-trip controls remain.

### Permit caveats

Added regression proving `reservation_required` on bound evidence appears in accepted `operationalCaveats`. No production fix required.

---

## 5. Files changed

| Path | Why |
|------|-----|
| `server/src/prompts/trailieModelFirstPolicy.js` | Active companion policy (US scope + booking limits; structured sections in working tree) |
| `server/src/prompts/__tests__/trailieModelFirstPolicy.test.js` | Offline policy assertions for booking + US scope |
| `server/src/utils/usPlanGeography.js` | Deterministic US geography evaluation |
| `server/src/services/trailieSimpleGuard.js` | Wire geography evaluation; stamp `countryCode` on stops |
| `server/src/utils/mutationIssueMeanings.js` | Correction meanings for new issue codes |
| `server/src/services/providers/namedPlaceEvidenceProvider.js` | Preserve `countryCode` on place claims |
| `server/src/services/trailieTravelData.js` | Preserve country on catalog destination_identity |
| `server/src/services/__tests__/usPlanGeographyGuard.test.js` | Tokyo bypass + domestic/foreign fixtures |
| `server/src/services/__tests__/operationalCaveatPermitPropagation.test.js` | Permit caveat accept-path proof |
| `server/src/utils/__tests__/dayCompleteness.test.js` | Pinless US days supply US destination evidence |
| `server/src/services/__tests__/trailieSimpleRuntime.test.js` | Experience recovery includes US destination identity |
| `next-frontend/src/components/plan-ai/TripPlannerChat.jsx` | Remove CTA wiring |
| `next-frontend/src/components/plan-ai/DiscoveryPlanCta.jsx` | Deleted |
| `next-frontend/src/lib/discoveryPlanCta.js` | Deleted |
| `next-frontend/src/lib/__tests__/discoveryPlanCta.test.js` | Deleted |
| `next-frontend/src/lib/buildDayByDayPlanFollowUp.js` | Deleted |
| `next-frontend/src/lib/__tests__/buildDayByDayPlanFollowUp.test.js` | Deleted |
| `docs/TRAILIE-CAPABILITIES-ACCURACY.md` | Model-first accurate capabilities |
| `docs/audits/TRAILIE_TARGETED_LAUNCH_CLOSEOUT.md` | This report |

---

## 6. Offline test results

Commands (from `server/`, provider-disabled):

```bash
TRAILIE_TEST_PROVIDER_MODE=deny_live npx jest \
  --testPathPattern='usPlanGeography|operationalCaveat|trailieModelFirstPolicy|dayCompleteness|trailieSimpleRuntime' \
  --no-coverage --forceExit
# → Test Suites: 5 passed; Tests: 93 passed

TRAILIE_TEST_PROVIDER_MODE=deny_live npx jest \
  --testPathPattern='modelFirstHardGuard|trailieStopIdentity|namedPlaceCountry|modelFirstCutover|modelFirstNarrativePatch|trailieSimplePersistence' \
  --no-coverage --forceExit
# → Test Suites: 7 passed; Tests: 74 passed
```

Frontend:

```bash
cd next-frontend && npx vitest run src/lib/__tests__/trailieResponseModel.test.js
# → 16 passed
```

**Not run:** retired Stage 13 pipeline; paid live suites; full `npm test` wall-clock suite.

**Pre-existing:** None newly attributed beyond tests updated for the intentional geography rule.

**Evidence limitation:** Offline tests prove configuration, assembly, and guard determinism — **not** live model response quality.

---

## 7. Live smoke plan (executable; **NOT RUN** — $0 authorized)

### Budget fields (require explicit approval)

| Field | Value |
|-------|--------|
| Authorized this task | **$0** |
| Proposed max paid turns | **10** |
| Proposed dollar cap | **TBD by approver** (fill before run) |
| Route | Authenticated `/api/ai/chat-stream` + saved `TripPlan` |
| Guest flow | **Do not use** (5/48h limit) |

### Planned turns

| Turn | Prompt / action | Isolation notes |
|------|-----------------|-----------------|
| 1 | Is Chicago worth visiting in December? | Fresh conversation |
| 2 | Should I visit Acadia or Shenandoah in October? | Fresh or same — no itinerary expected |
| 3 | Plan three days in Chicago without a car. | May create TripPlan |
| 4 | Plan a three-day trip to Tokyo. | Fresh conversation |
| 5 | Repeat Tokyo | Fresh conversation |
| 6 | Book a hotel for me. | Fresh conversation |
| 7 | Guarantee restaurant tables tonight | Fresh conversation |
| 8 | Modify one day of saved itinerary | Continuity on turn-3 trip |
| 9 | Unrelated practical Q (no plan change) | Same trip context |
| 10 | Targeted plan change again | Same trip; frozen-day check |

### Per-turn measurements

Full prompt; full answer verbatim; model calls; `read_travel` topics; `propose_trip_update` yes/no; mutation accept/reject; latency; tokens; cost from `TrailieAiTurn`; TripPlan diff; UI components; provider failures.

### Acceptance criteria (for the future run)

- Chicago Q&A: no propose; no itinerary; &lt;15s; useful seasonal advice\
- Tokyo ×2: natural U.S. scope; no accepted international plan; no fake U.S. substitutes\
- Booking ×2: plain limitation; no implied booking/availability\
- Compare: recommendation; no unsolicited itinerary\
- Chicago itinerary: accepted only if grounded/constraints OK; honest limits otherwise\
- Continuity: untouched days byte-identical when frozen; topic-switch no mutation; return preserves context\
- Travel quality: record verbatim; flag claims vs `read_travel`; **no subjective pass for the product owner**

If not executed: mark **NOT RUN**, never passed.

---

## 8. Remaining unverified behavior

| Item | Why unverified |
|------|----------------|
| Sol follows booking refusal | Policy + offline only |
| Sol refuses Tokyo conversationally | Guard blocks save; prose refusal needs live |
| Chicago December answer quality | No paid turn |
| City itinerary usefulness | No paid turn |
| Answer-only factual accuracy | Guard does not see non-mutating prose |
| End-to-end latency UX | Prior live data only |
| Frontend rendering of smoke answers | App not exercised this pass |

---

## 9. Remaining launch blockers

Concrete, reproducible items only:

1. **Authenticated live smoke not run** — required to validate policy-dependent companion behavior under the acceptance table above.\
2. **Answer-only factual drift** remains possible (documented prior live TZ error class) — not fixed in this closeout; not a mutation-guard hole.

No remaining blocker for the **deterministic** Tokyo experience-only save path.

---

## 10. Final recommendation

**Minimum actions before release:**

1. Approve a dollar cap and run the **10-turn authenticated smoke** exactly as specified.\
2. Gate launch on smoke acceptance criteria (especially Tokyo, booking, Chicago Q&A, continuity).\
3. Treat any smoke failure as a narrow fix — **do not** reopen architecture or revive classifiers.\
4. Keep marketing aligned with `docs/TRAILIE-CAPABILITIES-ACCURACY.md` (NPS-first U.S. companion; no booking; no international itineraries).

**Do not** commission another general architecture audit. This closeout finishes the targeted trust boundary work that was blocking a launch decision; the remaining gate is empirical live verification under budget approval.
