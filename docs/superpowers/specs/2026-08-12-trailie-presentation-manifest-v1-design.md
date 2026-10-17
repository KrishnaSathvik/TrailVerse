# Trailie Presentation Manifest v1 Design

**Date:** 2026-08-12

**Status:** Written for user review; no implementation authorized

**Scope:** Trailie web chat, restored/shared conversations, and Trailie demo playback

**Architecture choice:** Deterministic server-authored presentation manifest with canonical data references

## 1. Decision summary

Trailie responses have two separate concerns:

```text
intent       = what the user is asking Trailie to do
presentation = how Trailie should visually answer it
```

`intent` and `presentation` are sibling fields in the canonical response envelope. They must never be nested or treated as aliases.

The server deterministically builds `presentation` from structured intent, request scope, canonical response data, evidence metadata, and requested logistics slices. The model does not choose UI components. The frontend renders the manifest faithfully and responsively.

Every new response has:

- exactly one primary artifact;
- zero to three supporting modules;
- an explicit prose policy;
- optional refinement and ending semantics;
- references to canonical data, never duplicated display copies;
- claim-level evidence and commercial-inventory safety metadata on the canonical data itself.

Legacy responses without `presentation` use a compatibility projection. New responses never depend on client inference as their source of truth.

## 2. Goals and non-goals

### 2.1 Goals

- Match the visual answer shape to the user's actual job.
- Preserve concise prose when prose is the best UI.
- Give mixed trip-planning responses one clear hierarchy.
- Prevent itinerary, logistics, and prose from rendering as independent competing surfaces.
- Make prose deduplication an intentional server-authored policy.
- Prevent available-but-unrequested data from automatically earning screen space.
- Preserve presentation semantics across streaming, persistence, refresh, sharing, and demo playback.
- Communicate evidence state at the claim, row, or item level.
- Make false live-commerce implications invalid by schema and finalization rules.
- Keep canonical response data authoritative and free from presentation-specific copies.

### 2.2 Non-goals

- Redesign the canonical itinerary or Travel & Stay Logistics v1 data contracts; the
  required `inventoryMode` addition is a narrow, additive safety extension.
- Ask an AI model to generate component names, source paths, layout order, or prose policies.
- Build live flight, hotel, campground, or vacation-rental inventory integrations.
- Turn every answer into cards.
- Infer a full v1 manifest from prose for new responses.
- Make `refinement` or `mixed` presentation kinds.
- Put a single confidence score on an entire answer.

## 3. Canonical response envelope

The response envelope owns actual data and presentation semantics separately:

```js
{
  content: "...",
  canonicalPlan: { /* canonical itinerary or null */ },
  travelLogistics: { /* Travel & Stay Logistics v1 or null */ },
  responseArtifacts: {
    comparison: null,
    requirements: null,
    accessPlan: null,
    currentStatus: null,
    costSummary: null,
    recommendations: null
  },

  intent: {
    primaryIntent: "trip_refinement",
    verticals: [],
    reasonCodes: [],
    depth: "standard"
  },

  presentation: {
    schemaVersion: 1,
    presentationKind: "itinerary",
    refinement: {
      isRefinement: true,
      changes: [
        "slower_pace",
        "less_shuttle_reliance",
        "sunset_added"
      ]
    },
    primaryArtifact: {
      kind: "itinerary",
      source: "canonicalPlan"
    },
    supportingModules: [
      {
        kind: "getting_there",
        source: "travelLogistics.transport"
      },
      {
        kind: "stay_options",
        source: "travelLogistics.stays"
      }
    ],
    prosePolicy: "supplemental_only",
    ending: {
      caveat: null,
      beforeYouGo: null,
      followups: []
    }
  },

  responseId: "...",
  responseVersion: 1,
  responseRevision: 2,
  itineraryHash: "..."
}
```

`responseArtifacts` is an optional canonical-data registry for structured answer families that do not belong in `canonicalPlan` or `travelLogistics`. It stores actual comparison, requirements, access, status, cost, or recommendation data once. It is not part of the presentation manifest.

Existing responses may temporarily use `content` as the canonical source for a comparison table. New structured response artifacts should use `responseArtifacts.comparison` when that canonical contract exists.

## 4. Presentation schema

### 4.1 Presentation kinds

The v1 vocabulary is closed:

```text
plain_answer
comparison
itinerary
route_plan
flight_planning
stay_options
campground_options
requirements
access_plan
current_status
cost_summary
recommendation_list
```

`refinement` is a modifier. `mixed` is composition behavior. Neither is a valid `presentationKind` or artifact kind.

### 4.2 Normative shape

