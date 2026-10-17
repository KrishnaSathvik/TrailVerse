# TRAILIE v2 — EXACT DEMO Q1 EVIDENCE SCOPING V2 RESULT

## VERDICT

**PASS**

**Recommendation: READY FOR ONE FINAL Q1 PAID REVALIDATION.**

This result is offline-only. No live Q1, provider network, GPT/model, capture, fixture update, commit, push, or deploy was performed.

## A. Exact over-filter root cause

`npsJointUnitActivityScope.itemHaystack()` treated every field as geographic evidence, including `relatedParks[].fullName`. Real SEKI rows carry the administrative parent label `Sequoia & Kings Canyon National Parks`; the bare `kings canyon` sibling exclusion therefore matched every row requested for logical Sequoia. That removed legitimate rows such as Big Trees Trail and could reduce fresh `sequ` named-activity candidates to zero.

## B. Real NPS payload reproduction

The Q1 fixture now gives every representative SEKI activity this production-shaped field:

```json
{
  "relatedParks": [{
    "parkCode": "seki",
    "fullName": "Sequoia & Kings Canyon National Parks",
    "name": "Sequoia & Kings Canyon National Parks"
  }]
}
```

Before the fix, Big Trees Trail failed `belongsTo(sequ)` and the logical Sequoia normalized candidate set was empty. The failing regression was observed before production code was changed.

## C. Joint administrative metadata semantics

The joint SEKI parent label establishes parent-unit membership only. It does not establish Sequoia-versus-Kings-Canyon geography and cannot trigger sibling exclusion by itself. Activity/place identity, descriptions, URLs, locations, and non-joint related-park metadata remain geography-bearing inputs.

## D. New field/haystack semantics

Joint-unit scope definitions can declare their administrative parent-name pattern. `relatedParks` entries matching that pattern are omitted only from the exclusion geography haystack. Other `relatedParks` metadata remains available, so this is not a global deletion of NPS metadata. The mechanism is registry-driven through the existing joint-unit scope architecture rather than a Q1 prompt rule.

## E. Sequoia result

Production-shaped mixed SEKI input yields a nonzero logical `sequ` set containing representative Sequoia geography:

- Big Trees Trail
- General Sherman Tree
- View Sunset from Sunset Rock

It excludes General Grant Tree, Grant Grove Loop Winter Trail, Roaring River Falls, and Kings Canyon Visitor Center.

## F. Kings Canyon symmetric result

The same production-shaped input yields a nonzero logical `kica` set containing General Grant Tree, Grant Grove Loop Winter Trail, and Roaring River Falls. It excludes Big Trees Trail, General Sherman Tree, and Sunset Rock. The joint administrative parent string poisons neither direction.

## G. Evidence-store stale-hit root cause

Store lookup is intentionally broad: current rows are queried by `entityId + topic`, then coverage evaluates freshness, scope, authority, and evidence-contract compatibility. The pre-fix and post-fix joint-unit rows previously shared `nps-activities-v2`, so a chronologically fresh pre-fix normalized row was contract-compatible and could be frozen into a later EvidenceBundle.

## H. Cache/store versioning solution

Joint-unit NPS named activities now carry normalization/scoping contract version `nps-activities-v2+joint-scope-v2`. Coverage derives whether the candidate belongs to a configured joint logical unit and requires that version. Existing non-joint NPS activity evidence remains on `nps-activities-v2`.

This is the store architecture's existing equivalent of putting the normalization version in a cache key: incompatible stored rows are evaluated as `candidate_normalization_scope_version_mismatch`, become cache misses, and trigger refresh. Historical rows may remain stored, but cannot be selected as authoritative current evidence. No `parkCode === "sequ"` cache-delete branch was added.

## I. Stale-store offline replay

The broker regression seeds fresh pre-fix logical Sequoia rows for General Grant, Grant Grove, and Roaring River using `nps-activities-v2`. It then resolves Sequoia using a saved, production-shaped raw SEKI fixture.

Observed result:

- the old rows are rejected by contract compatibility;
- the NPS adapter fixture is invoked once to refresh;
- the resolution is `satisfied_fresh` with `cacheStatus=refreshed`;
- the frozen bundle has nonzero legitimate Sequoia candidates;
- no General Grant, Grant Grove, or Roaring River evidence is selected or rendered.

## J. Final Sequoia prompt evidence

