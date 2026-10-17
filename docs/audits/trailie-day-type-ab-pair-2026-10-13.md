# Pass 2: one controlled live A/B pair

## Verdict

Promising first-pair result: A reproduced the Day 5 omission; B included the required block and passed the unchanged guard. Retain provisional approval of the clarification. One pair cannot establish a reliable correction-rate improvement, causality or accepted-plan latency savings. No further calls were launched.

## Controls and authorization

Exactly one GPT-6.1 Sol proposal and one memory-verification call per arm. A ran first, then B. Zero live research/provider fetches, correction generation, database writes or retries. No production code changes, commits, deployment, reserve discovery or saved-plan remediation.

Both arms used the identical captured Zion/Bryce conversation, frozen research/model context, original snapshot and capture-time validation clock. The historical frozen evidence was retained unchanged in both arms, including its pre-Pass-1 normalization version and known Sunrise Point measurement defect. This isolates the policy experiment; it is not a validation of the v11 producer fix or a release-ready saved itinerary.

Exact API request comparison confirmed that **only the clarification paragraph differed**. A's instructions also matched the previous full-format benchmark instructions. The schema, model, low reasoning, 10,000 output-token limit, `store:false`, automatic tool choice and disabled parallel tool calls matched. No service tier was requested; both responses reported `default`.

Private gitignored captures: `artifacts/private/day-type-ab-2026-10-13/`, with `A-1/` and `B-1/`. Raw requests/responses, decoded original proposals, outcomes and complete day diagnostics are retained as mode-0600 files. The runner refuses an already-started arm and enforces call limits.

## Measured results

| Metric | A: previous policy | B: clarification |
|---|---:|---:|
| First proposal accepted by guard | No | Yes |
| Guard issues | `day_type_inconsistent` | None |
| Proposal latency | 53.122 s | 68.976 s |
| Proposal input tokens | 15,419 | 15,478 |
| Proposal output tokens | 2,466 | 2,663 |
| Proposal reasoning tokens | 0 | 0 |
| Cache-read tokens | 0 | 0 |
| Cache-write tokens | 15,416 | 15,475 |
| Proposal recorded cost | $0.063206 | $0.0653235 |
| Memory verification latency | 7.594 s | 3.731 s |
| Memory input/output tokens | 781 / 254 | 780 / 97 |
| Memory reasoning tokens, included in output | 153 | 0 |
| Memory cache read/write tokens | 0 / 0 | 0 / 0 |
| Memory recorded cost | $0.004102 | $0.002530 |
| Entire isolated runtime | 60.753 s, rejected | 72.741 s, accepted in memory |
| Total recorded model cost | $0.067308 | $0.0678535 |

Pair total: **$0.1351615**, 32,458 input and 5,480 output tokens across four successful model calls. Costs use actual provider usage and the existing `pricing-2026-10-13` registry, including cache writes and reasoning output; they are recorded token costs, not independently reconciled invoices.

B took 15.854 seconds longer to generate its proposal. No correction was run in A, so this pair provides no measured A time-to-accepted-plan and no measured correction time saved. B's in-memory result was available in 72.741 seconds; there was no persistence or browser render measurement. Zero cache reads in both arms means this pair does not demonstrate a cache benefit.

## Exact structural diagnostics

A: Day 5, `dayStructure.type = departure`, useful span morning–evening:

- Block 0: `meal`, morning — breakfast and checkout.
- Block 1: `outing`, morning — Sunrise Point.
- Block 2: `transfer`, midday–evening — Bryce Canyon City to Las Vegas.
- Conflict: `missing_matching_block`, path `dayStructure.blocks`; expected at least one `departure` block. No particular existing block is malformed: the required kind is absent from the collection. Days 1–4 have no day-type conflict.

B: Day 5 remains `departure`, useful span morning–evening:

- Block 0: `meal`, morning — breakfast and pack.
- Block 1: `outing`, morning — Sunrise Point.
- Block 2: `meal`, midday — lunch before the return.
- Block 3: `transfer`, midday–evening — Bryce Canyon City to Las Vegas.
- Block 4: **`departure`, evening — finish the park loop in Las Vegas.** The note leaves onward flight versus Vegas overnight contingent on actual bookings and airport buffers.

B has no day-type conflicts on any day and no overall guard failures. Both memory checks completed with three supported facts and zero rejected facts. There was no memory-only recovery or correction generation.

## Traveler-quality comparison

| Dimension | Comparison |
|---|---|
| Trip shape | Identical type sequence: arrival, sightseeing, sightseeing, transfer, departure. No imposed new rest day or sightseeing-to-transfer relabeling. |
| Overnight bases | Both retain three Springdale nights and one Bryce Canyon City night, then return to Vegas. |
| Selected activities | Same five, in the same order: Pa'rus Trail, Riverside Walk, Lower Emerald Pool Trail, Sunset Point, Sunrise Point. |
| Durations | First four unchanged at 60, 120, 90 and 60 minutes. Sunrise Point changes from 45 to 60 minutes. |
| Pacing | Both protect recovery afternoons in Zion, keep one main outing per day, avoid a mandatory sunrise and exclude Bryce canyon descents. B adds an explicit final-day lunch and departure. |
| Transfers | Same inter-base route. Day 1 arrival labeling moves from Springdale check-in after travel to beginning the trip in Vegas/car pickup before travel. Day 4 lodging settling moves after the overlook. No changed destination or verified drive-time claim. |
| Access/safety caveats | Both retain seasonal shuttle, weather and trail-access conditions. Lower Emerald Pool remains the least gentle outing, with rough/steeper terrain and cliff-edge cautions; B adds explicit advice to skip it if a detour adds effort. Neither proposal proves flight compatibility. |
| Memory completeness | A proposes five-day duration plus easy/relaxed preferences. B proposes easy/relaxed preferences and first-visit history, omitting durable duration. Both itineraries still have five days. This is output variation and a completeness caveat, not an observed itinerary regression or proof of policy causation. |

Review judgment: the pair shows no material loss of selected experiences, trip structure or relaxed intent attributable to the clarification. The 15-minute final-viewpoint increase and shifted logistics are real differences; this was not a byte-identical itinerary with one block inserted. B's morning start is an explicit assumption, not a booked flight time. Both retain conditional logistics and the same historical evidence limitations. Guard acceptance alone is not a full factual or traveler-quality certification.

## Decision boundary

The clarification meets this pair's structural objective with broadly preserved traveler quality. It remains provisionally supported, rather than statistically qualified. A broader success-rate claim would require separately authorized repeated comparisons; this task does not authorize them automatically. No claim that the clarification eliminated all day-type errors or reduced generation latency is justified.

Passes 3–5, commits, deployment, reserve discovery and historical saved-plan remediation remain held.
