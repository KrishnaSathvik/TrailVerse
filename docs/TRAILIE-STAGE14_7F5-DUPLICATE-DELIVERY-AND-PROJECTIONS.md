# Stage 14.7F5 — Duplicate delivery, progression-field ownership, projection boundaries

Deterministic, zero-cost. No live provider calls, no Atlas, no global production
flags, no commit/push. Spend: **$0.00**.

Artifacts:
`artifacts/trailie-stage14_7F5-duplicate-delivery.json`,
`artifacts/trailie-stage14_7F5-shared-cache-policy.json`.

---

## 1. Frontend unrelated-failure classification → `pre_existing_on_branch_baseline`

A detached worktree at branch HEAD (`0b82c8e`) ran the four suites twice; the
working tree ran them twice. All four runs: **11 failed / 9 passed (20)** across
4 files, with an **identical** set of failing test names and identical
expected/received values.

| suite | failing | cause |
|---|---|---|
| `Header.test.jsx` | 7 | `vi.mock('../ThemeSwitcher')` lacks a `SegmentedThemeSkeleton` export |
| `useParkExploreIndex.test.js` | 2 | spy called with different arguments than asserted |
| `WeatherWidget.test.jsx` | 1 | `[data-testid="loader-icon"]` not found |
| `buildDayByDayPlanFollowUp.test.js` | 1 | copy drift: `'top pick'` vs asserted `'top recommendation'` |

Reproducible on both trees over two runs each — not load-dependent, not a
current-tree regression. Worktree removed.

---

## 2. Lifecycle progression-field ownership

`buildFrozenSuccessionPlan` no longer copies any whitelisted field blindly.

| field | authoritative source | enforcement |
|---|---|---|
| `responseRevision` | classified persistence decision | from `resolvedIdentity`; body ignored |
| `lifecycleStatus` | classified terminal lifecycle | from `resolvedIdentity`; body ignored |
| `contentHash` | server-validated canonical content | from `resolvedIdentity`; body ignored |
| `previousRevision` | classified succession | derived from `storedPlan.responseRevision` |
| `proseReadyAt` | server timestamp | write-once, forward-only, must not predate `itineraryReadyAt`, junk refused |
| `reviewMeta` | server-owned | write-once, never overwritten, shape-allowlisted |
| `auditTrail` | server-owned | append-only; reorder/truncate/replace rejected, shape-allowlisted |

`reviewMeta` and `auditTrail` cannot be authenticated as server-produced under
client-initiated persistence, so the policy is conservative: they may be
populated once (revision 1 never carries them) and never overwritten. Unknown
lifecycle metadata is dropped, incoming-only immutable fields stay dropped, and
injected `leaseToken` / `evaluationRunId` / `reviewerPrompt` / `providerRequest`
are stripped even when nested.

---

## 3–4. Duplicate revision 1 and revision 2

```text
duplicate CREATE   201 → 200 idempotent, 1 trip, byte-equivalent
duplicate rev-1 PUT     idempotent / identical_write
duplicate rev-2 PUT     accept → idempotent, byte-equivalent
```

Proven for both: one trip, one plan, one assistant turn, same numeric id, same
timestamp, same `responseId` / `responseVersion` / `itineraryHash`, no extra
accepted write. Revision 2 additionally: same slot, one prose body, same frozen
plan, same content hash, and `proseReadyAt` is never restamped on replay.

---

## 5. `done` replay

| case | result |
|---|---|
| matching `done` | `idempotent`, zero mutation |
| duplicate matching `done` ×3 | `['idempotent','idempotent','idempotent']`, zero mutation |
| `done` before revision 2 persisted | `accept` / `newer_revision` — one write, one turn; its replay is `idempotent` |
| mismatched `done` | `conflict` / `same_version_different_hash`, stored prose untouched |

No `done` case produces a third ordinary canonical write after revision 2.

---

## 6. Out-of-order delivery

Stale revision 1 after revision 2 → `stale` / `older_revision`, no rollback.
A write for a different `responseId` → rejected, no cross-response mutation.
Five repeated identical writes → `idempotent` every time; the decision never
oscillates and state stays byte-equivalent. Client-side duplicate/ordering
suppression remains covered by the 73 existing lifecycle reducer tests.

---

## 7. Owner projection

`GET /api/trips/:tripId` now returns `projectOwnerTrip(...)` — subtractive, since
an owner legitimately needs identity and lifecycle to restore. Removed at any
nesting depth: reviewer prompts and rejected drafts, provider request/response
payloads, recovery/queue leases and fencing tokens, evaluation metadata,
persistence decisions and reducer/lifecycle machinery, instrumentation and
network-guard diagnostics.

Retained: `responseId`, `responseVersion`, `responseRevision`, `itineraryHash`,
`contentHash`, `lifecycleStatus`, plan content, conversation. Revision-1 and
revision-2 rendering through the real presentation resolver is unchanged
(`itinerary_only` / `prose_complete`).

