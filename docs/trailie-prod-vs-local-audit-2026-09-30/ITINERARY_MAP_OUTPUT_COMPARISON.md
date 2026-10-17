# Itinerary, map and travel-plan output contract

## Production: what Claude produces, backend converts, frontend renders

| Stage | Exact behavior | Weakness |
| --- | --- | --- |
| Claude on website SSE | Markdown travel narrative plus `[ITINERARY_JSON]` with days/stops and auxiliary trip fields | Prose and JSON are separate model-authored representations |
| Claude on nonstream architect | May call `create_itinerary`; text/JSON fallback remains | Output tool is not the SSE path |
| Backend | Extract marker/tool JSON; optionally use Haiku to extract missing JSON; validate/correct stops; optionally regenerate; enrich drives; review/repair; build plan document | Multiple transformations can diverge from initial prose; failed reviewer can pass |
| Chat | Render streamed Markdown while hiding JSON artifacts; final payload can replace text | Visible draft may differ from final accepted plan |
| Itinerary UI | Uses `days[].stops[]` for builder/day/stop cards | Client can also rebuild/save plan payload |
| Map | Numeric lat/lon → markers; Google Directions across stops; fallback straight connectors | Estimated coordinates can become authoritative-looking geometry |

Sources: [server/src/services/aiProviderStream.js:1 (production)](https://github.com/KrishnaSathvik/TrailVerse/blob/324faaaf68334db41ded82b8d8c777f6fd5de76a/server/src/services/aiProviderStream.js#L1); [server/src/routes/ai.js:2068 (production)](https://github.com/KrishnaSathvik/TrailVerse/blob/324faaaf68334db41ded82b8d8c777f6fd5de76a/server/src/routes/ai.js#L2068); [next-frontend/src/components/plan-ai/TripPlannerChat.jsx:1588 (production)](https://github.com/KrishnaSathvik/TrailVerse/blob/324faaaf68334db41ded82b8d8c777f6fd5de76a/next-frontend/src/components/plan-ai/TripPlannerChat.jsx#L1588); [next-frontend/src/components/itinerary/ItineraryMapView.jsx:250 (production)](https://github.com/KrishnaSathvik/TrailVerse/blob/324faaaf68334db41ded82b8d8c777f6fd5de76a/next-frontend/src/components/itinerary/ItineraryMapView.jsx#L250).

The buddy prompt's output contract asks for per-stop names, times, durations, coordinates, difficulty, hiking distance/elevation, why-this-stop, alternatives, drive minutes, booking/permit information, and trip highlights/packing/cost/access. It **allows estimating coordinates**; the fallback extractor repeats that permission. The map verifies numeric availability, not source identity. That helps artifacts appear readily while leaving geographic reliability unresolved. [server/src/prompts/claudeBuddyPrompt.js:239 (production)](https://github.com/KrishnaSathvik/TrailVerse/blob/324faaaf68334db41ded82b8d8c777f6fd5de76a/server/src/prompts/claudeBuddyPrompt.js#L239); [server/src/routes/ai.js:2092 (production)](https://github.com/KrishnaSathvik/TrailVerse/blob/324faaaf68334db41ded82b8d8c777f6fd5de76a/server/src/routes/ai.js#L2092).

Production also tells Claude to describe local edits rather than regenerate an existing itinerary unless explicitly requested. A helpful chat refinement is therefore not proof that map and saved plan changed. Keep the useful day narrative, practical logistics and discoverable itinerary/map surfaces, not the split source of truth.

## Local: canonical intent with incomplete end-to-end production

The simple mutation schema intentionally narrows new plans to `intro` and `days`; days contain ID, day number, label and stops. Stop fields include identity reference, name, note, why, timing, duration, coordinates, selected difficulty/mobility fields and drive minutes. Much of the rich current UI's contract is not emitted: no new-plan narrative sections, overnight-location contract, structured requirements, alternatives, activity groups or transfer edges. Full legacy schema availability elsewhere does not make those fields supported here. [server/src/services/trailieSimpleGuard.js:19 (local)](../../server/src/services/trailieSimpleGuard.js).

The guard binds stop names/identity to retrieved evidence, removes model-authored measurements/coordinates, copies source values, and binds route time to retrieved route evidence. After validation the backend creates canonical response/plan identities, persists them, and returns the final envelope. The frontend uses canonical plan content rather than inferring an itinerary from prose. This is the right ownership direction. [server/src/services/trailieSimpleRuntime.js:57 (local)](../../server/src/services/trailieSimpleRuntime.js); [server/src/services/trailieSimpleStore.js:25 (local)](../../server/src/services/trailieSimpleStore.js).

### Three independent breaks in the artifact chain

1. **No available plan-proposal slot after dependent research.** Stop evidence → route evidence → mutation requires three tool-enabled stages; local permits only the first two. See [loop comparison](MODEL_TOOL_LOOP_COMPARISON.md).
2. **Coordinate normalization mismatch.** NPS named activities return `claim.normalizedValue.coordinates`, but simple tool endpoints and guard copying read flat lat/lon. The claim is not flattened by materialization. Even retrieved positions can disappear from the accepted stop.
3. **Map provenance and edges are not produced.** `buildTripMapModel` requires `coordinateSource` in `resolved_metadata`, `geocoder`, `stored`, or `trailverse_catalog` to plot a pin. The simple schema omits that field and the guard/store do not add it. New simple plans also omit `travelEdges` and `activityGroups`; the canonical map intentionally does not invent connectors from adjacency.

Sources: [server/src/services/providers/npsEvidenceProvider.js:317 (local)](../../server/src/services/providers/npsEvidenceProvider.js); [server/src/services/trailieSimpleTools.js:74 (local)](../../server/src/services/trailieSimpleTools.js); [server/src/services/trailieSimpleGuard.js:199 (local)](../../server/src/services/trailieSimpleGuard.js); [next-frontend/src/lib/itineraryMapStops.js:103 (local)](../../next-frontend/src/lib/itineraryMapStops.js); [next-frontend/src/components/trailie-response/TrailieItinerary.jsx:85 (local)](../../next-frontend/src/components/trailie-response/TrailieItinerary.jsx).

These findings apply to newly created simple plans/current canonical chat map. Existing plans may carry old provenance/edges, and unchanged patch days preserve their old fields. The separate itinerary workspace still has its own map component; not every map surface has identical admission rules.

### “Accepted plan” does not mean “complete travel experience”

Basic canonical acceptance requires some non-draft day with a traveler stop. The simple guard checks identity, selected hard constraints, route existence, source duration maximums and a 24-hour upper bound. It does not establish that every day is well-composed, that timing includes meals/rest/logistics, or that an overnight base is coherent. The retired qualitative machinery should not be reintroduced wholesale, but its absence leaves a product requirement to address through plan construction and a clear presentation contract. [server/src/utils/canonicalPlanAcceptance.js:65 (local)](../../server/src/utils/canonicalPlanAcceptance.js).

Mutation answers also pass a 2,000-character string guard while ordinary text answers do not. This undocumented difference can reject an otherwise useful plan explanation. The tool schema does not tell the model about this limit.

## Final artifact contract recommendation

Use one versioned, backend-owned canonical plan for chat itinerary, map, saved trip and refinement. Preserve local response identity, write validation and CAS. Its data should include:

| Field family | Producer and meaning |
| --- | --- |
| Trip/destination/dates and traveler assumptions | Model proposes; backend preserves explicit versus assumed authority |
| Days, stable stop IDs, why and pacing | Model composes the experience; structural rules preserve IDs and edits |
| Source-backed place identity and coordinates | Provider normalization supplies one consistent shape plus approved provenance |
| Transfers versus continuous activities | Explicit relationships; verified route values where available, unknown values kept unknown |
| Timing and overnight base | Travel composition, with evidence-backed constraints and labeled estimates |
| Action-required permits/access conditions | Source-backed requirements, without converting missing information into negative claims |
| Source references and freshness | Compact traveler-facing citations; full provenance retained outside repeated prose |
| Response/version/hashes and edit scope | Canonical storage/transport contract |

Natural explanation should describe the **accepted plan**, not a competing itinerary. A draft or partial plan must be labeled as such and must not claim saved/verified completeness. Map rendering should reveal only justified geography; backend normalization must actually supply the fields that renderer requires. Remove JSON-marker scraping and model-guessed coordinates as primary artifact production mechanisms.
