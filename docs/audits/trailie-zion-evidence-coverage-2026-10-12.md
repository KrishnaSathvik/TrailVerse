# Read-only Zion evidence-coverage audit — 2026-10-12

**Finding:** Trailie has more useful source material than it delivers, but the “17 low” count substantially overstates the number of distinct, October-suitable outings. The strongest demonstrated delivery loss is the **12,000-byte per-provider-read cutoff**, which admits only **3–4 records**, not the eight-row ceiling. A separate normalization loss removes descriptive/access material. The two failed runs also demonstrate different recovery conditions: one already had evidence for a valid alternative; the other did not receive the museum evidence needed for that same alternative.

**Disposition:** audit only. No runtime, planner, prompt, ranking, budget, guard, or test-suite changes; no new live calls; no commits. Existing repairs remain provisionally accepted and uncommitted. Pass 2 and Pass 3 remain on hold.

## Evidence and confidence

Inputs: all eight initial runs and four follow-ups in [the previous capture directory](../../artifacts/trailie-eligibility-final-2026-10-12/), including frozen model contexts/evidence, saved-trip readbacks, responses, terminal telemetry, and the saved `zion-source-corpus.json`. This audit uses the actual runtime modules offline with stubbed providers backed only by those files. No external source was refreshed and no new plan was persisted.

- **Observed:** exactly what reached the model, which identities were in the retained research bundle, the final stored plans, rejection codes, and the two failed first proposals.
- **Replay-supported:** full candidate ranking, serialized byte accounting, and rejected/reserved records. The original pre-read candidate list and reserve were **not** captured. The saved 39-record source corpus was assembled in the earlier post-run verification, partly from cached source snapshots and partly from the then-refetched NPS places. Replaying it reproduces selected identities present in all eight captures, and the prior verification found no exposure differences in 44 captured NPS activity rows. This is strong support for the loss point, not a claim that every pre-read byte was logged live.
- **Not knowable from these captures:** the model's internal reason for selecting unknown places; date-specific opening status for every candidate; or the exact first proposal in R09d, because its proposal capture was overwritten by its accepted correction. R02a/R02b each made only one proposal, so their failed proposal captures are intact.

**Retained final-build caveat:** upstream provider hardening and extractor v9 were completed after the eight live runs. Offline source/label parity checks passed, but that final build has **not** received a live run. This audit does not remove that caveat.

Reproducible outputs:

- [17-record trace CSV](../../artifacts/trailie-zion-coverage-audit-2026-10-12/candidate-trace.csv)
- [Detailed candidate/ranking/capture audit](../../artifacts/trailie-zion-coverage-audit-2026-10-12/pipeline-audit.json)
- [Existing-plan guard replay](../../artifacts/trailie-zion-coverage-audit-2026-10-12/available-plan-replay.json)
- [Offline audit script](../../artifacts/trailie-zion-coverage-audit-2026-10-12/audit.cjs)

## 1. What the 17 candidates actually represent

The saved raw corpus contains **19 thingstodo + 20 place records**. Normalization adds **eight existing curated facility-access records**, yielding **47 candidates**, of which **17 classify low**. Those 17 comprise **nine direct API records and eight supplemental records**. The supplement is reviewed static accessibility evidence, dated September 23, not current opening evidence.

Four records are duplicate/alias representations: the museum appears three times, the canyon visitor center twice, and the nature center twice. That leaves **13 named sites/sub-experiences**, not 17 independent outings. The diversion-dam wayside belongs to Pa'rus, Temple of Sinawava is Riverside Walk's gateway, and the patio belongs to the museum visit. Counting those as additional full-day anchors would inflate utilization artificially.

No production stage first transforms these into a deduplicated list of open, traveler-suitable outings. The ephemeral provider returns the records, the reader checks usability and packs ranked rows, and later the plan guard checks proposed stops. Session deduplication is by evidence ID, not by visitor experience. Selecting one official identity for a stop does not reclaim budget already spent on duplicate records.

In the following table, **D** is delivery of that exact evidence record across eight initial contexts; **S** is saved-stop binding to that exact record. A name appearing elsewhere is not counted as independent record utilization. “Budget” means the replay's 12 KB cutoff; **none of these reads reached eight selected rows**. Access assessments refer to the saved source text, not newly verified operating conditions.