```js
{
  schemaVersion: 1,

  presentationKind:
    "plain_answer" |
    "comparison" |
    "itinerary" |
    "route_plan" |
    "flight_planning" |
    "stay_options" |
    "campground_options" |
    "requirements" |
    "access_plan" |
    "current_status" |
    "cost_summary" |
    "recommendation_list",

  refinement: {
    isRefinement: boolean,
    changes: string[]
  },

  primaryArtifact: {
    kind: PresentationKind,
    source: CanonicalSource
  },

  supportingModules: Array<{
    kind: SupportingModuleKind,
    source: CanonicalSource
  }>,

  prosePolicy:
    "full" |
    "supplemental_only" |
    "intro_only" |
    "hidden",

  ending: {
    caveat: string | null,
    beforeYouGo: string | null,
    followups: string[]
  }
}
```

### 4.3 Supporting module kinds

Supporting modules reuse the visual vocabulary where useful and add only compact compositional roles:

```text
getting_there
flight_planning
route_plan
stay_options
campground_options
requirements
access_plan
current_status
cost_summary
recommendation_list
```

`plain_answer`, `comparison`, and `itinerary` are not supporting modules in v1. A second prose answer, table, or itinerary would compete with the primary artifact and violate the hierarchy rule.

### 4.4 Canonical source selectors

`source` is an allowlisted selector, not an arbitrary object path evaluated at runtime. v1 recognizes:

```text
content
canonicalPlan
travelLogistics.transport
travelLogistics.transport.airports
travelLogistics.transport.routeLegs
travelLogistics.stays
travelLogistics.stays.insidePark
travelLogistics.stays.gateway
travelLogistics.stays.campgrounds
travelLogistics.stays.vacationRentalHint
responseArtifacts.comparison
responseArtifacts.requirements
responseArtifacts.accessPlan
responseArtifacts.currentStatus
responseArtifacts.costSummary
responseArtifacts.recommendations
```

The source registry defines which selectors are legal for each artifact/module kind. A manifest cannot reference private server state, evidence-store records, prompt context, or an arbitrary path supplied by a model.

Selector compatibility:

| Kind | Allowed canonical sources |
|---|---|
| `plain_answer` | `content` |
| `comparison` | `responseArtifacts.comparison`; legacy-compatible `content` |
| `itinerary` | `canonicalPlan` |
| `route_plan` | `travelLogistics.transport.routeLegs` |
| `flight_planning` | `travelLogistics.transport.airports` |
| `stay_options` | `travelLogistics.stays`, `.insidePark`, `.gateway`, or `.vacationRentalHint` |
| `campground_options` | `travelLogistics.stays.campgrounds` |
| `requirements` | `responseArtifacts.requirements` |
| `access_plan` | `responseArtifacts.accessPlan` |
| `current_status` | `responseArtifacts.currentStatus` |
| `cost_summary` | `responseArtifacts.costSummary` |
| `recommendation_list` | `responseArtifacts.recommendations` |
| `getting_there` | `travelLogistics.transport` |

The client resolves selectors using a closed map. It does not use general-purpose dot-path traversal.

### 4.5 Prose policies

| Policy | Meaning |
|---|---|
| `full` | Render the complete canonical prose as the primary answer. |
| `supplemental_only` | Preserve unique direct answer, reasoning, caveats, and context; suppress prose that confidently restates the structured artifact. |
| `intro_only` | Render only the direct answer or introduction before the first structured restatement boundary. |
| `hidden` | Do not render prose in the normal UI; retain it canonically for audit or compatibility only. |

Default policies:

| Presentation kind | Default |
|---|---|
| `plain_answer` | `full` |
| `comparison` | `supplemental_only` |
| `itinerary` | `supplemental_only` |
| `route_plan` | `supplemental_only` |
| `flight_planning` | `supplemental_only` |
| `stay_options` | `supplemental_only` |
| `campground_options` | `supplemental_only` |
| `requirements` | `supplemental_only` |
| `access_plan` | `supplemental_only` |
| `current_status` | `supplemental_only` |
| `cost_summary` | `supplemental_only` |
| `recommendation_list` | `supplemental_only` |

The frontend may use safe AST-level matching to implement the selected policy. It may not silently promote `supplemental_only` to `hidden` when confidence is low. When deduplication is uncertain, preserve prose.

## 5. Schema invariants

Validation must enforce all of the following:

