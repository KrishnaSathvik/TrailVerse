# Trailie WP4 Evidence Planner Shadow Design

## Goal

Produce deterministic, schema-valid `EvidenceRequirement[]` from the WP2 intent contract and already-resolved turn context, project those requirements into the legacy fetch-plan shape, and record explainable differences without changing any production fetch, prompt, provider, model, or response decision.

## Architecture

WP4 adds three pure boundaries:

- `evidenceRequirement` defines and validates the immutable requirement contract.
- `evidencePlannerService` maps intent, resolved public entities, temporal scope, and active-trip constraints to requirements.
- `evidencePlannerShadowService` projects requirements into a compatibility-only legacy shape and compares that projection with the actual `trailieFetchPlanner` output.

The existing `trailieFetchPlanner` remains the only plan consumed by `fetchRelevantFacts`. The v2 planner runs after entity/date resolution and after the legacy fetch plan has been computed. Its output is attached only to sanitized turn telemetry.

## Requirement contract

Every requirement contains schema/planner versions, a deterministic requirement ID, a resolved public entity or explicit unresolved public entity shell, topic and evidence types, temporal scope, freshness limits, criticality, absence semantics, authority/source policy, provider preferences, privacy scope, render budget, and reason codes.

Requirements describe evidence needs rather than provider operations. `preferredProviders: ['nps']` is valid; `callNpsRoadEndpoint: true` is forbidden. Requirement IDs are deterministic over turn ID, ordinal, and normalized requirement content.

## Planning rules

Intent baselines follow section 6.4 of the v2 architecture. Prompt signals refine the baseline without lowering safety:

- October suitability uses identity, overview, and climate/seasonality—not current roads or a near-term forecast.
- Operational open/closed questions use current road/trail/alert evidence with live freshness.
- “Right now” and safety-critical wording force zero stale tolerance.
- Future itinerary dates choose climate normals and current rules, not near-term forecasts.
- Itineraries include identity, activities, relevant access/alerts, appropriate weather mode, applicable permits, and driving support.
- Live hotel/flight inventory is request-time and hard; strategy questions remain geographic/logistical.
- Refinements request only affected topics plus active hard dependencies.

Hard requirements block a later broker from asserting or executing the affected plan element without coverage. Required requirements support answer quality but need not block the whole answer. Optional requirements are enrichment only.

## Projection and comparison

`projectLegacyFetchPlan(requirements, context)` returns the legacy compatibility fields:

```js
{
  shouldFetch: { nps, weather, web, events, transit, permits, astro, feeFree },
  queryTypes,
  intentFlags,
  blockedFetches,
  confidence
}
```

No production business logic may consume this projection. `compareEvidencePlanToLegacy` compares normalized fields and emits a stable reason-coded difference for every mismatch, including `v2_adds_provider`, `v2_omits_provider`, `query_type_difference`, `intent_flag_difference`, and `blocked_fetch_difference`. Agreement is allowed but is not the optimization target.

## Telemetry

The existing turn ledger stores a sanitized planner shadow summary:

- requirement count, topics, hard/required/optional counts, freshness classes, planner version;
- projected legacy plan and actual legacy plan;
- reason-coded differences.

The same prepared context is logged by authenticated/anonymous and streaming/non-streaming routes, producing the same planner schema. Requirements contain no raw prompt, conversation, user/session ID, address, budget, medical/accessibility narrative, or TripPlan state.

## Isolation and failure behavior

Planner validation failures are fail-safe telemetry failures and never affect fetching or the response. The planner imports no provider, evidence model/store, prompt, or model-routing module. The live fetch call continues to receive only legacy inputs and never receives requirements or WP2 intent.

## Verification

Golden plans cover all canonical intents and the important strategy/live and seasonal/current distinctions. Property tests require schema validity, deterministic IDs, public-only privacy, safety freshness preservation, and reason-coded comparisons. Structural tests prove zero provider calls, zero evidence-store/model imports, no prompt/output use, and identical route attachment across all four chat routes.