**Bug found and fixed in this stage:** the first implementation recursed into any
`typeof 'object'` value, so `Date` and `ObjectId` were rebuilt from
`Object.entries` and became `{}`. That destroyed message timestamps and broke 13
succession tests. Recursion is now restricted to plain objects, with a dedicated
regression test.

---

## 8–9. Shared and export projections — now **allowlists**

Both were denylists, which meant any newly added internal plan field became
public automatically. `PUBLIC_PLAN_FIELDS` (server `utils/planProjection.js`,
mirrored in the export builder) is now the whole contract:

```text
type version generatedAt createdFrom parkName parkCode
days totalDays highlights packingList permits estimatedCost feasibilityIssues
```

Revision 1 shares keep the itinerary, publish no empty prose bubble, and report
`notesStatus: not_available`. Revision 2 exposes prose at
`plan_plus_explanation` and **never** at `plan_only`; one assistant turn, no
duplicates. Scope semantics are unchanged. Export keeps the bounded
"trip notes were not generated" label at revision 1 and no blank notes section.

---

## 10. Shared-route cache policy (evidence only — unchanged)

```js
{
  route: 'GET /api/trips/shared/:shareId',
  controller: 'server/src/routes/trips.js — inline handler, before router.use(protect)',
  cacheControl: null,          // the application sets NONE
  vary: null,
  etag: 'W/"..."',             // Express default weak ETag
  etagRevalidationStatus: 304,
  etagChangesAcrossRevisions: true,
  surrogateControl: null, pragma: null, expires: null
}
```

No middleware or hosting configuration adds caching for this route (the only
cache headers in `app.js` are on `/uploads`). **Stale risk:** with no
`Cache-Control`, an intermediary that caches a 200 heuristically may keep serving
the revision-1 body after revision 2 lands. The ETag does change per revision, so
a *revalidating* cache is safe; a heuristically-caching one is not.

**Recommendation for canary planning:** set `Cache-Control: no-store` on this
route. The payload is per-share, cheap, and mutates mid-turn, and no tested
bounded revalidation design exists today.

---

## 11. Projection differential

One contaminated fixture (19 internal markers plus an invented-next-quarter
field) through owner, shared `plan_only`, shared `full_conversation`, public plan
and export. Every public surface: **zero leaks**, and
`Object.keys(plan)` minus `PUBLIC_PLAN_FIELDS` is empty. The unknown field is
omitted from every public surface without anyone naming it — the property a
denylist cannot provide.

---

## 12. Route scenarios — normal and replay

Both scenarios, fresh child each, unchanged:

```js
{ persistenceHttpRequests: 2, acceptedWrites: 2, idempotentWrites: 0,
  staleWrites: 0, conflictWrites: 0, thirdWriteFromDone: 0 }
```

plus `phaseBReleasedBy: 'itinerary_revealed'` and zero external network attempts.

Replay variant (identical for both scenarios):

```js
{ duplicateRevision1Decision: 'stale',
  duplicateRevision2Decision: 'idempotent',
  duplicateDonePersistenceRequests: 1,
  assistantTurnCount: 1, planCount: 1, cardMountCount: 1 }
```

`stale` is the correct classification here, not a miss: this replay arrives after
the turn already reached revision 2, so it describes a superseded checkpoint. The
at-revision-1 duplicate — the case §3 names — is proven `idempotent` in
`duplicateDeliveryIdempotency.test.js`, where stored state is still revision 1.
No replay is counted as an accepted write, and stored plan and conversation are
byte-equivalent after all three.

---

## 13. Test results

- New: `duplicateDeliveryIdempotency` 13, `projectionBoundaries` 16,
  `sharedCachePolicy` 4; `frozenSuccessionPlan` 12 → 22.
- Route proof 36 → 44 (replay variants); `stage14_7f3Succession` 31;
  `buildTripExportPayload` 16 → 17; `persistenceDecision` 17.
- Full server non-network suite: **1797 passed, 5 failed, 156 suites** — the
  known five pre-existing failures, unchanged.
- Full frontend suite: **688 passed, 11 failed** — exactly the four
  baseline-classified files from §1, nothing else.

---

## 14. Remaining work

Interrupted-state matrix, cleanup safety, composite preflight integration, canary
planning, live execution. None started.

## Readiness

```text
Canonical persistence policy:      passed
Complete frozen-plan succession:   passed
Progression-field ownership:       passed
Duplicate delivery:                passed
Out-of-order delivery:             passed
Owner projection:                  passed
Shared/export projection:          passed (allowlisted)
Projection differential:           passed
Frontend baseline failures:        classified pre_existing_on_branch_baseline
Shared cache policy:               BLOCKED — no explicit policy; no-store recommended
Interrupted-state matrix:          not started
Cleanup safety:                    not started
Composite live readiness:          false
Spend:                             $0.00
```