1. `schemaVersion` is exactly `1`.
2. `presentationKind` is in the closed v1 vocabulary.
3. Exactly one `primaryArtifact` exists.
4. `primaryArtifact.kind === presentationKind`.
5. `primaryArtifact.source` is allowed for its kind.
6. `supportingModules` contains zero to three entries.
7. Every supporting module source is allowed for its kind.
8. A supporting module kind appears at most once.
9. The primary kind cannot also appear as a supporting module.
10. A source selector must resolve to compatible canonical data at finalization time.
11. `refinement.isRefinement === false` requires an empty `changes` array.
12. `refinement.isRefinement === true` requires at least one normalized change code.
13. `refinement` never changes or relaxes artifact-kind validation.
14. `mixed` and `refinement` are invalid artifact/module kind values.
15. `plain_answer` uses `content` as its primary source.
16. `ending.followups` is bounded to three short actions.
17. Canonical data is referenced, never copied into `presentation`.
18. Available canonical data is not visible unless selected by the manifest or needed by the prose policy.
19. Live commercial claims pass the inventory validation in Section 9.
20. The manifest is deterministic for the same normalized builder inputs.

Invalid new-response manifests must fail closed before persistence. The finalizer may build a safe `plain_answer` fallback only when valid canonical prose exists and the response is not claiming structured/live functionality. Validation errors must be reason-coded and observable; they must not be exposed as raw internal errors to the user.

## 6. Deterministic server builder

### 6.1 Ownership

```text
intent
+ current request signals
+ active-trip/refinement state
+ canonicalPlan
+ travelLogistics needs and fulfilled slices
+ responseArtifacts
+ evidence metadata
+ inventory capability
             |
             v
presentationManifestBuilder (pure)
             |
             v
validated presentation manifest
```

The builder is deterministic application logic. It must not:

- call a language model;
- call providers or the network;
- parse model prose to determine the primary user job;
- mutate canonical data;
- include data payloads inside the manifest;
- select modules merely because their source data exists.

Provider calls, evidence gathering, itinerary generation, and logistics assembly occur before the builder. The builder consumes normalized outcomes only.

### 6.2 Builder inputs

```js
buildPresentationManifest({
  intent,
  requestScope,
  refinement,
  canonicalPlan,
  travelLogistics,
  responseArtifacts,
  contentMetadata,
  requestedSlices,
  fulfilledSlices,
  evidenceSummary,
  inventoryCapabilities
})
```

`requestedSlices` is authoritative for screen-space demand. `fulfilledSlices` says what data is available. A slice must normally be both requested and fulfilled to become visible.

Exceptions are bounded safety modules, such as an access caveat that materially changes the feasibility of the requested primary plan. Such promotion requires a deterministic reason code and still counts toward the three-module cap.

### 6.3 Selection order

The builder applies these rules in order:

1. Resolve the dominant user job from `intent`, active-trip state, and current request scope.
2. Select exactly one compatible primary kind and source.
3. Apply the refinement modifier without changing the primary vocabulary.
4. Select only explicitly requested or safety-critical supporting modules.
5. Rank supporting modules by usefulness to the dominant job.
6. Deduplicate kinds and overlapping sources.
7. Truncate to three modules; normal target is zero to two.
8. Select `prosePolicy` from the artifact kind and canonical prose metadata.
9. Build the ending from deterministic caveat/before-you-go/follow-up rules.
10. Validate source resolution, internal consistency, and inventory safety.

### 6.4 Supporting-module priority

When more than three modules qualify:

1. Explicitly requested module.
2. Safety- or feasibility-critical module.
3. Module required to execute the primary artifact.
4. Strong preference match.
5. General enrichment.

Ties follow stable product order:

```text
getting_there
flight_planning
route_plan
stay_options
campground_options
requirements
access_plan
current_status
cost_summary
recommendation_list
```

The builder records selection reason codes in server telemetry, not in the public manifest.

## 7. Intent and request mapping

Intent alone is not sufficient for every decision. The builder combines it with structured verticals, requested slices, active-trip state, and canonical results.

| User job / structured signal | Primary presentation | Typical source | Optional requested support |
|---|---|---|---|
| General or factual answer | `plain_answer` | `content` | `current_status`, `requirements` only when central |
| Compare | `comparison` | `responseArtifacts.comparison` or legacy `content` | `cost_summary`, `recommendation_list` |
| Simple/full trip plan | `itinerary` | `canonicalPlan` | getting there, flights, stays, requirements; max 3 |
| Trip refinement | Prior/revised dominant kind, commonly `itinerary` | Same revised canonical source | Only still-requested supports |
| Driving distance / road trip | `route_plan` | `travelLogistics.transport.routeLegs` | `current_status`, `access_plan` |
| Airport / flight strategy | `flight_planning` | `travelLogistics.transport.airports` | `route_plan`, `stay_options` |
| Hotel/lodge/vacation-rental guidance | `stay_options` | `travelLogistics.stays` | getting there, requirements |
| Campground choice | `campground_options` | `travelLogistics.stays.campgrounds` | requirements, access plan |
| Permit/reservation/entrance requirement | `requirements` | `responseArtifacts.requirements` | current status, campground options |
| Parking/shuttle/operational access | `access_plan` | `responseArtifacts.accessPlan` | current status, route plan |
| Current weather/conditions/alerts | `current_status` | `responseArtifacts.currentStatus` | access plan |
| Fees or trip budget | `cost_summary` | `responseArtifacts.costSummary` | requirements |
| Destination/place recommendations | `recommendation_list` | `responseArtifacts.recommendations` | route, stays |

