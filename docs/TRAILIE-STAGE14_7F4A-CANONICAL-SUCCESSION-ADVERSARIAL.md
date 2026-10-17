# Stage 14.7F4A — Canonical succession adversarial proof

Deterministic verification only. Zero live provider calls, no Atlas connection, no
production flags, no commit/push. Spend: **$0.00**.

Harness: `server/src/routes/__tests__/canonicalSuccessionAdversarial.test.js` —
real `PUT /api/trips/:tripId` behind the real `protect` middleware and the real
error handler, one isolated trip per case, state read straight from the
collection (never the API echo).

Raw report objects: `artifacts/trailie-stage14_7F4A-succession-adversarial.json`.

---

## 1. Cases 12–15, separated

| case | http | decision | reason | v/r before → after | mutated |
|------|------|----------|--------|--------------------|---------|
| 12 — changed itinerary hash | 200 | `conflict` | `revision_itinerary_hash_changed` | v4 r1 → v4 r1 | **false** |
| 13 — changed canonical plan | 200 | `accept` | `newer_revision` | v4 r1 → v4 r2 | true |
| 14 — unknown `responseId` | 200 | `conflict` | `different_response_same_version` | v4 r1 → v4 r1 | **false** |
| 15a — version N−1 | 200 | `stale` | `older_version` | v4 r1 → v4 r1 | **false** |
| 15b — version N+1 | 200 | `accept` | `newer_version` | v4 r1 → **v5 r2** | **true** |
| 16 — plan vs nested identity | 200 | `accept` | `newer_revision` | v4 r1 → v4 r2 | **true** |
| valid succession | 200 | `accept` | `newer_revision` | v4 r1 → v4 r2 | true |

Stored response id is `resp-canonical-A` before **and after** in every case — no
case substituted an identity.

---

## 2. Case 12 — **Policy A (bounded rejection)**

`decidePersistenceOutcome` rejects before the freeze policy is reachable:
`incoming.itineraryHash !== existing.itineraryHash` → `CONFLICT`. Proven:

- zero mutation across the whole canonical unit
- `itineraryHash` and `days` byte-identical
- the revision-1 shell still carries `content: ''` at revision 1
- neither the mutated hash nor the injected day survives anywhere

**Open point:** the rejection is delivered as HTTP **200** with `success: false`
and a bounded `planPersistence.outcome`, not a 4xx. A rejected canonical write
issues no DB write and returns the stored trip, so the semantics are correct and
bounded; only the status code differs from what §2 specifies.

---

## 3. Case 13 — **Policy B (freeze), and the freeze is incomplete** — DEFECT D1

The prose revision is accepted and `days` + `itineraryHash` are byte-identical.
Everything else is not. `tripController.updateTrip` carries over exactly two
fields:

```js
updateData.plan = { ...updateData.plan, days: trip.plan.days, itineraryHash: trip.plan.itineraryHash };
```

`plan` is `Schema.Types.Mixed`, so every other canonical field is taken verbatim
from the incoming write. Measured drift with a byte-correct `itineraryHash`:

```
stops  coordinates  provenance  warnings  totalDurationMinutes
difficulty  parks  evidence  planHash
```

All nine took the injected values (`INJECTED-STOP`, `INJECTED PARK`,
`plan-hash-MUTATED`, …). §3 requires the *complete* stored plan to be
byte-equivalent to revision 1; it is not. **§3 is not satisfied.**

---

## 4. Case 14 — unknown `responseId`: correctly rejected

The repository has no `unknown_response` category;
`different_response_same_version` is its established equivalent — an id that does
not own the version slot. Proven:

- no assistant message changes; the shell still holds `content: ''`
- no plan change, no revision advance, no id substitution
- the unknown response's prose appears nowhere in stored state
- no new assistant turn appended (exactly one assistant message after)
- **not** classified idempotent
- `revisionSuccession === false` — the freeze policy never ran

Same open point as case 12: bounded, but delivered as 200 rather than 4xx.

### 4b. Related weakness — DEFECT D2

A write naming a **valid** target that also carries an extra assistant message
under an unrelated `responseId` has that extra turn persisted.
`mergeTerminalRevisionIntoConversation` collapses duplicates of the *target* id
only; the conversation array is otherwise written wholesale, and no rule requires
every assistant message in the array to belong to a known response.

---

## 5. Case 15 — wrong `responseVersion`

**15a (N−1): correct.** `stale` / `older_version`, zero mutation, stored version
stays N, revision stays 1, prose stays empty, `revisionSuccession === false`.

