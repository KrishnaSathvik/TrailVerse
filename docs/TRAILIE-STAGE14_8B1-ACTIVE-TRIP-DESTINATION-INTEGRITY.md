# Stage 14.8B.1 — Active-trip destination integrity repair

Deterministic, zero-provider-call repair stage. No guest message 3, no repeat of
guest message 2, no live provider call, no login, no Atlas, no deploy, no
production flags, no commit, no push.

## 1. Preserved failure

Stage 14.8B artifacts are unchanged and its result remains
`FAIL_PLAN_CONSISTENCY`:

```js
{
  testId: "stage14_8B-guest-followup",
  historicalResult: "FAIL_PLAN_CONSISTENCY",
  defectClass: "active_trip_destination_drift",
  itineraryDestinationCorrect: true,
  itineraryParkCode: "yose",
  activeTripDestinationBefore: "Yosemite",
  activeTripDestinationAfter: "Total",
  lockedPlanDestinationAfter: "Total",
  providerRerunRequired: false
}
```

## 2. Root cause

Three independent weaknesses had to line up:

```text
assistant answer 1 bullet:  "- Total: roughly $450-650"
  → the numbered/bulleted regex captured "Total" (it stops at the colon)
  → nothing rejected it, so a summary label became a selectable destination

follow-up:  "...for that day..."
  → the gate /\b(option|one|choice|that|those|yes)\b/ matched the bare "that"
  → a modifier pronoun was read as destination-selection intent

follow-up:  "...the total walking..."
  → lower.includes("total") matched the fake option
  → destination renamed with confidence "high"

result: { name: "Total", parkCode: "yose" }   ← a MIXED identity
```

The park code stayed `yose`, which is what makes the canonical invariant in §4
below such a strong guard: the two halves of the identity disagreed, and
nothing checked that.

## 3. Offered-option filtering (§5)

`extractRecommendationListFromMessages` now passes every candidate through
`isEligibleDestinationOption`, and the bullet regex captures whether the label
was followed by a colon.

Rejected: a `Label: value` bullet of ≤4 words; any name in the generic label set
(`total`, `budget`, `cost`, `walking`, `day`, `lodging`, `at a glance`,
`don't forget`, `estimated costs`, …); indexed labels (`Day 2`, `Option 3`); bare
single words with no destination evidence; and prose sentences — more than six
words, or containing connectives (`if`, `for`, `with`, `provided`, …), which is
what excludes packing-list lines such as
`Bear-proof food storage if you're picnicking outdoors`.

Accepted: anything with a park code, anything carrying a destination suffix
(`National Park`, `National Monument`, `State Park`, …), and short proper-noun
phrases such as `Sedona red rock country` — a real destination with no NPS code,
whose Stage 13 behavior is preserved by regression test.

## 4. Destination-change intent (§4)

`classifyDestinationChangeIntent` replaces the bare pronoun gate. It binds each
demonstrative and ordinal to the noun that follows it:

| phrase | bound noun | intent |
|---|---|---|
| `for that day` | `day` | no — modifier |
| `make the second day more relaxed` | `day` | no — modifier |
| `keep that under 2 miles` | *(none)* | no |
| `what about the second one?` | `one` | yes — ordinal selection |
| `let's choose the second park instead` | `park` | yes |
| `let's go with that park` | `park` | yes |
| `switch the trip to Zion` | — | yes — explicit |

A bare ordinal bound to a *destination* noun ("the second one") remains a valid
selection; the modifier check runs first, so "the second day" can never reopen
the hole.

## 5. Canonical park identity (§6)

`resolveDestinationMutation` is the single decision point. If a candidate
asserts a park code, its name must canonicalize to that code; and a candidate
with no code may not inherit the previous park's code unless it canonicalizes to
it. `{ name: "Total", parkCode: "yose" }` is therefore unrepresentable.

Guard order is intent → eligibility → canonicality, so the diagnostic names the
real reason rather than a property of a candidate that should never have been
considered.

## 6. Locked-plan protection (§7)

A locked destination survives any request whose intent is not a destination
change. Requests modifying day, walking distance, pace, stop, lodging or
activity preserve it. On every rejection the previous destination is returned
whole — nothing half-applies.

## 7. Diagnostics (§8)

Every decision emits bounded metadata: `previousDestination`,
`candidateDestination`, `candidateSource`, `candidateEntityType`,
`destinationChangeIntent`, `candidateCanonicalizationResult`,
`mutationAccepted`, `rejectionReason` from the closed set
`not_destination_intent | non_destination_option | canonical_identity_mismatch |
generic_token | locked_destination_preserved`. Names and decisions only — a test
asserts no conversation text leaks in.

## 8. Cross-field consistency (§11)

`assertDestinationIdentityConsistent` fails closed on any disagreement between
name↔parkCode, primary↔locked, or itinerary↔active, rather than picking a field.

## 9. Session repair (§9)

`server/scripts/stage14_8b1-recompute-active-context.js` replays the repaired
resolver over the two preserved completed turns. The corrupted value is never
hand-edited.

```text
turn 1  explicit_message        → Yosemite / yose
turn 2  locked_plan_refinement  → Yosemite / yose
        destinationMutation: mutationAccepted false, not_destination_intent
```

Verified by direct database reads: session state byte-identical before and
after, message SHA-256 hashes unchanged, zero messages added, zero turns added,
quota still 2 completed / 3 remaining, zero provider calls.

## 10. SSE tee (§12)

The shared tee is now a normal exported function, `installSseTee()`. Playwright
serializes it into the page and the tests import and run the *same* function —
so the extraction bug (literal `\n` escapes, which made it split on the
two-character sequence backslash-n and parse zero events while still reporting
`responses: 1, closed: true`) cannot recur. Eight tests cover the full
lifecycle, chunk-boundary independence at sizes 1/7/512, malformed-frame
tolerance, and non-SSE passthrough.

## 11. Files

| file | role |
|---|---|
| `server/src/services/destinationIntegrity.js` | eligibility, intent, canonicality, diagnostics |
| `server/src/services/activeTripContextService.js` | wired to the guards |
| `server/scripts/stage14_8b1-recompute-active-context.js` | §9 session repair |
| `next-frontend/scripts/stage14_8a-sse-tee.js` | repaired, exported tee |

## 12. Evidence

| suite | tests |
|---|---|
| `destinationIntegrity.test.js` | 62 |
| `stage14_8bDestinationReplay.test.js` | 22 |
| `activeTripContextService.test.js` | 17 (unchanged, all green) |
| `stage14AcceptanceSseTee.test.js` | 8 |
| context repair script | 7/7 checks |

Artifacts: `artifacts/stage14_8B1-context-repair/context-repair.json` and
`anonymousSession.repaired.json` (the derived restore state for message 3).