Current classifier intents that cover more than one job require request-slice disambiguation. For example, `permit_camping` maps to `campground_options` for a campground-choice question and to `requirements` for permit/reservation rules. `transport` maps to `route_plan` for drive-time questions and `access_plan` for parking/shuttle questions.

For mixed requests, an explicit trip-planning request with a canonical itinerary normally wins as the primary artifact. Explicit flight, stay, campground, permit, or access requests become compact supporting modules. No `mixed` value is emitted.

## 8. Evidence semantics

Evidence status belongs to canonical claims, rows, or items:

```text
confirmed_current
official_guidance
estimated
not_verified
```

Examples:

```js
{
  name: "BZN to North Entrance",
  durationMinutes: 95,
  evidenceStatus: "estimated"
}

{
  requirement: "Half Dome permit",
  required: true,
  evidenceStatus: "official_guidance"
}
```

Semantics:

| Status | Meaning | UI expectation |
|---|---|---|
| `confirmed_current` | Retrieved from a current authoritative or live source within policy freshness. | Show a subtle current/checked cue and retrieval context where useful. |
| `official_guidance` | Stable or general guidance from an official source; not a live availability claim. | Show official-source cue when it affects trust or action. |
| `estimated` | Derived, modeled, ranged, or route-time estimate. | Label the estimate near the value. |
| `not_verified` | Relevant but not confirmed for the user's exact date/request. | State that it was not checked or must be verified. |

There is no `presentation.confidence` field in v1. A whole-answer badge may summarize source activity for compatibility, but it cannot replace item-level evidence state.

## 9. Commercial inventory safety

### 9.1 Inventory mode

Every canonical commercial-inventory artifact or slice declares:

```text
inventoryMode: "planning" | "live"
```

`planning` allows:

- airport recommendations and ground-transfer strategy;
- gateway towns and lodging areas;
- named official park lodges from an authoritative catalog;
- campground planning and reservation guidance;
- vacation-rental area suggestions;
- general airfare strategy.

`planning` does not allow UI that appears to represent retrieved commerce, including:

- current dollar prices or fares;
- remaining room/site counts;
- dated flight schedule rows presented as retrieved options;
- current availability labels;
- property inventory presented as a current listing feed;
- `Book now` or equivalent transactional CTAs.

### 9.2 Live provenance

`live` rows require provenance sufficient to prove retrieval:

```js
{
  provider: "...",
  sourceType: "live_inventory",
  fetchedAt: "ISO-8601 timestamp",
  sourceUrl: "..." | null,
  requestId: "..." | null
}
```

At least `provider`, `sourceType`, and `fetchedAt` are required. Any booking/deep link must also be attributable to the retrieved row or authoritative source.

### 9.3 Validation flow

```text
price / availability / dated listing / commercial CTA
                         |
                         v
              inventoryMode === live?
                   |             |
                  no            yes
                   |             |
                reject     provenance valid?
                                 |       |
                                no      yes
                                 |       |
                              reject   render
```

The canonical-data validator rejects unsafe live claims. The finalizer may downgrade to a planning-safe response only by removing the unsupported commercial fields and adding an explicit not-verified caveat. It must never relabel unsupported live data as an estimate.

The frontend performs a second fail-closed check and suppresses invalid commercial rows. Frontend suppression is defense in depth, not the primary safety boundary.

## 10. Frontend `TrailieResponse` contract

### 10.1 Rendering flow

```text
canonical response
       |
       v
validate/normalize presentation
       |
       +-- presentation absent? --> inferLegacyPresentation()
       |
       v
resolve allowlisted sources
       |
       v
render prose according to prosePolicy
       |
       v
render exactly one primary artifact
       |
       v
render 0-3 ordered supporting modules
       |
       v
render ending and utility actions
```

The renderer must not independently render `travelLogistics` or `canonicalPlan` outside the manifest path for new responses.

### 10.2 Component responsibilities

```text
TrailieResponse
|- TrailieIntro / supplemental prose
|- PrimaryArtifact
|  |- PlainAnswer
|  |- ComparisonTable
|  |- ItineraryTimeline
|  |- RoutePlan
|  |- FlightPlanning
|  |- StayOptions
|  |- CampgroundOptions
|  |- RequirementsChecklist
|  |- AccessPlan
|  |- CurrentStatus
|  |- CostSummary
|  `- RecommendationList
|- SupportingModules (0-3 compact variants)
|- Caveat / Plan B
|- BeforeYouGo
|- Followups
`- UtilityActions
```