**15b (N+1): DEFECT D3 — accepted, not conflicted.** `decidePersistenceOutcome`
consults `expectedPreviousRevision` **only inside the same-version branch**. A
revision-2 write naming version N+1 while asserting `expectedPreviousRevision: 1`
falls through to the version branch, where — with no `expectedPreviousVersion` to
constrain it — it is accepted as `newer_version`.

Consequence: the write consumes a new turn slot (v4 → v5), advances the revision
to 2, and **destroys the revision-1 itinerary checkpoint of turn 4**, despite the
client explicitly claiming to succeed revision 1 of turn 4. §5 requires a bounded
conflict with zero mutation. **§5 is not satisfied for the future-version case.**

---

## 6. Identity-validation order

Required order holds structurally and behaviourally:

```
validateTripWriteCandidate            (write shape)
  → resolveCanonicalResponsePersistence (identity + version resolution, classification)
    → mergeTerminalRevisionIntoConversation / plan freeze  [gated on resolution.revisionSuccession]
      → findByIdAndUpdate               (guarded mutation)
```

Structural guards assert the source order and that the freeze is reachable only
through `if (resolution.revisionSuccession && updateData.conversation)`, plus that
a rejected classification strips every response-coupled field before the write.

Integration guard: a revision-2 write with an unknown `responseId`, or with an
older `responseVersion`, carrying a **byte-identical** itinerary — the strongest
invitation for normalization to rescue it — is still rejected with zero mutation
and `revisionSuccession === false`. Itinerary normalization cannot convert an
invalid target into a valid one.

The gap in 15b is *not* an ordering failure: classification runs first and
returns `accept`. The defect is in the classification rule itself.

---

## 7. Case 16 — top-level vs nested identity — DEFECT D4

Plan names `resp-canonical-A`; the conversation's terminal assistant message names
`resp-nested-other`. The write is **accepted**.

`extractIncomingResponseIdentity` reads the plan first and only falls back to the
conversation. `validatePlanAgreement` cross-checks the plan against its owning
message, but when no incoming message carries the plan's `responseId` it finds no
owner and returns `pass()` — the disagreement is never detected. The merge then
finds no incoming message for `resp-canonical-A` and returns the conversation
untouched.

Result: the stored revision-1 shell for `resp-canonical-A` is replaced by prose
carrying a different id, leaving `plan.responseId === resp-canonical-A` with **no
conversation message for that response at all**. The canonical unit is split
across two identities. §7 requires bounded rejection with zero mutation.
**§7 is not satisfied.**

---

## 8. Valid succession regression — passes

Known id, correct version, revision 1 → 2, same message slot (`id: 1001`
preserved), same plan, same `itineraryHash`, prose persisted,
`revisionSuccession: true`, `accept` / `newer_revision`.

---

## 9. Test results

- Adversarial suite: **40/40 pass**. The six defect proofs are `test.failing`, so
  they pass by failing and will trip the moment behavior changes.
- Focused: `routeReplayCanonicalEquality` 23, `trailieRouteContract` 8,
  `toolFirstIntegration` 2 (both deterministic route scenarios), `tripWriteContract`
  36, `writeValidationStructure` 12, `tripController` 16, `canonicalPersistence` 23,
  `tripPlanRevisionOneShell` 18, `persistenceOwnership` 20, `proseRecoveryRoute` 33,
  `evalPersistenceGuard` 20 — all pass.
- Full server non-network suite: **1721 passed, 5 failed, 152 suites**.
  Baseline preserved — the same five pre-existing failures (`npsParkAdapter`,
  `astroFacts`, `trailieFetchPlanner`, `parkChatImages`, `npsParkConditions`) and
  the same three pre-existing load failures (`tests/integration/auth`,
  `tests/integration/parks`, `tests/blogController` — the JSX email-template
  import). Passing count rose 1681 → 1721 (+40, this stage).
- Frontend persistence suites: **177/177 pass** across 8 files, including
  `stage14_7f3Succession`.

---

## 10. Readiness

```text
Write validation:                passed
Historical compatibility:        passed
Create/update parity:            passed
Case 12 policy:                  Policy A (bounded rejection) — proven, 200 not 4xx
Case 13 policy:                  Policy B (freeze) — INCOMPLETE (D1)
Case 14 unknown-response:        passed (200 not 4xx)
Case 15a stale:                  passed
Case 15b future version:         FAILED — accepted, mutates state (D3)
Case 16 identity mismatch:       FAILED — accepted, mutates state (D4)
Identity-validation ordering:    passed
Valid succession regression:     passed
liveExecutionReady:              false
Spend:                           $0.00
```

Stopping here. No duplicate/idempotency work, no public/share projection
separation, no interrupted-state tests, no cleanup, no composite preflight
integration, no live execution.
