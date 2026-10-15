# Trailie full Demo conversation replay — 2026-10-12

## Decision

Stage A completed against the authenticated model-first runtime with live research, live model responses, isolated MongoDB persistence, diagnostic capture, and reserve discovery disabled. All five shipped Demo conversations completed without an HTTP/stream failure. Every requested plan was eventually accepted and saved, and all 11 plan-writing responses matched the database's saved `plan` byte for byte.

The traveler outcome is **four Working scenarios and one Mixed scenario**. Zion + Bryce is Mixed because its accepted five-day itinerary initially contained only three scheduled activities and two empty travel days. A targeted follow-up improved Day 3, but the final trip remained light. No scenario was Broken, and no unsafe plan or critical data loss was observed.

Do **not** proceed to Stage B yet. The baseline did not pass the cost gate: pricing telemetry was unavailable, the suite used 411,187 input tokens across 41 model calls, three initial plan requests required correction, and the largest correction call contained 28,807 input tokens / 121,638 input bytes. Enabling reserve discovery before bounding the complete correction envelope would make cost and latency less predictable. Production reserve discovery remains disabled.

## Scope and controls

- Source inventory: `next-frontend/src/data/trailieDemoPlayback.json`
- Fixture policy: read-only; no fixture was regenerated or overwritten.
- Runtime: authenticated `/api/ai/chat-stream`, `model_first`, live providers, real plan persistence.
- Isolation: dedicated local database `trailverse_full_demo_pilot_20261012` and a dedicated test account.
- Baseline switch: reserve discovery was false for every captured research call.
- Held work: Pass 2, Pass 3, runtime integration, production activation, and commits remained held.
- Stop conditions: no unsafe persistence, critical data loss, or misleading success signal occurred during the three-scenario pilot, so the remaining two scenarios were run.

The raw inventory, requests, SSE events, responses, accepted canonical plans, saved trip snapshots, research/proposal/terminal diagnostics, and per-turn telemetry are in `artifacts/trailie-full-demo-pilot-2026-10-12/`. Paid captures were append-only and the harness refused to overwrite an existing first turn.

## Exact shipped Demo inventory

### 1. Where should I go? — expected destination: Shenandoah National Park

1. `i have like 4 days in october and want a national park with mountains, fall colors, easy hikes and not-crazy crowds. where would you go?`
2. `compare your top two and tell me which one you’d actually choose`
3. `cool, plan the four days the way you would do it`

Constraints carried by the conversation: four days, October, mountains, fall color, easy hikes, and lower crowds. The shipped fixture first contains a plan on turn 3.

### 2. Zion + Bryce — expected destination: Zion and Bryce Canyon National Parks

1. `i’ve never been to zion or bryce. if i’m flying into vegas which one is better for a first trip?`
2. `honestly i kinda want to see both. is 5 days enough without rushing everything?`
3. `yeah do that. keep the hikes on the easier side and make the trip feel relaxed`

Constraints: Las Vegas gateway, both parks, five days, easy hikes, relaxed pace. The shipped fixture first contains a plan on turn 3.

### 3. Is this trip realistic? — expected comparison: Yosemite, Sequoia and Kings Canyon

1. `be real with me. can i do yosemite, sequoia and kings canyon in 3 days from san francisco?`
2. `what if i really want all three? how bad would that actually be?`
3. `alright then forget my idea. give me the trip you’d actually recommend`

Constraints: three days from San Francisco, frank feasibility advice, then freedom to replace the original three-park idea. The shipped fixture first contains a plan on turn 3.

### 4. Yellowstone wildlife trip — expected destination: Yellowstone National Park

1. `can you plan 4 days in yellowstone for me and my partner? we care way more about wildlife and photography than doing long hikes`
2. `i really want a good chance at seeing wildlife. don’t cut the best wildlife day even if we have to drop something else`
3. `can you make the last day pretty easy? i don’t want to be exhausted before we leave`

Constraints: four days, two travelers, wildlife and photography over long hikes, protect the strongest wildlife day, and finish easily. All three shipped turns contain plan state.

### 5. Glacier relaxed trip — expected destination: Glacier National Park

1. `how would you spend 5 relaxed days in glacier? i mostly want photography, scenic drives and shorter hikes`
2. `which day would you start really early and which day can be almost no hiking?`
3. `yeah update it so day 3 is the easy photography day`

Constraints: five relaxed days, photography, scenic drives, shorter hikes, and Day 3 changed to easy photography. Shipped turns 1 and 3 contain plan state; turn 2 is explanatory.

## Context-aware follow-ups added after inspecting accepted plans

The Yellowstone and Glacier shipped turns already form natural itinerary follow-ups. The other three scenarios received these additional turns in the same conversation and trip:

| Scenario | Exact follow-up | Expected behavior | Result |
| --- | --- | --- | --- |
| Shenandoah | `Our four days include the drive home on Day 4. Can you make that day lighter without changing Days 1 through 3?` | Replace only Day 4 with a light departure day | Passed; Days 1–3 were byte-identical |
| Shenandoah | `Which parts of the updated trip depend most on October weather or road access?` | Explain conditions without mutating the plan | Passed; no plan mutation |
| Yosemite | `We’ll be leaving San Francisco after lunch on Day 1. Can you adjust that day without changing Days 2 and 3?` | Remove the unrealistic Day 1 outing only | Passed; Days 2–3 were byte-identical |
| Yosemite | `Why did you choose Yosemite instead of Sequoia and Kings Canyon for this version?` | Explain the choice without mutating the plan | Passed; no plan mutation |
| Zion + Bryce | `Day 3 feels too empty. Can you add one easy, worthwhile stop on the way to Bryce without making the day rushed or changing the other days?` | Enrich only Day 3 while retaining easy/relaxed pacing | Passed; Red Canyon Visitor Center added and Days 1, 2, 4, 5 were byte-identical |
| Zion + Bryce | `Which parts of this plan depend on Zion shuttle operations, seasonal access, or our flight times?` | Explain verified dependencies and uncertainty without mutation | Passed; no plan mutation |

## Results by conversation

| Scenario | Classification | Accepted itinerary versions | Follow-up behavior | First failure or weakness |
| --- | --- | --- | --- | --- |
| Glacier | **Working** | V1: 5 days, 9 mapped stops. V2: Day 3 simplified to Wild Goose Island Overlook, 8 mapped stops. | The explanatory turn correctly identified Day 4 for the early start and Day 2 as nearly hike-free. The update changed only Day 3; manual canonical comparison confirmed Days 1, 2, 4, and 5 were identical. | No correctness failure. Initial response took 84.4 s and used a 14,993-token synthesis call. |
| Yellowstone | **Working** | V1: 4 days, 6 mapped stops. V2 retained the same four days while strengthening the wildlife priority. V3 simplified Day 4 from Norris + Grand Prismatic to Norris only, 5 mapped stops. | The best wildlife mornings remained protected. The final edit preserved Days 1–3 exactly. | The itinerary repeats Lamar Valley on two days and is deliberately light, but that matches the explicit wildlife priority better than adding unrelated attractions. Initial response took 67.1 s. |
| Yosemite feasibility | **Working** | V1: 3 Yosemite days, 4 mapped stops. V2: Day 1 became arrival/settling time, 3 mapped stops. | Trailie correctly refused to endorse the rushed three-park idea, quantified the tradeoff, then produced the recommended Yosemite trip. The scheduling edit preserved Days 2–3; the explanation did not mutate the plan. | The first plan proposal failed memory/day-shape checks and recovered on correction. The correction call grew to 27,693 input tokens / 119,667 bytes and the turn took 81.9 s. |
| Shenandoah discovery | **Working** | V1: 4 days, 5 mapped stops. V2: Day 4 changed from Blackrock Summit to a departure day, 4 mapped stops. | It selected Shenandoah, compared it with Great Smoky Mountains, preserved Days 1–3 during the departure edit, and gave a useful weather/road-access explanation without mutation. | The first plan proposal exceeded source-supported duration and recovered on correction. The correction call reached 28,807 input tokens / 121,638 bytes; the turn took 103.6 s. |
| Zion + Bryce | **Mixed** | V1: 5 days with Pa'rus Trail, Riverside Walk and Sunset Point, 3 mapped stops. V2: Red Canyon Visitor Center added to Day 3, 4 mapped stops. | The targeted enrichment changed only Day 3. The final answer clearly separated shuttle, seasonal/road, and flight-time dependencies and retained uncertainty. | The initial accepted plan was too thin for a five-day two-park trip: Days 3 and 5 had no activities and each park had little variety. It also required a correction for inconsistent day type. The follow-up helped but did not make the complete trip strong enough to call Working. |

No no-plan response was an inappropriate refusal. The early discovery/comparison/feasibility turns asked for advice rather than an itinerary, and their saved conversation state remained intact.

## Accepted plan and persistence checks

- 21 conversation turns completed; 21 returned a terminal response and persisted conversation state.
- 11 turns wrote plan state.
- All 11 accepted `canonicalPlan` values exactly matched the plan fetched back from the isolated database.
- Targeted plan edits preserved every explicitly protected day. The Glacier summary was captured before the harness's unchanged-day bookkeeping fix, so its unchanged-day claim was verified directly from the two canonical plans.
- Explanatory follow-ups returned prose without overwriting the most recent accepted plan.
- Maps contained only accepted mapped stops. Mapped-stop counts moved consistently with plan edits: Shenandoah 5→4, Glacier 9→8, Yellowstone 6→6→5, Yosemite 4→3, and Zion/Bryce 3→4.