Primary and supporting variants may share data-rendering primitives, but supporting variants are visually compact and cannot introduce a second dominant surface.

### 10.3 Prose handling

- `full`: render canonical content without artifact-restatement suppression.
- `supplemental_only`: use AST-level matching to remove only confidently matched restatement blocks.
- `intro_only`: stop at the first confidently identified artifact restatement boundary.
- `hidden`: omit prose from visible answer content.
- Never use brittle regular expressions over rendered HTML.
- Never remove unmatched safety, caveat, recommendation, or source context.
- During streaming, prefer preserving prose until a stable artifact and final policy are available; avoid visible delete/reflow where possible.

### 10.4 Accessibility and responsive behavior

- Every artifact and module has a semantic region label.
- Tables remain horizontally scrollable only where needed on small screens.
- Timelines/routes have a readable linear text order without relying on connector graphics.
- Evidence state is not communicated by color alone.
- Status, requirements, cost, and commercial availability labels remain readable to assistive technology.
- Follow-up actions are real buttons with explicit labels.

## 11. Persistence, restore, streaming, sharing, and demos

### 11.1 Persisted fields

Every new assistant response persists:

```text
content
canonicalPlan
travelLogistics
responseArtifacts
intent
presentation
responseId
responseVersion
responseRevision
itineraryHash (when applicable)
```

The manifest and every referenced canonical object must belong to the same response/revision identity. A manifest from revision 1 cannot point at a revision 2 plan.

### 11.2 Restore

Restore reads and validates persisted `presentation`. It does not reclassify new responses from prose. If a persisted manifest is invalid or references missing data:

1. record a reason-coded compatibility event;
2. use the bounded legacy projection;
3. never fabricate the missing artifact;
4. retain the original canonical content and data.

### 11.3 Legacy compatibility

```text
legacy response without presentation
               |
               v
inferLegacyPresentation()
               |
               v
ephemeral v1-compatible view model
               |
               v
TrailieResponse
```

Compatibility inference may use existing fields such as canonical plan presence, travel-logistics presence, stored intent/presentationKind, and a Markdown table. It is not persisted back automatically and is not used for new responses.

Legacy priority:

1. Valid stored legacy presentation hint.
2. Canonical itinerary present -> `itinerary`.
3. Comparison table present -> `comparison`.
4. Requested/visible travel logistics -> compatible logistics artifact.
5. Otherwise -> `plain_answer`.

### 11.4 Streaming

- The terminal response carries the authoritative manifest.
- If an early artifact is revealed, its provisional presentation metadata must carry the same response/revision identity.
- A later revision replaces the prior manifest atomically with its canonical data.
- The client must not combine a newer manifest with older artifact data.
- Prose deduplication reaches its final state only after the authoritative artifact/policy is known.

### 11.5 Shared conversations and demo playback

Shared/restored conversations and demo playback consume the same canonical envelope and `TrailieResponse`. Demo fixtures store the manifest rather than maintaining a separate handcrafted layout vocabulary. Legacy fixtures may use the compatibility projection during migration.

## 12. Failure handling and observability

Reason-coded validation failures should include at least:

```text
presentation_schema_version_invalid
presentation_kind_invalid
presentation_primary_missing
presentation_primary_kind_mismatch
presentation_source_invalid
presentation_source_missing
presentation_support_limit_exceeded
presentation_support_duplicate
presentation_refinement_invalid
presentation_inventory_mode_invalid
presentation_live_provenance_missing
presentation_commercial_claim_unsafe
presentation_revision_mismatch
```

Telemetry records:

- builder version;
- selected primary kind;
- selected supporting kinds;
- selection reason codes;
- prose policy;
- compatibility projection usage;
- validation/fallback reason;
- no raw private prompt or evidence-store content.

A manifest failure must not fail an otherwise safe plain-answer response. It must fail the unsafe structured/live claim closed.

## 13. Example manifests

The examples omit unchanged canonical data and identity fields for readability.

### 13.1 Exact demo Q1: comparison

Prompt: "I have 3 days in late September. Should I choose Yosemite or Sequoia for easy hikes, photography, and fewer crowds? Pick one and explain why."

```js
{
  intent: { primaryIntent: "compare", verticals: ["parks"] },
  presentation: {
    schemaVersion: 1,
    presentationKind: "comparison",
    refinement: { isRefinement: false, changes: [] },
    primaryArtifact: {
      kind: "comparison",
      source: "responseArtifacts.comparison"
    },
    supportingModules: [],
    prosePolicy: "supplemental_only",
    ending: {
      caveat: null,
      beforeYouGo: "Check current road, trail, and weather conditions for your late-September dates.",
      followups: ["Plan the winner", "Compare costs", "Try another park"]
    }
  }
}
```

