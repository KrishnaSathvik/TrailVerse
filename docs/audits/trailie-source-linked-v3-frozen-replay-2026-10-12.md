# Third evidence experiment: source-linked facts — 2026-10-12

**Decision: reject variant 3 and stop optimizing the 12 KB format.** It does not pass useful evidence coverage and complete safety/access preservation together. Review what the budget boundary controls before authorizing further implementation. No budget was increased and no fourth format was attempted.

Only an offline prototype, frozen replay, checks and this report were added. Runtime integration, commits, paid calls, Pass 2 and Pass 3 remain held. The recovery and broad-park eligibility-scope issues remain separate. Final provider-hardening live verification is still outstanding.

## Design tested

The representation explicitly separates three parts:

1. **Identity:** original evidence ID, canonical claim identity, source URL and source-time/conflict/qualifier metadata. Grouped supporting records keep individual identities; grouping never substitutes one canonical identity for another.
2. **Planning facts:** quoted source passages describing an experience. Quotes refer to the original source record, field and character offset in deterministically normalized text. No AI summaries or rewritten factual claims.
3. **Restrictions:** dedicated source access fields, structured flags and potentially restrictive narrative passages, attached to their identity. Existing exposure/constraint assessments and unknown opening status remain separate from the quoted restrictions.

Repeated quote text and metadata appear once with all supporting references. Exact named facility support can group with its unique corresponding record. Unlike the previous experiment, matching generic accessibility prose does not establish an alias group. Thus “Human History Museum” remains its own identity; shared prose can still be deduplicated. The museum patio remains distinct, and the two direct Weeping Rock records do not merge merely because their names match.

This is a fact-level experiment rather than a whole-document projection. Admission includes identity, **all extracted restrictions**, and the first planning passage when available. Additional planning passages are individually budgeted after the candidate-coverage pass. An oversized restriction bundle causes the candidate to be omitted, never silently truncated. The same request-driven candidate order, eight-entry ceiling and **12,000 serialized UTF-8 bytes** apply. Source tables, quoted prose, offsets, qualifiers and the decoding instructions all count against the budget.

Full raw source snapshots and the unchanged normalized records remain separately available in the offline evidence store. No compact record is supplied to the guard as authority. This does **not** claim that the existing normalized guard input suddenly contains previously lost source restrictions: it does not.

### Extraction boundaries and limitations

Dedicated location, season, accessibility, reservation, pets, age, duration, time-of-day and fee descriptions are mandatory in full. Body, long/short/listing/activity/audio descriptions are split at paragraph boundaries. A destination-independent, conservative lexical detector marks potentially restrictive paragraphs as mandatory; the first two non-heading planning paragraphs from the primary description are candidates for optional planning facts. Structured source flags are preserved verbatim, including their uncertainty: `isOpenToPublic` is not interpreted as “open on the travel date.”

This detector is experimental. “Every extracted restriction retained” cannot establish “every real restriction extracted.” Independent source-passage checks below expose that distinction. No destination names or park-specific selection branches occur in the projection or packing code. Destination names appear only in test fixtures and audit comparisons.

## Frozen inputs and method

Eight frozen Zion requests from the earlier comparison, including failed R02a/R02b and saved-but-thin R09a. The same saved corpus contains 19 thingstodo and 20 place records. The current final-hardening provider normalizes those plus eight existing curated facility records into 47 candidates. Providers are stubbed with the saved arrays; there are no network or model calls.

The raw corpus was assembled during the previous post-run audit, partly from cached snapshots and partly from then-refetched records. Original pre-read reserves were not captured live. Consequently these are controlled offline reconstructions, not byte-perfect reproductions of original provider traffic. The final provider-hardening code is exercised offline without removing its live-verification caveat.

## Results at 12 KB

