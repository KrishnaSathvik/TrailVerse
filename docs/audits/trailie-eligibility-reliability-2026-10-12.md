# Trailie eligibility and correction persistence repair — 2026-10-12

Scope: research eligibility annotations, optional-memory recovery during correction, and the facility exposure exemption. Uncommitted for review. Pass 2 and Pass 3 remain on hold. No UI, destination-specific planner, ranking changes, or new hazard coverage.

## Implementation

- `modelFirstPlaceEligibility.js` calls the existing `evaluateCandidateConstraints` classifier. Research and the guard share evidence binding, exposure relevance, and walking-time checks. Eligible, incompatible, and unknown labels include active restrictions, reason codes, and supporting evidence references. The original fact, normalized value, source, authority, and observation survive unchanged. Labels count against the existing 48-fact / 28,000-byte synthesis budget; the 8-row / 12,000-byte provider-read budget is unchanged. Incompatible and unknown records are not filtered out.
- Research receives the saved planning state, so previously validated restrictions apply before planning even when not restated in the research request. An annotation describes the researched record; the proposed activity is independently checked at acceptance.
- Memory-only recovery now works in correction rounds. It keeps only verified memory updates and reruns the complete guard with the original turn restriction statements, previous validated restrictions, and the correction's required-place recovery check. Invalid grounding, day structure, restrictions, or required recovery cannot be bypassed. Accepted plans retain `planningState.validationConstraints`; dropped optional memory cannot loosen them.
- The live model-first path no longer exempts places by name or name-derived category. Provider record types can establish a facility exemption only without conflicting outdoor types, outdoor activity metadata, known exposure, or a proposed outdoor excursion. Known moderate/high exposure always applies. A model-authored `picnic` stop type cannot grant exemption. Legacy rollback relevance remains unchanged.
- Upstream NPS normalization also no longer infers low exposure from a facility name/category alone. Positive official indoor-activity text (or the existing surface/exposure evidence) is required; hazardous edges retain priority. Named and joint-unit activity extractor versions advance to v9 so older cached inferences miss the contract.
- Correction feedback uses the same record assessment rather than the former name-based suggestion labels.

## Deterministic verification

62 focused tests passed across research relevance/constraint consistency, runtime memory recovery, correction feedback, and new facility/safety tests. The 13-test facility suite was also run with model-authored `picnic` stop types. Controls actually submit Angels Landing, Canyon Overlook, a misleading picnic-area name, and a misleading visitor-center name to `validateSimpleMutation`.

The correction tests cover low, high, and unknown exposure, rejected attempts to disable exposure restrictions, actual commit invocation for an independently valid correction, and refusal to commit unsafe/unknown corrections. The existing receipt-reuse test now expects the valid plan to survive while the changed, unverified memory value is discarded; verification is still called only once.

Additional existing research, exposure-classification, and runtime regressions passed (85 tests at that checkpoint). Research-loop, persistence, and legacy exposure-suggestion integration checks also passed (28 tests). Full `scripts/trailie-one-brain/run-local.sh` passed again after the final facility safeguard. `git diff --check` passed.

## Controlled live experiment

Final-build captures: `artifacts/trailie-eligibility-final-2026-10-12/` (private, gitignored). Reuses the previous matrix: four R02 initial requests, four R09 initial requests, plus the original R09 follow-ups. R02 and R09 prompts differ slightly; each is repeated four times. Same authenticated streaming path and provider/model configuration, with a dedicated local backend on port 5013 and database readback of test trips.

An earlier, interrupted setup run in `artifacts/trailie-eligibility-reliability-2026-10-12/` is excluded. It was stopped to finish the facility activity check before the final matrix. No captures were overwritten.

| Measure | Previous matrix | This matrix |
|---|---:|---:|
| Initial plan accepted without another model proposal | 0/8 | **5/8** |
| Full first mutation accepted without dropping memory | 0/8 | **4/8** |
| Final initial-request plan saved | 3/8 | **6/8** |
| Correction opportunities ending in a saved plan | 3/8 | **1/3** |
| Valid corrections discarded solely for optional memory | 1 | **0 observed** |