### 13.2 Exact demo Q2: logistics/access contingency

Prompt: "I'm visiting Glacier with only one full day. What should I prioritize, and what's a good backup plan if Logan Pass access or parking doesn't work out?"

The dominant job is an operational priority plus an explicit access contingency, so
`access_plan` is primary. The access-plan artifact contains the priority, trigger,
and independent fallback; it may reference itinerary stop identities without copying
the canonical plan.

```js
{
  intent: { primaryIntent: "simple_itinerary", verticals: ["activities", "transport"] },
  presentation: {
    schemaVersion: 1,
    presentationKind: "access_plan",
    refinement: { isRefinement: false, changes: [] },
    primaryArtifact: {
      kind: "access_plan",
      source: "responseArtifacts.accessPlan"
    },
    supportingModules: [],
    prosePolicy: "supplemental_only",
    ending: {
      caveat: "Use the independent backup if Logan Pass access or parking is unavailable.",
      beforeYouGo: "Check same-day road, parking, shuttle, weather, and park alerts.",
      followups: ["Make the backup primary", "Add drive times"]
    }
  }
}
```

The builder chooses this from the structured request scope and canonical access-plan
outcome, not from prompt wording alone. A conventional day-by-day request for the
same destination would instead use `itinerary` as primary and could use
`access_plan` as a supporting module.

### 13.3 Exact demo Q3: itinerary

Prompt: "Plan a relaxed weekend at Valley of Fire from Las Vegas with easy hikes, sunset spots, and minimal rushing."

```js
{
  intent: { primaryIntent: "simple_itinerary", verticals: ["activities", "transport"] },
  presentation: {
    schemaVersion: 1,
    presentationKind: "itinerary",
    refinement: { isRefinement: false, changes: [] },
    primaryArtifact: { kind: "itinerary", source: "canonicalPlan" },
    supportingModules: [
      { kind: "getting_there", source: "travelLogistics.transport" }
    ],
    prosePolicy: "supplemental_only",
    ending: {
      caveat: null,
      beforeYouGo: "Confirm current park hours, heat conditions, and road status.",
      followups: ["Make it even slower", "Add places to stay"]
    }
  }
}
```

The getting-there module appears only if Las Vegas transport was an explicitly
requested and fulfilled slice. Its internal availability alone is insufficient.

### 13.4 Exact demo Q5: itinerary refinement

Prompt: "Actually make it more relaxed, avoid shuttle-heavy parts if possible, and add one good sunset spot."

```js
{
  intent: { primaryIntent: "trip_refinement", verticals: ["activities", "transport"] },
  presentation: {
    schemaVersion: 1,
    presentationKind: "itinerary",
    refinement: {
      isRefinement: true,
      changes: ["slower_pace", "less_shuttle_reliance", "sunset_added"]
    },
    primaryArtifact: { kind: "itinerary", source: "canonicalPlan" },
    supportingModules: [
      { kind: "access_plan", source: "responseArtifacts.accessPlan" }
    ],
    prosePolicy: "supplemental_only",
    ending: {
      caveat: null,
      beforeYouGo: "Check current shuttle operations and trail access.",
      followups: ["Reduce walking more", "Change the sunset stop"]
    }
  }
}
```

The refinement modifier changes the heading/change summary, not the artifact vocabulary.

### 13.5 General factual question

Prompt: "Is September a good time to visit Yosemite?"

```js
{
  intent: { primaryIntent: "general_qa", verticals: ["seasonality"] },
  presentation: {
    schemaVersion: 1,
    presentationKind: "plain_answer",
    refinement: { isRefinement: false, changes: [] },
    primaryArtifact: { kind: "plain_answer", source: "content" },
    supportingModules: [],
    prosePolicy: "full",
    ending: {
      caveat: null,
      beforeYouGo: "Check current road and trail conditions for your exact dates.",
      followups: ["Plan a September trip", "Compare another month"]
    }
  }
}
```

### 13.6 Driving-distance question

Prompt: "How far is Denver to Rocky Mountain National Park?"

```js
{
  intent: { primaryIntent: "transport", verticals: ["transport"] },
  presentation: {
    schemaVersion: 1,
    presentationKind: "route_plan",
    refinement: { isRefinement: false, changes: [] },
    primaryArtifact: {
      kind: "route_plan",
      source: "travelLogistics.transport.routeLegs"
    },
    supportingModules: [],
    prosePolicy: "supplemental_only",
    ending: {
      caveat: "Travel time can change with traffic, weather, and entrance congestion.",
      beforeYouGo: null,
      followups: ["Add another stop", "Plan a day trip"]
    }
  }
}
```

### 13.7 Flight-planning question

Prompt: "What airport should I fly into for Yellowstone?"

