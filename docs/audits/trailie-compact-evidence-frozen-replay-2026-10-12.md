# Compact evidence design and frozen replay — 2026-10-12

**Decision: HOLD runtime integration and live comparison.** The offline prototype demonstrates substantial envelope savings, but neither tested representation passes the combined safety-information and useful-coverage gate. This is a failed acceptance gate, not a shipped repair or evidence of improved itineraries.

No application/runtime files, prompts, ranking weights, budget constants, guards, or planning policy changed. No model/provider network calls, persistence, commits, Pass 2, or Pass 3 work occurred. Prototype scripts and generated results live under the ignored artifacts directory. Existing uncommitted repairs remain untouched.

## What was tested

Eight frozen Zion requests from the preceding live comparison, including failed R02a/R02b and saved-but-thin R09a. The raw input is the same saved 19-thingstodo + 20-place corpus used by the [coverage audit](trailie-zion-evidence-coverage-2026-10-12.md). It was assembled after the original runs, partly from cached snapshots and partly from then-refetched records. These are reproducible reconstructions, not newly discovered original pre-read logs.

The actual **final provider-hardening implementation** normalizes that corpus offline into 47 records, including eight curated facility records. Its current extractor version is retained. The actual reader and ranker supply the baseline and ordering. The prototype changes only the offline projection and grouping. Each proposed response must fit **12,000 serialized UTF-8 bytes**, including its text dictionary, provenance tables and explanatory envelope. The eight-entry ceiling remains, with a grouped set of supporting records occupying one entry; this is explicitly a change in representation, not eight newly certified outings.

Baseline bytes below count the serialized array precisely. The earlier audit's reader accounting is one byte higher because it budgets a trailing comma per record.

## Representation contract explored

- Retain canonical identities and evidence IDs, source URLs, observation/expiration timestamps, conflict markers and static-suitability qualifiers. Refer repeated metadata and text through shared tables.
- Preserve each member's existing constraint-assessment status and reason codes. Never select the most permissive label from a group or infer opening from low exposure.
- Keep the full authoritative records separately for identity resolution and validation. A compact label never grants save authority or substitutes for its source.
- Group exact named facility supplements with their unique matching record. Identical supplemental claims can share a group while retaining their individual identities and names. The museum patio remains separate; the museum body can still describe it as part of the visit.
- Do not merge two direct NPS records just because they have the same name: the Weeping Rock trail and shuttle-stop record remain distinct.
- Do not rank attractions, prescribe day roles, create itineraries or fill thin days. Existing request-driven ordering remains unchanged.
- Strip HTML presentation while retaining link destinations and complete prose. Reuse exact text and exact substrings. No generated summaries, keyword-based safety selection, arbitrary sentence clipping or invented seasonal status.

This is a prototype contract, not a production schema. In particular, identical generic facility text is not sufficient proof of canonical equivalence outside these fixtures; grouping must not become an identity rewrite. Expanding the text dictionary into repeated prose before sending it would also invalidate these byte measurements. Model comprehension of indexed text has not been tested.

## Comparison

Two variants isolate the tradeoff:

**Normalized-only compact:** projects what the existing normalizer already retained. This measures envelope savings but cannot restore missing source facts.

**Source-complete compact:** adds complete text from the source's body, long/short/listing descriptions, location, season, accessibility, reservation, pets, age, duration, time-of-day, fee and activity descriptions, plus relevant structured restrictions. “Complete” here means these enumerated fields, not every raw API field, image caption, audio description or related object. All these fields round-trip without textual truncation after HTML normalization.

| Frozen request | Baseline rows / bytes | Normalized-only groups / bytes | Source-complete groups / bytes |
|---|---:|---:|---:|
| R02a | 3 / 10,834 | 8 / 11,539 | 3 / 11,442 |
| R09a | 3 / 10,834 | 8 / 11,885 | 3 / 11,442 |
| R02b | 3 / 10,386 | 8 / 11,701 | 3 / 11,442 |
| R09b | 3 / 10,834 | 8 / 11,539 | 3 / 11,442 |
| R02c | 4 / 11,652 | 8 / 11,973 | 5 / 11,997 |
| R09c | 3 / 10,834 | 8 / 11,539 | 3 / 11,442 |
| R02d | 4 / 11,690 | 8 / 11,802 | 3 / 11,442 |
| R09d | 3 / 10,834 | 8 / 11,462 | 3 / 11,322 |

The first unshared full-text draft also failed; its results are retained in `full-text-v1-results.json`. Shared metadata and exact substring reuse improve bytes but do not resolve the combined gate.

### Useful coverage, not record-count success

The normalized-only variant reaches eight groups in all eight requests. Some additional groups contain unknown or incompatible candidates, seasonal facilities, duplicates and supporting experiences. This is not eight useful, open outings. In R02b the museum still does not fit under unchanged ordering; the added patio record does not certify museum hours or provide the missing museum identity. This variant still lacks the Weeping Rock location-field closure, Lava Point body-text season, and diversion-dam interpretation. **Reject it as the repair despite its larger result count.**

The source-complete variant carries richer evidence for included activities, including Riverside interpretation and access details. However:

- R02a and R09a now retain Riverside, Pa'rus and unknown Court of the Patriarchs. The enriched museum group no longer fits. This is a loss of a useful existing anchor, not success.
- R02b still lacks the museum, so its demonstrated delivery shortfall is unresolved.
- R02c reaches five groups but loses Pa'rus. Its additions include Weeping Rock with the closure warning intact. A closed trail must not count as increased usable coverage.
- R09d retains Riverside, Pa'rus and Temple of Sinawava, losing the museum. The gateway does not replace a distinct museum visit.