| Request | Baseline entries | Variant 3 entries | Variant 3 bytes | Useful-coverage result |
|---|---:|---:|---:|---|
| R02a | 3 | 3 | 11,819 | Riverside, Pa'rus and unknown Big Bend; official museum lost. |
| R09a | 3 | 5 | 11,779 | Adds patio/facility support and museum alias, but loses the richer official museum record. |
| R02b | 3 | 5 | 11,779 | Same kinds of supporting additions; the missing official museum evidence is still unresolved. |
| R09b | 3 | 3 | 11,819 | Official museum displaced by unknown Big Bend. |
| R02c | 4 | 5 | 11,906 | Museum retained, but Pa'rus lost; adds seasonal Lava Point. |
| R09c | 3 | 3 | 11,819 | Official museum displaced by unknown Big Bend. |
| R02d | 4 | 3 | 11,819 | Museum records lost; unknown Big Bend fits instead. |
| R09d | 3 | 3 | 11,819 | Official museum lost; no additional distinct suitable primary outing established. |

Five requests fit three entries; three fit five. The five-entry results are not five distinct, open, traveler-compatible outings. A museum alias, lodge services and a patio can help a visit, but they do not replace all the practical detail in the official museum record. Lava Point's season remains a qualification, not evidence of an available October excursion.

In R02c an additional planning passage is genuinely deferred independently to admit another candidate; this confirms the packer operates at fact level. The resulting loss of Pa'rus and inclusion of a seasonal destination still fail the usefulness test. In the other requests extracted restriction bundles dominate enough that separately packing optional planning facts does not resolve coverage.

## Preservation and usefulness review

Fifteen independently chosen source-passage witnesses check both known audit failures and practical guidance beyond the original low-exposure shortlist. These are a small falsification set, not proof of universal extraction completeness.

**Thirteen of fifteen witness passages survive the full-pool projection**, including:

- Weeping Rock's explicit closure in `locationDescription`;
- Lava Point's May–September/weather qualification;
- Nature Center's summer operation;
- museum season, hours-check instruction, inaccessible connector, down-canyon shuttle direction, and patio landmarks;
- Riverside's winter/ice caveat and steepest access-survey grade;
- Pa'rus pet leash limit;
- lodge ranger-program information.

Two passages do not survive:

- **Restriction/conduct guidance:** the Footprints in Time source asks visitors to stay on designated trails, pack out what they bring, leave what they find and respect wildlife. The detector does not recognize this paragraph as mandatory, and planning selection omits it.
- **Useful experience content:** Diversion Dam's invitation to examine the shoreline for signs of development is omitted. The representation preserves history and other text but loses this concrete interpretive activity.

A further classification failure matters: stargazing's instruction to bring jackets and blankets is retained as **optional planning content**, not protected restriction/preparation information. It therefore survives this projection but is not protected against later planning-fact omission. An early draft omitted it entirely; the final non-heading passage selection retains it. The final result is not reported as a missing quote, but its unsafe optional classification still counts against completeness.

No regex patch was made to cherry-pick these failed witnesses into the mandatory set. Failing examples are retained in the acceptance artifact. Adding words for each observed miss would not prove completeness.

**Projection is not delivery.** A source passage can survive full-pool extraction yet remain unavailable in a selected 12 KB response. The per-request witness table records both. For example, museum body facts survive projection but the full official museum identity is delivered only in R02c. The patio supplement reaches R09a/R02b; that is useful supporting information, not delivery of the complete museum access picture.

**Quoted closure is not new guard enforcement.** Weeping Rock's old constraint label remains unchanged while the attached source quote says closed. A future integration would still need official restrictions represented in authoritative validation inputs. The prototype does not reinterpret “eligible” as permission to ignore access restrictions, nor pretend a model-facing warning fixes the existing normalization gap.

## Grounding and unchanged guard controls

The replay performs 15,248 assertions across the eight requests covering budgets, unmodified inputs, exact source-span provenance and unchanged constraint annotations. These are assertion counts, not independent test cases.

Nine focused mechanical scenarios pass:

- Every projected quote resolves to its underlying evidence identity and exact normalized source span.
- Fabricated quote text and tampered canonical references fail resolution.
- Patio/museum and trail/shuttle-stop identities remain distinguishable.
- Unknown opening status remains unknown.
- Every *extracted* restriction accompanies any admitted identity.
- A restriction larger than the allowance causes whole-candidate omission.
- Additional planning passages can be deferred independently of restrictions.

