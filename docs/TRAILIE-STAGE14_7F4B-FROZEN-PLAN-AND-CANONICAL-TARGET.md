# Stage 14.7F4B — Frozen-plan succession and canonical target enforcement

Deterministic correctness stage. Zero live provider calls, no Atlas, no production
flags, no commit/push. Spend: **$0.00**.

Closes D1–D4 diagnosed in
[Stage 14.7F4A](TRAILIE-STAGE14_7F4A-CANONICAL-SUCCESSION-ADVERSARIAL.md), which is
retained as the pre-fix record.

Evidence: `artifacts/trailie-stage14_7F4B-succession-enforcement.json`.

---

## 1. Decision protocol preserved (§1)

`accept` / `idempotent` / `stale` / `conflict` still ride on HTTP 200 with an
explicit decision in the body. Malformed write contracts (D2, D4) are bounded
4xx. The client rule now lives in one place —
`next-frontend/src/utils/persistenceDecision.js`:

```text
accept | idempotent | legacy_migration → success; reveal permitted
stale  | conflict                      → failure; nothing revealed
4xx validation                         → failure; nothing revealed
network failure                        → failure; nothing revealed
unrecognised outcome                   → fails CLOSED
```

The status code is never evidence of success on its own, and an outcome
disagreeing with the server's `success` flag fails closed.

---

## 2. Complete frozen-plan succession (§2, D1)

`server/src/utils/frozenSuccessionPlan.js`. The direction is inverted: the
successor starts from the **stored** revision-1 plan, so freezing is the default
and mutation the whitelisted exception. A plan field nobody has thought of yet is
frozen automatically.

**Allowed progression whitelist** — the only fields a revision-2 write may advance:

```text
responseRevision  previousRevision  lifecycleStatus  contentHash
proseReadyAt      reviewMeta        auditTrail
```

`responseRevision`, `lifecycleStatus` and `contentHash` are taken from the
**classified identity**, never from the request body. `itineraryReadyAt` is
deliberately excluded — it belongs to revision 1 and is carried forward frozen.

The same helper backs the composed-lifecycle harness, so client-side simulation
cannot drift from production succession.

---

## 3–4. Cases 13 and 12

Case 13 keeps **Policy B**: prose accepted, complete revision-1 plan retained,
`planPersistence.frozenPlanRetained: true` as bounded normalization metadata (no
rejected plan content echoed back). Case 12 keeps **conflict** on
`revision_itinerary_hash_changed` with zero mutation.

---

## 5–6. One canonical target, one changed turn (§5, §6, D2)

`resolveCanonicalWriteTarget` + `validateAssistantMutationScope` in
`validation/tripWriteContract.js`. Rejections:

| condition | code |
|---|---|
| plan names a response no assistant turn owns | `plan_message_identity_mismatch` |
| two assistant turns claim the target | `canonical_target_ambiguous` |
| plan carries `responseId` without `responseVersion` | `plan_identity_incomplete` |
| plan disagrees with its owning message | `plan_response_version_mismatch` / `_revision_` / `plan_itinerary_hash_mismatch` |
| an extra new or modified assistant turn | `unrelated_assistant_mutation` |

All under category `canonical_target_validation`, all bounded 4xx, all zero
mutation. Unchanged historical turns stay exempt via byte-equivalence, and a
legacy write with no canonical identity anywhere still takes the legacy branch.

**Note on "top-level" identity:** the wire format has no separate top-level
`responseId`. Top-level identity *is* the plan identity when a plan is present,
and the latest canonical assistant identity otherwise — so the three-way
agreement reduces to plan ≡ nested plus target uniqueness, which is what is
enforced.

---

## 7–8. Succession versus direct terminal (§7, §8, D3)

`decidePersistenceOutcome` now resolves revision semantics **before** treating a
higher version as ordinary:

```text
succession claim at a different version   → conflict expected_revision_but_none_stored
new version reusing the stored responseId → conflict response_id_version_reuse
version gap (> stored+1)                  → conflict version_jump
stored+1, new id, revision 2, no claim    → accept  direct_terminal
stored+1, new id, revision 1              → accept  newer_version
```

Direct terminal is preserved and now explicitly named. Revision 1 is **not**
universally mandatory: a flag-off terminal response, a legacy write with no
explicit revision, and an early-delivery failure before revision 1 was persisted
all still land through `direct_terminal`.

---

## 9. Plan ownership (§9, D4)

`validatePlanAgreement`'s `if (!owner) return pass()` is gone. A plan with no
matching canonical assistant is a bounded identity failure with zero mutation, so
a plan can never exist after an accepted write without its conversation turn.