Thus **all eight source-complete replays fail to improve appropriate opportunity coverage without a material regression or unresolved prior shortfall**. More source fidelity alone is insufficient under whole-record packing.

One concrete cost is Pa'rus's 2,258-character pets-description field, in addition to access survey, approach, duration and descriptive prose. This is not a recommendation to discard pet restrictions: it illustrates why carrying every field verbatim consumes the metadata savings. The next design must distinguish compact source-backed facts from full source documents without silently cutting qualifications.

## Safety and correctness checks

`replay.cjs` completes 3,080 assertions across the eight reconstructions: bounded payloads, unchanged underlying rows, resolvable evidence identities/provenance, unchanged constraint labels, and full enumerated-field round trips over all 47 records. This number counts assertions, not independent test scenarios.

Nine focused scenarios in `verify.cjs` pass:

1. Weeping Rock's `locationDescription` closure survives the source-complete projection.
2. Lava Point retains “May through September” and the weather qualifier.
3. Museum retains patio landmarks, seasonal opening qualification, down-canyon shuttle direction and the inaccessible connector.
4. Diversion Dam retains an actual interpretive activity.
5. Three museum records group while patio remains separate.
6. Weeping Rock trail and shuttle stop do not merge by name.
7. Oversized entries are omitted whole rather than truncated.
8. Different destinations do not merge on matching names.
9. Conflicting assertions remain visible as separate members, including conflict metadata.

**Preservation is not delivery:** these full-pool checks prove the enumerated information survives projection. They do not prove it fits in every selected response. Per-request JSON files show exactly what fits.

**Preservation is not guard enforcement:** the unchanged assessor can still annotate Weeping Rock eligible under the existing exposure assessment even while the restored source text says closed. The compact envelope explicitly separates static research from access authorization, but this does not repair the underlying missing operational fact. A future integration needs a lossless path from restored official restrictions into authoritative evidence using the existing operational contract; it must not replace the guard with a compact-model warning. That path is not implemented or certified here.

## Guard non-interference

The actual unchanged guard replays the previously accepted R09a plan against three frozen evidence bundles before and after projection:

| Evidence bundle | Result | Reason |
|---|---|---|
| R02a | Pass, unchanged | Existing evidence supports that lightweight fallback. |
| R02b | Fail, unchanged | `stop_identity_unresolved` for missing museum. |
| R09a | Pass, unchanged | Accepted-plan control. |

Underlying evidence hashes remain identical. Altering compact labels does not affect these results because compact labels are never submitted as validation authority. **This verifies offline non-interference only**, not a working runtime integration, new-closure enforcement, or validation of newly delivered candidates. Seven key runtime file hashes still match the preceding audit's fingerprints.

The separate recovery problem and park-versus-child eligibility-scope problem remain independently tracked and unchanged.

## Gate and next bounded work

| Acceptance condition | Result |
|---|---|
| Same 12 KB allowance | Pass for both variants |
| More entries | Pass for normalized-only; not an acceptance proxy |
| Restore demonstrated official restrictions and descriptive details | Source-complete projection passes enumerated-field checks; normalized-only fails |
| Improve useful delivered coverage without losing useful anchors | Fail for source-complete; normalized-only remains incomplete and R02b unresolved |
| Preserve underlying guard behavior | Offline non-interference passes; integration untested |
| More useful actual trip | Unmeasured; no model calls |
| Combined gate for runtime integration | **Not passed** |

Do not integrate either prototype or start paid/live comparisons based on these results. The next bounded design question is how to deliver **source-linked, independently scoped facts and restrictions**, with explicit omitted-detail references, rather than fitting whole enriched records or stripping them back to the lossy normalization. Safety/access facts must remain inseparable from any advertised opportunity. Partial-fact selection, alias semantics and authoritative restriction propagation need explicit adversarial tests before another gate decision. This is not authorization for a planner, recovery or ranking rewrite.

Once that gate passes, the planned live comparison should include the final provider-hardening build, Zion's original easy/no-exposure/scenic-drive request, a comparable Yosemite request, and a materially different request such as an urban historic-site visit. Score persistence, traveler usefulness, evidence utilization, safety and recovery separately. Exact additional destination selection and live execution are deferred while this gate is red.

**Final provider-hardening caveat remains:** this replay exercised its code offline, but that build has still not received live verification.

## Reproduce and inspect

From the repository root, no credentials or network are needed:

```sh
node artifacts/trailie-compact-evidence-replay-2026-10-12/replay.cjs
node artifacts/trailie-compact-evidence-replay-2026-10-12/verify.cjs
```

- [Prototype](../../artifacts/trailie-compact-evidence-replay-2026-10-12/compact.cjs)
- [Replay results and omissions](../../artifacts/trailie-compact-evidence-replay-2026-10-12/results.json)
- [Focused verification](../../artifacts/trailie-compact-evidence-replay-2026-10-12/verification.json)
- [R02a source-complete response](../../artifacts/trailie-compact-evidence-replay-2026-10-12/R02a-compact.json)
- [R02b normalized-only response](../../artifacts/trailie-compact-evidence-replay-2026-10-12/R02b-normalized-only.json)
- [Full-pool source-complete projection, deliberately not a budgeted response](../../artifacts/trailie-compact-evidence-replay-2026-10-12/all-candidates-compact.json)