| # | Candidate / origin | Distinctness and October suitability | Delivery loss / model use | D / S |
|---|---|---|---|---:|
| 1 | Riverside Walk — NPS thingstodo | Distinct main outing; low-exposure evidence, paving/grade caveats. No closure for this walk in captured alerts. Not a blanket certification of every condition. | Selected in every read; proposed and saved whenever an initial plan saved. | **8 / 6** |
| 2 | Pa'rus Trail — NPS thingstodo | Distinct main outing; paved riverside walk. Shorten to traveler preference. | Selected in every read; used in every saved initial plan. | **8 / 6** |
| 3 | Zion Human History Museum — NPS place | Distinct indoor/history visit; source says spring–fall, check hours. Patio is an extension of this visit. | Read-selected 5/8; exact-name reserve promotion recovers it in R02c/R02d. Not requested or delivered in R02b. Used whenever saved. | **7 / 6** |
| 4 | Zion Human History Museum — supplemental | Duplicate supporting accessibility evidence; not another museum or outing. | Read-selected only R02c/R02d; both also get the official museum identity. Not separately bound by a saved stop. | **2 / 0** |
| 5 | Human History Museum — supplemental | Alias of the same museum. | Selected/delivered only R02d; another museum record consumes budget without adding a distinct outing. Not separately used. | **1 / 0** |
| 6 | Zion Canyon Visitor Center — NPS place | Orientation/exhibits/services, useful support for the lower canyon, not automatically a major outing. Hours not established by these captures. | Budget omission in all eight; never rescued by an explicit name request. Source body also fails to become descriptive fact text. | **0 / 0** |
| 7 | Zion Canyon Visitor Center — supplemental | Duplicate of #6; static accessibility, not opening status. | Budget omission in all eight. | **0 / 0** |
| 8 | Zion Nature Center — NPS place | Distinct indoor interactive exhibits, but source advertises **summer** operation. Mid-October opening is unconfirmed; not a justified extra October outing. | Budget omission in all eight. Exclusion happens by packing, not a successful seasonal check. | **0 / 0** |
| 9 | Zion Nature Center — supplemental | Duplicate of #8; “seasonal hours apply” does not establish October access. | Budget omission in all eight. | **0 / 0** |
| 10 | Weeping Rock — NPS thingstodo | Distinct short/steep walk, **unavailable according to stored `locationDescription`: “AREA CURRENTLY CLOSED DUE TO ROCKFALL.”** Low exposure is not availability. | Budget omission in all eight; never proposed/saved. Closure text is missing from normalized operational facts, so do **not** treat its omission as proof the access guard filtered it. Coordinates also absent in this record. | **0 / 0** |
| 11 | Lava Point Overlook — NPS place | Distinct scenic destination, but source says typical access **May–September**, weather permitting, plus a long approach. October is outside that stated window. “Accessible” here describes seasonal access, not affirmative edge protection. | Budget omission in all eight. Normalized seasonal status is null and emitted fact is name-only; classification alone is insufficient to promote it. | **0 / 0** |
| 12 | Pa'rus – Diversion Dam — NPS place | Interpretive sub-experience on Pa'rus: river designation, dam and landscape interpretation. Adds substance to the existing walk rather than a new day. | Budget omission in all eight. Raw interpretive body is also omitted from the emitted fact, which is just the name. | **0 / 0** |
| 13 | Temple of Sinawava — NPS place | Riverside Walk gateway/natural amphitheater, not an independent repeat of that same canyon excursion. Narrows advice does not authorize river hiking. | Budget omission in all reads; requested-name promotion delivers it in R09d. Not added as a separate saved stop. This is not demonstrated waste: it overlaps Riverside Walk. | **1 / 0** |
| 14 | Zion Human History Museum Patio — supplemental | Useful low-effort viewpoint extension at the museum. Source supports accessible viewing via museum parking; connector trail is not accessible. No separate coordinates in this record. | Budget omission in all eight; never requested/promoted. Strong example of potentially useful day enrichment unavailable to the model. | **0 / 0** |
| 15 | Kolob Canyons Visitor Center — supplemental | Orientation/restroom/exhibits supporting a Kolob drive. Static access does not confirm road or facility opening. Different from an unverified exposed overlook. | Budget omission in all eight. Source-level Kolob visitor-center record also exists but classifies unknown; do not collapse that distinction into an additional “low” outing. | **0 / 0** |
| 16 | Zion Lodge — supplemental | Dining/services support, not a newly certified hike or major attraction; shuttle restrictions remain. | Selected/delivered in R02c only, ignored as an explicit stop. No evidence this omission harmed the requested trip: meals/breaks were already represented. | **1 / 0** |
| 17 | South Fork Picnic Area — supplemental | Picnic/recovery support in the source accessibility record. Static suitability, no opening confirmation or coordinates in the record. | Budget omission in all eight. Potential useful support, not proof of another substantive sightseeing day. | **0 / 0** |