The exact offline compare prompt contains legitimate Sequoia named evidence, including Big Trees Trail, General Sherman Tree, and/or Sunset Rock according to the normal priority and token budget. It contains no General Grant, Grant Grove, or Roaring River.

## K. Yosemite prompt evidence

Under the same normal compare prompt budget, Yosemite receives meaningful named scenic/activity evidence from the available upstream fixture: Bridalveil Fall Trailhead and Valley View.

## L. Fair packing result

The existing generic multi-entity round-robin packing remains unchanged. Tests prove that both `yose` and `sequ` contribute named evidence even when Sequoia has a much larger candidate set. Equal counts are not required.

## M. Unsupported-claim assessment

General Grant, Grant Grove, and Roaring River are absent from the final public evidence section and from the complete final model prompt assembled by the offline replay. Therefore stale/scoping contamination no longer supplies those claims to the model.

No model was called, so this pass does not produce evidence that the model will or will not independently generate an unsupported name. Unsupported generation remains a separate untested model behavior for the one authorized future paid revalidation; there is no offline finding requiring a Q1-specific prompt blacklist.

## N. Exact Q1 offline render/replay

The unchanged request was assembled in `compare` mode:

> I have 3 days in late September. Should I choose Yosemite or Sequoia for easy hikes, photography, and fewer crowds? Pick one and explain why.

Verified contract:

- logical destinations: `yose` and `sequ`;
- both entities have meaningful named evidence;
- no sibling-unit contamination;
- no Travel & Stay section;
- no desired winner is encoded in the fixture or assertions;
- no crowd state is invented by this activity-evidence replay.

## O. Generic regressions

Fresh bounded offline results:

- Q1/scoping/store replay: 11/11 passed.
- NPS provider, evidence contract, broker, store, EvidenceBundle, and prompt renderer: 64/64 passed.
- exact Q2/Q3/Q4 plus intent, evidence planning, prompt assembly, and shared live-readiness gates: 106/106 passed.
- Total across the two bounded regression commands: 170/170 passed, plus the final Q1 suite rerun included in the first count.

The only console warning was the existing `baseline-browser-mapping` age notice; no test failed.

## P. Changed files

- `server/src/utils/npsJointUnitActivityScope.js`
- `server/src/utils/evidenceContractVersions.js`
- `server/src/services/providers/npsEvidenceProvider.js`
- `server/src/utils/__tests__/exactDemoQ1EvidenceScoping.test.js`
- `docs/TRAILIE-EXACT-DEMO-Q1-EVIDENCE-SCOPING-V2-RESULT.md`

## Q. Provider/model/network isolation

- GPT/model calls: **ZERO**
- real provider calls: **ZERO**
- network calls: **ZERO**
- paid Q1 runs: **ZERO**
- Q2–Q5 live reruns: **ZERO**
- captures/fixture updates: **ZERO**
- commits/pushes/deploys: **ZERO**

## Explicit answers

1. Big Trees and other legitimate Sequoia rows were excluded because the joint parent name in `relatedParks[].fullName` was mixed into the geographic exclusion haystack and matched bare `kings canyon`.
2. Does `Sequoia & Kings Canyon National Parks` trigger sibling exclusion by itself? **No.**
3. Are legitimate Sequoia candidates nonzero? **Yes.**
4. Are General Grant, Grant Grove, and Roaring River removed from logical Sequoia? **Yes.**
5. Does logical Kings Canyon retain legitimate candidates? **Yes.**
6. Is scoping symmetric? **Yes.**
7. Can stale pre-fix normalized `sequ` evidence be served under the new contract? **No.**
8. How is it invalidated? **A registry-driven joint-unit normalization/scoping extractor version is checked by the generic evidence-contract compatibility gate; mismatch becomes a cache miss and refresh.**
9. Was a `sequ`-only cache-delete production branch added? **No.**
10. Does final rendered Sequoia evidence contain the bad names? **No.**
11. Does Yosemite receive meaningful named evidence under the same budget? **Yes.**
12. Is fair packing still generic? **Yes.**
13. Are the bad Q1 names anywhere in final model context? **No.**
14. Is unsupported generation still a separate theoretical risk? **It was not exercised because model calls were prohibited; this pass establishes no model-generation finding beyond proving the names are absent from supplied context.**
15. Any exact-Q1 answer hardcoding? **No.**
16. Any desired-winner hardcoding? **No.**
17. Q2–Q5 behavior changed? **No intended behavior change; bounded shared generic regressions are green.**
18. GPT/provider/network calls? **ZERO.**