```js
{
  intent: { primaryIntent: "flight_strategy", verticals: ["flights", "transport"] },
  presentation: {
    schemaVersion: 1,
    presentationKind: "flight_planning",
    refinement: { isRefinement: false, changes: [] },
    primaryArtifact: {
      kind: "flight_planning",
      source: "travelLogistics.transport.airports"
    },
    supportingModules: [
      { kind: "route_plan", source: "travelLogistics.transport.routeLegs" }
    ],
    prosePolicy: "supplemental_only",
    ending: {
      caveat: "No live airfare or flight inventory was checked.",
      beforeYouGo: "Compare airfare and rental-car cost together before booking.",
      followups: ["Plan from BZN", "Compare airport drives"]
    }
  }
}
```

The referenced airport slice has `inventoryMode: "planning"`; therefore no fare, schedule, availability, or booking rows can render.

### 13.8 Hotel/lodging question

Prompt: "Where should I stay in Yellowstone?"

```js
{
  intent: { primaryIntent: "lodging_strategy", verticals: ["lodging"] },
  presentation: {
    schemaVersion: 1,
    presentationKind: "stay_options",
    refinement: { isRefinement: false, changes: [] },
    primaryArtifact: { kind: "stay_options", source: "travelLogistics.stays" },
    supportingModules: [],
    prosePolicy: "supplemental_only",
    ending: {
      caveat: "Live room prices and availability were not checked.",
      beforeYouGo: "Verify availability and cancellation terms with the lodging provider.",
      followups: ["Prioritize less driving", "Show gateway areas"]
    }
  }
}
```

Vacation-rental questions use the same family but may reference `travelLogistics.stays.vacationRentalHint`. Planning mode allows area/search guidance, never invented properties.

### 13.9 Campground question

Prompt: "Where can I camp in Yosemite?"

```js
{
  intent: { primaryIntent: "permit_camping", verticals: ["campgrounds"] },
  presentation: {
    schemaVersion: 1,
    presentationKind: "campground_options",
    refinement: { isRefinement: false, changes: [] },
    primaryArtifact: {
      kind: "campground_options",
      source: "travelLogistics.stays.campgrounds"
    },
    supportingModules: [
      { kind: "requirements", source: "responseArtifacts.requirements" }
    ],
    prosePolicy: "supplemental_only",
    ending: {
      caveat: "Live campsite availability was not checked.",
      beforeYouGo: "Verify operating season, reservation rules, and site restrictions.",
      followups: ["Prioritize Valley access", "Filter for RVs"]
    }
  }
}
```

### 13.10 Permit/reservation question

Prompt: "Do I need reservations for Yosemite?"

```js
{
  intent: { primaryIntent: "permit_camping", verticals: ["permits", "reservations"] },
  presentation: {
    schemaVersion: 1,
    presentationKind: "requirements",
    refinement: { isRefinement: false, changes: [] },
    primaryArtifact: {
      kind: "requirements",
      source: "responseArtifacts.requirements"
    },
    supportingModules: [],
    prosePolicy: "supplemental_only",
    ending: {
      caveat: "Date-specific entrance and activity rules can change.",
      beforeYouGo: "Confirm entrance rules, activity permits, and lodging or camping separately.",
      followups: ["Check Half Dome rules", "Plan without Half Dome"]
    }
  }
}
```

### 13.11 Current weather/status question

Prompt: "What's the weather at Glacier this weekend?"

```js
{
  intent: { primaryIntent: "general_qa", verticals: ["weather"] },
  presentation: {
    schemaVersion: 1,
    presentationKind: "current_status",
    refinement: { isRefinement: false, changes: [] },
    primaryArtifact: {
      kind: "current_status",
      source: "responseArtifacts.currentStatus"
    },
    supportingModules: [],
    prosePolicy: "supplemental_only",
    ending: {
      caveat: "Conditions can change quickly, especially at higher elevations.",
      beforeYouGo: "Recheck the forecast and park alerts before departure.",
      followups: ["Adjust my plan", "Show road impacts"]
    }
  }
}
```

### 13.12 Mixed itinerary + flights + stay

Prompt: "Plan me five days in Yellowstone from Chicago, tell me where to fly, where to stay, and what reservations I need."

```js
{
  intent: {
    primaryIntent: "full_trip",
    verticals: ["activities", "flights", "transport", "lodging", "reservations"]
  },
  presentation: {
    schemaVersion: 1,
    presentationKind: "itinerary",
    refinement: { isRefinement: false, changes: [] },
    primaryArtifact: { kind: "itinerary", source: "canonicalPlan" },
    supportingModules: [
      {
        kind: "flight_planning",
        source: "travelLogistics.transport.airports"
      },
      { kind: "stay_options", source: "travelLogistics.stays" },
      { kind: "requirements", source: "responseArtifacts.requirements" }
    ],
    prosePolicy: "supplemental_only",
    ending: {
      caveat: "No live airfare, room pricing, or availability was checked.",
      beforeYouGo: "Verify transport, lodging, entrance, and activity reservations for your exact dates.",
      followups: ["Make it more relaxed", "Reduce driving", "Choose gateway stays"]
    }
  }
}
```