This establishes mechanical reference grounding. It does not establish that a live model understands this encoding or will choose useful activities.

For guard non-interference, the same previously accepted R09a itinerary was rebound to **each of the eight frozen contexts** and validated before and after projection. Results are identical: seven pass; R02b fails `stop_identity_unresolved` for the museum. These are controls, **not** replays of all eight original model proposals. Underlying evidence hashes remain unchanged; manipulated compact labels cannot grant authority because they are not passed to the guard. Seven key runtime fingerprints still match the prior audit.

R02a therefore continues to demonstrate the separate recovery issue: its existing evidence supports the control plan, regardless of the new representation's shortcomings.

## What the budget measurement establishes

As a diagnostic, project just the three primary official identities—Riverside, Pa'rus and museum—with no supplemental duplicates:

| Included content | Serialized bytes |
|---|---:|
| Identities, provenance, all extracted restrictions, first planning fact per activity | **13,933** |
| Same plus all selected planning facts | **14,081** |

This is measured cost for this format, not an information-theoretic minimum, not proof that no 12 KB solution could exist, and not a recommendation to replace the limit with 14 KB. Extraction completeness already fails independently. Nevertheless it is direct evidence that, in this conservative design, meaningful core coverage exceeds the current allowance even before adding another outing.

The investigation has now shown three distinct tradeoffs: compacting already-lossy records hides missing facts; restoring entire documents consumes the savings; selecting traceable passages can still miss qualifications and useful meaning while exceeding the allowance for core coverage.

## Combined acceptance decision

| Requirement | Result |
|---|---|
| No increase above 12 KB | Pass |
| Exact source-linked quotations and independent underlying records | Pass mechanically |
| Duplicate text sharing without canonical identity substitution | Pass on tested cases; generic alias merging deliberately avoided |
| No fabricated opening status or destination-specific selection logic | Pass in the prototype |
| More distinct useful coverage without losing core evidence | **Fail** |
| Complete safety/access preservation | **Fail**; witness omission and optional misclassification |
| Frozen guard control behavior unchanged | Pass for eight controlled rebindings |
| Better model planning or recovery | Unmeasured; no model calls |
| Overall | **Reject; stop format optimization** |

The next decision should review the **purpose and placement of the budget boundary**, separately from extraction correctness. The existing 12 KB provider-read gate counts materialized evidence, while the final model-context budget is a different gate. A boundary review should distinguish server-retained authoritative evidence, model-facing discovery facts and detailed source access, and measure total context/cost and safety obligations across those boundaries. Simply selecting a larger number would not cure the demonstrated extraction failures.

No paging, additional calls, larger allowance, new retrieval workflow or runtime change was implemented. This report does not authorize one. The user's stop condition is reached; further format tuning is held.

## Artifacts and reproduction

Run from the repository root, offline:

```sh
node artifacts/trailie-source-linked-v3-2026-10-12/replay.cjs
node artifacts/trailie-source-linked-v3-2026-10-12/verify.cjs
node artifacts/trailie-source-linked-v3-2026-10-12/invariants.cjs
```

- [Prototype](../../artifacts/trailie-source-linked-v3-2026-10-12/facts.cjs)
- [Per-request coverage and packing omissions](../../artifacts/trailie-source-linked-v3-2026-10-12/results.json)
- [Acceptance results, witnesses and guard controls](../../artifacts/trailie-source-linked-v3-2026-10-12/acceptance.json)
- [Mechanical invariants](../../artifacts/trailie-source-linked-v3-2026-10-12/invariants.json)
- [Complete passage-selection inventory](../../artifacts/trailie-source-linked-v3-2026-10-12/passage-inventory.json)
- [Boundary measurement](../../artifacts/trailie-source-linked-v3-2026-10-12/boundary-measurement.json)

These artifacts are local and gitignored. Full source data were reused from the preceding capture directory; neither they nor existing runtime files were modified.
