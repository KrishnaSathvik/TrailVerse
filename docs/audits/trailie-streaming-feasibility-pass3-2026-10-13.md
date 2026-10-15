# Pass 3: isolated streaming feasibility

## Result

**Feasible in this capture:** complete day objects arrived progressively before final acceptance, and the streamed proposal passed the unchanged guard. Day 1 was parseable at 26.145 seconds; the accepted in-memory result was available at 70.278 seconds. This creates approximately 44 seconds of potential draft-preview lead time, not a measured improvement in actual user-visible feedback. No preview was exposed.

One successful stream does not establish reliable arrival ordering across requests, lower generation latency, browser readiness or production safety. Keep the production adapter and UI unchanged pending a separate preview decision.

## Scope and controls

- One live Sol proposal, one optional memory-verification call; no retries, correction generation, live research, provider fetching or database persistence.
- Same clarified policy, full schema, low reasoning, 10,000 output-token ceiling, traveler conversation, frozen evidence and validation clock as the preceding B arm. Exact request comparison passed: only `stream:true` differed.
- Historical frozen evidence retained unchanged, including its known pre-v11 normalization defect. This experiment isolates transport behavior; it does not validate the Pass 1 producer or remediate existing data.
- No service tier requested; response reported `default`. `store:false` retained. No production code, prompt, guard or UI edits.
- All stream events, arguments and partial days remained in the gitignored `artifacts/private/streaming-feasibility-2026-10-13/` directory. Capture files use mode 0600 within private directories. No partial canonical plan, public sample or shared artifact was created.

The installed SDK and [official function-call delta documentation](https://developers.openai.com/api/reference/resources/responses/streaming-events#response.function_call_arguments.delta) support incremental arguments keyed by output item. The private adapter accumulates those deltas and returns a normal completed response to the existing runtime only after final reconciliation.

## Timing

Times below are client-observed elapsed times from the streaming request start, except the final runtime figure, which includes the surrounding frozen-input runtime. They are not server generation timestamps or browser paint times.

| Event | Elapsed |
|---|---:|
| First stream event | 0.902 s |
| First function-call argument delta | 2.092 s |
| Complete top-level conversational `response` string | 8.722 s |
| Complete Day 1 | 26.145 s |
| Complete Day 2 | 35.152 s |
| Complete Day 3 | 46.101 s |
| Complete Day 4 | 55.747 s |
| Complete Day 5 | 65.588 s |
| `response.completed` received | 65.697 s |
| Model adapter finished | 65.810 s |
| Memory verification | additional 4.431 s |
| Complete runtime, accepted in memory | 70.278 s |

The first delta was only `{"`: transport progress, not meaningful traveler content. The complete response string at 8.722 seconds was still part of an unvalidated proposal, not an approved conversational answer. No ordinary `response.output_text.delta` events arrived in this proposal stream. Day 1 is the first measured complete itinerary unit.

The generated property order was `response`, `memory_updates`, then `plan`; within plan, `parkName`, `intro`, `narrativeSections`, then `days`. This explains some of the delay before a usable day. No ordering change was requested. Days 1–5 arrived in order in this sample; the schema/transport does not promise that schedule for future generations.

## Tokens, cache and cost

| Metric | Streaming proposal | Memory verification |
|---|---:|---:|
| Input tokens | 15,478 | 780 |
| Output tokens | 2,620 | 97 |
| Reasoning tokens, included in output | 0 | 0 |
| Cache-read tokens | 15,475 | 0 |
| Cache-write tokens | 0 | 0 |
| Recorded token cost | $0.0277535 | $0.002530 |

**Total recorded cost: $0.0302835.** Final-response usage was retained and priced by the unchanged `pricing-2026-10-13` registry. Cost is usage-based accounting, not an independently reconciled invoice.

The preceding non-streaming B proposal took 68.976 seconds, emitted 2,663 tokens and cost $0.0653235 before memory. This streamed proposal took 65.810 seconds, emitted 2,620 tokens and cost $0.0277535. The cache state changed from 15,475 cache-write tokens to 15,475 cache-read tokens, and the generated wording also changed. Therefore neither the approximately 3.17-second difference nor the lower cost can be attributed to streaming. No paired latency benchmark or service-tier experiment was run.

## Argument and canonical integrity

2,611 stream events were captured. Each function-call item had its own accumulation buffer. Day detection parsed JSON structure rather than splitting on braces or matching day labels; tests covered nested objects/arrays, quoted braces, escaped quotes, backslashes and Unicode. Newly complete day objects were retained privately and checked for stability across subsequent prefixes.

Before releasing the proposal, the harness required:

1. A successful `response.completed` with completed status.
2. Matching argument-done events and exact accumulated argument strings.
3. Matching final function names/items and exact final arguments.
4. Equality of parsed progressive days and final `plan.days`.

The final reconstructed response equaled the captured response. Offline validation of the reconstructed proposal and direct final proposal produced identical complete guard results, including the enriched canonical candidate. This tests transport preservation for this proposal; it does not assert equality with a separately generated non-streaming itinerary.

The live guard accepted with zero issues. Day types remained arrival, sightseeing, sightseeing, transfer, departure. Activities remained Pa'rus Trail (60 min), Riverside Walk (120), Lower Emerald Pool Trail (90), Sunset Point (60), Sunrise Point (45). Bases remained three Springdale nights and one Bryce Canyon City night. Day 5 explicitly contains morning `departure`, midday–afternoon `transfer`, and evening `outside_trip`; no flight time is invented. Compared with the preceding B arm, Sunrise Point returns from 60 to 45 minutes and some meal/logistics wording shifts. No material selection or pacing regression was identified in this narrow review.

## Rejection and interruption checks

These were **offline checks**, with no extra paid generation or live connection intentionally interrupted:

- All **2,610 captured prefixes before completion** failed the final-release gate, including prefixes containing complete days or all argument text. No partial proposal was sent to the guard/runtime by that gate.
- Replayed `error`, `response.failed` and `response.incomplete` endings could not release a proposal.
- Altering final arguments to disagree with accumulated deltas failed reconciliation.
- The previously rejected A proposal was replayed through synthetic small chunks, assembled exactly and passed through the unchanged guard with its recorded memory-verifier verdict. It was still rejected for Day 5's missing `departure` block. Streaming did not cure or bypass the failure.
- The live response and recorded memory verdict were revalidated offline with identical inputs and matching memory-verifier payloads. No extra model call was used.

An interrupted live request may still incur charges. Without terminal usage, cost must remain unknown rather than zero; the private harness records this uncertainty on stream failure. Actual upstream cancellation latency/billing, proxy disconnects, browser teardown and partial-preview withdrawal were not tested. No retry/resume logic exists in this experiment.

## Decision

This establishes a useful technical opportunity for a clearly provisional preview: one full day was available roughly 44 seconds before acceptance, with subsequent days appearing about every 9–11 seconds. It does not authorize exposing those drafts. Later validation, memory, access and whole-trip constraints can invalidate an earlier complete day.

The existing production interface still reveals accepted canonical content only. A future preview decision must separately specify provisional labeling, rejection withdrawal/replacement, cancellation, and exclusion from saving/sharing/export/navigation as an accepted plan. An internal buffer alone does not improve user-visible itinerary latency. Ordinary conversational streaming and factual grounding also remain untested here.

Stop after this one experiment. Broader streaming UI work, Passes 4–5, deployment, commits, reserve discovery and historical saved-plan remediation remain held. No general speed improvement or release-readiness claim is established.