No route, campground, weather, or cost module appears merely because related backend data exists.

## 14. Testing strategy

### 14.1 Server unit tests

- Every presentation kind accepts its allowed source and rejects incompatible sources.
- Primary kind mismatch fails.
- Missing or multiple primaries fail.
- Supporting-module cap and duplicate rules fail deterministically.
- Refinement codes and modifier behavior validate.
- Same normalized inputs produce byte-equivalent normalized manifests.
- Available-but-unrequested logistics never become modules.
- Requested-but-unfulfilled slices produce a caveat or safe prose fallback, not empty cards.
- Mixed requests select one primary and at most three supports in stable order.
- `permit_camping` and `transport` disambiguate from structured request slices.
- Unsafe commercial fields fail in planning mode.
- Live mode without valid provenance fails.
- Valid live mode with provenance passes.
- Manifest/canonical revision mismatches fail.

### 14.2 Mapping golden tests

Golden tests cover all examples in Section 13, including exact Q1, Q2, Q3, and Q5 prompts. Tests assert artifact hierarchy and sources, not prose wording generated by a model.

### 14.3 Frontend component tests

- Exactly one primary artifact renders.
- Only manifest-selected supporting modules render.
- Hidden available logistics do not render.
- All four prose policies behave conservatively.
- AST deduplication removes a confident itinerary/table restatement once.
- Uncertain content is preserved.
- Evidence statuses render adjacent to the relevant row/item.
- Invalid live rows are suppressed fail-closed.
- Mobile comparison and route layouts remain accessible.
- Follow-up actions invoke the existing surface adapter.

### 14.4 Persistence and lifecycle tests

- Authenticated and anonymous messages persist intent, manifest, sources, and identity.
- Stream terminal, non-stream terminal, restore, share, and demo paths produce the same presentation.
- Revision replacement is atomic.
- Restore never combines a manifest with the wrong plan/logistics revision.
- Legacy response projection remains bounded and stable.
- New responses do not call `inferLegacyPresentation()`.

### 14.5 End-to-end acceptance

For each example:

- answer hierarchy matches the user's job;
- no duplicate itinerary/table/logistics restatement appears;
- no more than three supporting modules appear;
- current/estimated/not-verified states are understandable;
- planning-only commercial answers cannot look live or bookable;
- refresh and shared/demo rendering preserve the same semantics.

## 15. Rollout and compatibility

1. Add schema, source registry, validator, and pure builder behind a disabled flag.
2. Build manifests in shadow mode and compare against current rendering without changing UI.
3. Persist valid manifests additively while legacy clients ignore the field.
4. Teach the shared `TrailieResponse` to prefer valid manifests and fall back to legacy projection.
5. Enable by response cohort/surface after mapping and restore parity pass.
6. Remove independent prose -> travel logistics -> itinerary composition only after all live, restore, share, and demo paths use the shared renderer.
7. Keep legacy projection for historical messages; do not backfill by guessing and overwriting stored records.

Rollback disables manifest-preferred rendering while retaining additive persisted fields. Canonical plan/logistics data and old clients remain compatible.

## 16. Acceptance criteria

The design is ready for implementation planning when the user approves this written spec and the following statements are unambiguous:

- `intent` and `presentation` are siblings.
- The server deterministically authors the manifest without model involvement.
- The manifest describes visibility, role, order, and prose behavior only.
- Canonical response data is stored once and referenced through allowlisted selectors.
- There is exactly one primary artifact and at most three supporting modules.
- `primaryArtifact.kind` always equals `presentationKind`.
- Refinement is a modifier; mixed is composition behavior.
- Available data is not automatically visible.
- Evidence status remains claim-level.
- Commercial live claims require live inventory mode and valid provenance.
- New-response persistence includes intent, presentation, canonical data, and response/revision identity.
- Legacy inference is compatibility-only.
- All requested examples fit naturally under the same contract.

## 17. Explicitly deferred implementation decisions

The implementation plan may choose file boundaries and rollout flag names, but it must not reopen the product contract above. It must identify the canonical schemas needed for `responseArtifacts.comparison`, `requirements`, `accessPlan`, `currentStatus`, `costSummary`, and `recommendations` before enabling those shapes. Until a canonical structured artifact exists, the only approved compatibility exception is a comparison table sourced from `content`.

No implementation, provider call, migration, deployment, or live validation is authorized by this design document.