The fifth first-round save is R02d: one unsupported optional memory fact was dropped, the plan independently revalidated, and the same proposal saved. R09d supplied the one successful model correction. R02a/R02b proposed unknown-eligibility viewpoints despite their labels and then explained the limitation instead of proposing another plan. Thus only one of this run's three correction opportunities produced a re-proposal; that re-proposal passed. The new correction-memory recovery specifically is proven deterministically, not exercised by a live correction-memory failure in this matrix.

| Initial request | First proposal | Correction | Saved |
|---|---|---|---|
| R02a | Unknown eligibility rejected | Explanation | No |
| R09a | Accepted | Not needed | Yes |
| R02b | Unknown eligibility rejected | Explanation | No |
| R09b | Accepted | Not needed | Yes |
| R02c | Accepted | Not needed | Yes |
| R09c | Accepted | Not needed | Yes |
| R02d | Plan accepted after dropping optional memory | No model correction | Yes |
| R09d | Unknown eligibility rejected | Corrected plan accepted | Yes |

All four R09 follow-ups saved. Database readback matches the returned itinerary hashes. All accepted plans and follow-ups retain `validationConstraints.avoidExposure: true`; untouched days 1/3/4 are byte-equivalent in the JSON captures. Every saved mapped stop has source-certified `low` exposure. **No exposure restriction violation observed.** Deterministic negative controls exercise the boundary directly rather than relying on the live model to select exposed routes. This is not certification of unrelated hazards or all pinless travel advice.

### Traveler usefulness and evidence coverage

All six saved initial plans have four coherent days: Pa'rus, Riverside Walk, museum/history, and a conditional pinless scenic-drive day. The drive days contain a substantive road-tour experience plus transfers and breaks, rather than only meals/rest or empty sightseeing structures. They explicitly leave road access and individual stopping locations uncertain. However, the plans are still light: three named attractions across four days, substantial free afternoons, and no verified scenic-drive stopping points. Usefulness is **mixed**, not merely a schema pass and not yet a fully specified four-day itinerary.

The bounded source check read 39 Zion NPS activity/place records and normalized 47 candidates including duplicate identities and existing reviewed supplemental facility records. Seventeen candidates classify low exposure, while the saved plans consistently use the same three named experiences. This does **not** establish 17 distinct available outings: closures, duplication, access, and the other request requirements still matter. It does show that the full normalized source pool is larger than the useful pool consistently delivered/used. The next investigation should examine source-to-model coverage and access evidence. No ranking or coverage behavior was changed in this repair.

### Final safety-review timing and limits

The upstream NPS facility-name hardening was completed after the eight live runs. Rather than silently attributing new live results to that last edit, we re-normalized the same Zion sources: **44 captured NPS activity rows checked, zero missing identities, zero exposure-classification differences** (`provider-recheck.json`). A separate frozen-capture replay verifies all model-facing eligibility labels against the final shared assessor and confirms the byte budget and original source values. A small research-state projection alignment made during the run likewise changes none of these captured labels; a regression covers prior fitness preferences to keep the research projection identical to the guard's. There was no second paid eight-run matrix after these final hardening checks.

Final provider normalization/cache-contract checks passed: **65 tests**. The final One-Brain gate passed after the upstream fix. Evidence: `analysis.json`, `capture-verification.json`, `provider-recheck.json`, `coverage.json`, `cases/`, and `runtime-events.jsonl` in the private capture directory.

**Conclusion:** first-attempt planning and final saving improved substantially in this small sample, but **6/8 misses consistent persistence**. Two requests still selected known-unknown places. The limited delivered activity pool and thin day content remain unresolved; eight trials cannot establish long-term reliability. No further planner, prompt expansion, UI work, or Pass 2/3 work was added.