Thus **ten of the 17 exact records never reach any initial model context**; seven reach at least once, and three official identities are bound by saved stops. Zero delivery of the ten is not uniformly bad: it includes closure/season concerns and duplicates as well as useful sub-experiences.

## 2. The exact loss points

### A. Source → normalized candidate: descriptive and access information disappears

`normalizeNamedActivities` uses full descriptions to derive some classifications but emits `claim.text` from the short/listing description or just the name. It does not carry the full body as a planning fact.

Examples from the saved raw corpus:

- **Museum:** body text describes accessible patio views, specific landmarks, museum parking, down-canyon-only shuttle service, and the inaccessible connector. The main emitted fact focuses on indoor exhibits/film/bookshop; the separate patio access record is then omitted by the byte cutoff.
- **Diversion Dam:** body contains a genuine interpretive activity; emitted fact is only its name. Even delivery of that current record would not deliver most of the useful content.
- **Lava Point:** typical access season and drive approach are in `bodyText`; emitted fact is only the name, with `seasonalStatus: null`.
- **Weeping Rock:** closure is in `locationDescription`. `officialText()` for operational extraction reads long/short/description/reservation fields, not this location field (nor places' body text). Its normalized `operationalFacts` are empty and `currentStatus` is unknown.

This is a **confirmed extraction boundary**, not evidence that the source lacked information. The Weeping Rock example is a safety prerequisite for any future broader candidate delivery: more low-classified records must not become more supposedly available activities.

Code: [NPS normalization](../../server/src/services/providers/npsEvidenceProvider.js), [operational text extraction](../../server/src/utils/operationalFactExtraction.js).

### B. Ranked provider read → retained evidence: bytes, not eight rows

The reader measures the **entire materialized evidence record**, including provenance, observation/quality/retention metadata and HTML accessibility descriptions, before selecting up to 8 rows / 12,000 bytes.

In the common replay, Riverside is **3,842 bytes**, Pa'rus **4,010**, and the official museum **2,981**. Including the array accounting, the read is **10,835 bytes with only three rows**. Every remaining candidate is too large for the remaining capacity. The two trail records alone consume about 65% of the allowance.

| Run | Selected records in reconstructed provider read | Bytes | Later exact-name recovery relevant to low pool |
|---|---|---:|---|
| R02a | Riverside, Pa'rus, official museum | 10,835 | None needed |
| R09a | Riverside, Pa'rus, official museum | 10,835 | None needed |
| R02b | Riverside, Pa'rus, **Court of the Patriarchs** | 10,387 | Museum never requested, never recovered |
| R09b | Riverside, Pa'rus, official museum | 10,835 | None needed |
| R02c | Riverside, supplemental museum, Pa'rus, lodge | 11,653 | Official museum |
| R09c | Riverside, Pa'rus, official museum | 10,835 | None needed |
| R02d | Riverside, Pa'rus, supplemental museum, museum alias | 11,691 | Official museum |
| R09d | Riverside, Pa'rus, official museum | 10,835 | Temple of Sinawava |

Ranking explains *which* rows consume the bytes. Explicit names get +100; confirmed low exposure gets +25. R02b names Court but not the museum. Court is therefore retained despite unknown exposure, while useful unrequested alternatives are cut. The over-budget reserve is recoverable only by an exact model-requested/model-proposed name; it is not a discovery list the model can inspect.

Duplicate museum access rows survive as separate evidence records: R02d spends approximately 3.8 KB on two such records before the official museum is promoted later. Deduplication by evidence ID cannot recognize this as repeated experience coverage.

The structured easy-walking ranking boost is also inactive for these requests: the scorer reads `fitnessLevel`, but these captured calls use `fitness` / `preferences.fitness` or omit a fitness field. That is a confirmed contract mismatch, **not proof that correcting it alone would produce better trips**.

Code: [reader byte gate](../../server/src/services/trailieSimpleTools.js), [ranking](../../server/src/utils/evidenceReadRelevance.js), [reserve promotion and research](../../server/src/services/trailieTravelData.js).

### C. Retained evidence → model context: a secondary limit, not the main low-candidate loss

The actual final contexts contain **18–22 facts and 25,399–27,992 serialized fact bytes**, below the 48-fact ceiling but near the 28 KB ceiling. They omit 1–8 retained records. In six cases the omission is a large official shuttle-page record; R02c/R02d also omit search snippets, overview, and an unknown Kolob alternative. Extracted `parkWideAccess` remains a separate model-context channel, so omission of the raw shuttle-page fact does **not** mean all shuttle rules vanished.

**No low-classified NPS record already in these retained bundles is lost at this final fact cutoff.** The ten never-delivered low records are lost earlier. Increasing only the final 48-fact/28 KB budget would therefore miss the demonstrated candidate loss point.

### D. Model → proposal: incomplete compliance plus reasonable overlap avoidance

Every saved plan uses all three main official identities consistently delivered: Pa'rus, Riverside and museum. The few other low records delivered are duplicates, the Riverside gateway, or lodge services. Their non-selection is not evidence that the model ignored a large menu of suitable independent outings.

Conversely, the two failed first proposals include **Checkerboard Mesa and Court of the Patriarchs**, both explicitly labeled unknown. Checkerboard has commercial identity/location evidence without exposure certification; Court's NPS body describes a short, steep viewpoint approach without affirmative exposure evidence. Neither is established safe by the source in these captures. They should not be relabeled eligible to improve persistence.

One additional labeling ambiguity is observed in R02b: the destination identity **Zion National Park** is labeled incompatible because shared subject-identity aggregation pulls in child activity evidence, including Lower Emerald Pool's exposure. Other runs label the same broad destination eligible when the retained child set differs. A park-level label is not an assessment of every possible outing there. This mixed scope may confuse synthesis, but these captures cannot prove causation. It was **not changed** during the audit.

## 3. Failed first proposals and recovery

### R02a — adequate evidence for a valid light alternative, but no recovery proposal

Delivered: Pa'rus, Riverside and museum eligible; Court, Checkerboard and Big Bend unknown. The proposal uses Checkerboard to anchor the east-side drive and Court to strengthen the final viewpoint/history day. Guard rejects unknown exposure eligibility. The model then explicitly acknowledges the unverified viewing approaches and asks whether mountain-road exposure is acceptable.

**Audit replay:** take the already accepted R09a itinerary, remove only server-added fields to fit the proposal schema, rebind the same canonical identities to R02a's frozen evidence, and invoke the unchanged guard. It **passes**, with `avoidExposure: true`. No provider call, new fact, newly composed plan or store write is involved.

That proves a technically valid four-day fallback existed using the evidence already available. It does **not** prove the fallback was a richer or fully verified four-day holiday: it retains the same conditional scenic drive and light afternoons. The model's explanation was honest, but evidence shortage alone does not explain the absence of any saved alternative here.

### R02b — a demonstrable delivery shortfall as well as unknown-place selection

Its read request names Lower Emerald Pool and Court but omits the museum. Final context supplies only Pa'rus and Riverside as the main eligible outings; Lower Emerald Pool is incompatible and the named viewpoints are unknown. The first proposal still uses Checkerboard for day 3 and Court for day 4. After rejection, the model explains that it lacks confirmed additional viewpoints and asks about road heights.

The same R09a-plan replay against R02b's frozen evidence **fails `stop_identity_unresolved` for the museum**, because that record is absent. The museum existed in the saved source pool but was neither retained nor requested for reserve recovery. This proves loss of one available alternative at delivery; it does **not** prove that no valid two-anchor, more-flexible plan could ever be constructed.

### Why did the model choose unknowns?

The captures distinguish behavior, not internal intent:

- **Label misunderstanding:** not established. Both final responses correctly describe the uncertainty, but that does not prove how the first synthesis interpreted the labels.
- **Preserving requested experience:** plausible, because the unknown places fill precisely the missing scenic-drive viewpoint and distinct final-day roles. That is an inference from proposal structure, not a recorded model rationale.
- **Insufficient useful alternatives:** demonstrated in R02b's delivered pool; only partly explanatory in R02a, whose frozen evidence supports the accepted-style fallback.

R09d is an observed recovery comparison: unknown eligibility caused its first rejection, and a new proposal saved a three-anchor/conditional-drive plan. Only the accepted correction's full proposal summary survives, so do not invent its exact first stop list.

## 4. Saved-but-thin review: R09a

R09a saves four coherent sightseeing days, not empty day structures:

| Day | What is specified | What remains weak |
|---|---|---|
| 1 | 90-minute Pa'rus outing, meals, flexible Springdale scenery | Source-backed diversion-dam interpretation is unavailable; afternoon experience is broad. |
| 2 | 120-minute Riverside Walk, shuttle allowances, lunch, recovery | A meaningful main experience. Temple is the same gateway, not a missing extra outing to count. |
| 3 | Conditional Kolob road tour, approach/return, picnic and rest | No verified road status or named low-exposure stopping points; traveler must resolve important details. |
| 4 | 75-minute museum visit, lunch, broad optional canyon-floor views | Patio and specific landscape-view content exist upstream but are not delivered as useful facts; no confirmed hours. |

A relaxed trip can legitimately have this pace. The weakness is **limited specificity and unresolved execution**, not violation of a minimum stop count. Diversion Dam and the museum patio could enrich already chosen days without pretending they create two more destinations. The corpus does not establish a hidden supply of many distinct, open October outings that would automatically solve the four-day experience.

## 5. Separate metrics for the next comparison

These are audit measurements and proposed measurement definitions, not a request to run another comparison now.

| Metric | Current evidence | Measure separately next time |
|---|---|---|
| Valid-plan persistence | 6/8 initial requests saved; 5/8 without model correction, including one local memory-only recovery; all four follow-ups saved. | Saved and database-readback-confirmed plans / initial requests. Keep first-attempt, local-memory recovery and model correction separate. |
| Traveler usefulness | All six saved plans have the same three primary identities plus a conditional scenic day. R09a has meaningful day purposes but weak drive-day execution and vague optional experiences. | Review whether each requested experience is supported, what the traveler can actually do, access assumptions, unnecessary repeats and unresolved dependencies. No mandatory stop counts or duration floors. |
| Evidence utilization | 17 low records → 13 sites/sub-experiences after exact/alias grouping; seven exact records delivered at least once, ten never delivered; three official identities saved. Candidate-specific D/S table above. | Distinct, appropriate opportunities delivered / supported source opportunities, then meaningfully used / delivered. Count enriching an existing outing as use; do not reward duplicate pins. Keep conditional, closed and season-uncertain records out of an unconditional “eligible” denominator. |
| Safety correctness | Unknown proposed outings rejected; saved mapped stops remain low and restrictions persist. Stored source also exposes an unpropagated Weeping Rock closure. | Exposure enforcement **and** access/season support; unknown never becomes safe, low never means open. Broader hazards remain outside the present certification. |
| Failure recovery | Three initial correction opportunities; one accepted re-proposal, two explanations. R02a replay proves an available guard-valid fallback; R02b lacks museum evidence for that same fallback. | Recovery rate conditioned on frozen-evidence feasibility; distinguish no re-proposal, invalid re-proposal, lost optional memory, and appropriate clarification when a dependency truly remains unresolved. |

## Decision supported by this audit

The exact delivery junction to consider is **source-to-model evidence packing**, particularly the 12 KB materialized-record cut and exact-name-only rescue. It should not be described simply as “the model ignores 17 good outings,” nor fixed by blindly raising a limit. The full body/access information and duplicate records show why record count and low-exposure count are poor measures of useful coverage.

Before choosing an implementation, distinguish two requirements at that junction: preserving the meaning/access limitations of each candidate and giving the model a compact view of distinct useful opportunities within the current allowance. Weeping Rock's missing closure prevents an unconditional “send more low candidates” intervention from being justified. The mixed-scope destination label is a separate observed ambiguity, not a proven explanation for both failures.

**No next repair was implemented or authorized by this audit.** The evidence now identifies where useful content is lost, where some omissions are sensible, and which remaining recovery failure cannot be attributed solely to missing information. Final provider-hardening live verification is still pending.