## Grounding, safety and access

No accepted plan introduced an observed closed or disallowed activity. The plans avoided the high-risk Zion activities that were outside the traveler request, and Trailie did not silently claim date-specific opening status. Follow-up answers kept shuttle schedules, winter footing, road access, visitor-center hours, flight timing, and unconfirmed dates conditional.

The evidence captures still show an important quality limit: some model-facing facts contain identity/location plus `access and availability are not confirmed`, while several alert/transit records have a source but no useful extracted text. The source-preservation repair improves known cases, but this replay does not prove complete extraction across providers and destinations. The guard remained authoritative and unchanged.

## Cost and latency

| Metric | Baseline result |
| --- | ---: |
| Conversations | 5 |
| Turns | 21 |
| Model calls | 41 |
| Total input tokens | 411,187 |
| Total output tokens | 26,973 |
| Median turn latency | 19.6 s |
| p95 turn latency | 99.1 s |
| Maximum turn latency | 103.6 s |
| Maximum single-call input | 28,807 tokens / 121,638 bytes |
| Known dollar cost | Unavailable (`modelCostUsd: null`) |

The long tail is associated with initial plan construction and guard correction. Discovery, Yosemite, and Zion/Bryce all needed one correction. Correction output envelopes were 44,769 bytes, 50,287 bytes, and 20,134 bytes respectively. This is a cross-destination correction-envelope issue, not a Zion-only anomaly.

Because dollar cost is unknown and the baseline already produces 95–122 KB correction inputs, the prerequisite token/safety/cost gate for reserve-enabled Stage B is not satisfied. A reserve comparison should wait until complete-call pricing is observable and a maximum correction envelope is agreed.

## Presentation verification

The captured canonical plans were projected through the workspace data model, and Chat/plan persistence agreement was verified. The focused Demo playback, Trip workspace, and rich trip component tests passed as part of the frontend suite.

A real desktop/mobile visual inspection could not be completed because the configured in-app browser runtime reported no available browser sessions. No substitute browser automation was used. The broader frontend suite also exposed one existing cross-surface integration failure: `stage14Lifecycle.test.js` expected shared `plan.days` to preserve the stored day objects byte for byte, but the sharing projection normalized away day-level fields while enriching stops. Final suite result: **1,534 passed, 1 failed** across 168 files. Therefore visual/cross-surface presentation remains **Mixed / not fully verified**, even though the live saved plans and workspace projections agreed.

## Readiness controls

The model-first guard/runtime, eligibility, reserve-isolation, active-refinement, and exact Demo Q2/Q4 suites passed. Two deterministic readiness assertions failed:

1. `exactDemoQ1EvidenceScoping` expects the former `nps-activities-v8+joint-scope-v2` extractor identifier, while the current source-preservation implementation reports v10. This is a stale assertion, not a live runtime failure.
2. `exactDemoQ3SeasonalSubjectSemantics` expected legacy fixture completeness on attempt 3 and received false. This remains a source/completeness caveat and was not bypassed.

Readiness total: **111 passed, 2 failed** across the selected backend suites. No test or product code was changed to make the baseline pass.

## Recurring causes and next decision

The replay answers the end-to-end question with a qualified yes: a traveler can complete these conversations, save a grounded plan, make precise edits, preserve unaffected days, and ask non-mutating practical questions. The weak point has shifted from persistence reliability to experience density, correction cost, and presentation verification.

Three recurring causes matter:

1. **Thin planning remains destination-dependent.** It is most visible in Zion/Bryce, where a technically valid five-day plan underuses the trip. More evidence may help, but the live baseline does not establish that reserve exposure alone will improve selection.
2. **Correction envelopes are unexpectedly large.** Three destinations required correction, and two crossed 119 KB / 27K input tokens. This creates latency and cost risk before reserve evidence is added.
3. **Authority is stronger than model visibility, but extraction is still uneven.** The guard prevented unsafe persistence, while some model-facing source facts remained empty or operationally unknown.

The smallest justified next step is to make full-call cost observable and bound correction context before any reserve-enabled live comparison. Separately, fix or adjudicate the cross-surface hash assertion and obtain a real desktop/mobile browser session for final visual inspection. Keep reserve discovery disabled in production, keep Pass 2 and Pass 3 held, and do not change the safety guard based on this replay.

The dedicated provider-hardening build was exercised by these live provider reads, including a recorded `direct_official_page` failure that degraded without aborting the trip. The prior caveat should remain open until its named provider-hardening acceptance gate is run explicitly; this broad replay is supporting evidence, not a substitute for that targeted verification.