---

## 10. Ordering (§10)

```
validate shape → resolve canonical target → verify plan/message agreement
  → detect unrelated assistant mutations → resolve stored state
    → classify (direct terminal | succession | stale | conflict)
      → complete frozen-plan policy [gated on resolution.revisionSuccession]
        → guarded atomic mutation
```

Structural and integration guards prove normalization cannot rescue an identity
mismatch, a future-version succession claim cannot become direct terminal, direct
terminal cannot claim a predecessor, and an unrelated assistant message never
reaches mutation.

---

## 11–12. Converted defect tests and re-run outcomes

All `test.failing` entries are gone; D1–D4 are ordinary passing regressions.

| case | http | decision | reason | v/r before → after | mutated |
|---|---|---|---|---|---|
| 12 | 200 | `conflict` | `revision_itinerary_hash_changed` | v4 r1 → v4 r1 | false |
| 13 | 200 | `accept` | `newer_revision` | v4 r1 → v4 r2 | true (prose + revision only) |
| 14 | 200 | `conflict` | `different_response_same_version` | v4 r1 → v4 r1 | false |
| 15a | 200 | `stale` | `older_version` | v4 r1 → v4 r1 | false |
| 15b | 200 | `conflict` | `expected_revision_but_none_stored` | v4 r1 → v4 r1 | false |
| 16 | **400** | `plan_message_identity_mismatch` | — | v4 r1 → v4 r1 | false |
| D2 | **400** | `unrelated_assistant_mutation` | — | v4 r1 → v4 r1 | false |
| direct terminal | 200 | `accept` | `direct_terminal` | v4 r1 → v5 r2 | true (new turn) |
| valid succession | 200 | `accept` | `newer_revision` | v4 r1 → v4 r2 | true |

---

## 13. Frozen-plan equality

```js
{
  allowedProgressionFields: [
    'responseRevision','previousRevision','lifecycleStatus','contentHash',
    'proseReadyAt','reviewMeta','auditTrail'
  ],
  immutableFieldsCompared: [
    'coordinates','days','difficulty','evidence','itineraryHash','parks',
    'planHash','provenance','responseId','responseVersion','stops',
    'totalDurationMinutes','type','warnings'
  ],
  immutableFieldsChanged: []
}
```

An incoming-only field (`smuggledUnknownField`, `feasibilityIssues` absent from
the stored plan) is dropped rather than merged in.

---

## 14–16. Frontend and route scenarios

17 persistence-decision tests lock the reveal rule. Both actual-route scenarios
(`basic-02-three-day`, `basic-03-seven-day`) are unchanged, now asserting the
whole counter object as one unit:

```js
{ persistenceHttpRequests: 2, acceptedWrites: 2, idempotentWrites: 0,
  staleWrites: 0, conflictWrites: 0, thirdWriteFromDone: 0 }
```

plus `phaseBReleasedBy === 'itinerary_revealed'`, the exact lifecycle journal,
persistence-before-reveal ordering, and zero external network attempts.

---

## 17. Test results

- Adversarial/enforcement suite: **57/57**, zero `test.failing`.
- New: `frozenSuccessionPlan` 12, `persistenceDecision` 17.
- Full server non-network suite: **1754 passed, 5 failed, 153 suites** — the same
  five pre-existing failures and three pre-existing JSX load failures. (1681 → 1754,
  +73 across F4A and F4B.)
- Frontend persistence/lifecycle/route suites: **all pass**, including
  `stage14_7fRouteProof` 36 and `stage14_7f3Succession` 31.
- Full frontend suite: 679 passed, 11 failed in four files unrelated to
  persistence (`Header`, `WeatherWidget`, `useParkExploreIndex`,
  `buildDayByDayPlanFollowUp`) — none import anything this stage changed; the
  `buildDayByDayPlanFollowUp` failure is expected-copy drift.

---

## 18. Readiness

```text
Case 12 conflict behavior:        passed
Complete case-13 freeze:          passed
Unknown-response conflict:        passed
Older-version stale:              passed
Future succession classification: passed
Direct-terminal compatibility:    passed
Plan/message identity agreement:  passed
Unrelated assistant isolation:    passed
Frontend reveal gating:           passed
Two-scenario route results:       unchanged
liveExecutionReady:               false
Spend:                            $0.00
```

### Remaining Stage 14.7F work

Duplicate delivery / idempotency completion, public and share projection
separation, interrupted-state testing, cleanup, composite preflight integration,
then live execution. None started.
