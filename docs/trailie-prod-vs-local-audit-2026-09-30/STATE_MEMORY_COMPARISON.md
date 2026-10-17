# State, memory, persistence and refinement

## Production

Production combines client conversation/session context, current Quick Fill form, saved trip form/park metadata, profile favorites/visited, active destination resolution, current-message heuristics, and structured trip state. This is practical continuity, but not one authoritative durable memory contract. Trip-state precedence is profile context → saved trip → summary → form → current message. Older-history extraction uses user messages to avoid treating assistant suggestions as facts. [server/src/utils/tripStateBuilder.js:334 (production)](https://github.com/KrishnaSathvik/TrailVerse/blob/324faaaf68334db41ded82b8d8c777f6fd5de76a/server/src/utils/tripStateBuilder.js#L334); [server/src/routes/ai.js:753 (production)](https://github.com/KrishnaSathvik/TrailVerse/blob/324faaaf68334db41ded82b8d8c777f6fd5de76a/server/src/routes/ai.js#L753).

The frontend formats the current itinerary into the session prompt. Its instructions explicitly make edits **advisory**: describe what to change, let the user edit the builder, and do not regenerate unless a full replan is requested. Thus production can feel natural on refinements while not actually applying a correct canonical day mutation. [next-frontend/src/components/plan-ai/TripPlannerChat.jsx:2011 (production)](https://github.com/KrishnaSathvik/TrailVerse/blob/324faaaf68334db41ded82b8d8c777f6fd5de76a/next-frontend/src/components/plan-ai/TripPlannerChat.jsx#L2011).

When structured output is generated, `saveItineraryToTrip` uses `findByIdAndUpdate(tripId, {plan: planDoc})` with no owner predicate/version precondition at that write. The authenticated stream launches it without awaiting completion, and the frontend also auto-saves. The helper catches persistence errors without making the displayed response fail. This is a **source-level ownership and concurrency gap**; no unauthorized access test was run. [server/src/routes/ai.js:571 (production)](https://github.com/KrishnaSathvik/TrailVerse/blob/324faaaf68334db41ded82b8d8c777f6fd5de76a/server/src/routes/ai.js#L571); [server/src/routes/ai.js:2805 (production)](https://github.com/KrishnaSathvik/TrailVerse/blob/324faaaf68334db41ded82b8d8c777f6fd5de76a/server/src/routes/ai.js#L2805).

## Local

### Authoritative trip and conversation

`createSimpleTripStore.load` uses both trip ID and owner ID. The request refuses a different target unless the trip is explicitly selected. Only the latest current message is taken from the client; history comes from stored conversation. New chats start without another trip's plan or memory. The model receives full saved plan and trip `planningState`; it does not query all user trips/favorites. This is **trip memory**, not comprehensive traveler memory. [server/src/services/trailieSimpleStore.js:12 (local)](../../server/src/services/trailieSimpleStore.js); [server/src/routes/modelFirstTrailie.js:78 (local)](../../server/src/routes/modelFirstTrailie.js).

### Memory updates

The model proposes typed dates, lodging, mobility, preferences, travelers, free-form traveler facts, transportation and budget. Each update requires a verbatim quote from **this turn**. The guard checks values, calendar ordering/duration, transport vocabulary and selected hard constraints. Lodging relocation explicitly invalidates old location state. Memory is committed together with the accepted response, not written from a heuristic before the model. [server/src/services/trailieSimpleGuard.js:99 (local)](../../server/src/services/trailieSimpleGuard.js).

Limits:

- A source quote establishes that words occurred, not that the proposed fact follows from them. Hypothetical/question/negation semantics remain model-dependent.
- Ordinary prose completion does not update memory. A research failure or final prose-only slot can prevent otherwise useful memory updates.
- Profile, favorite/visited context, and automatic cross-trip retrieval from production are absent here.
- Provenance summary is replaced with the latest update batch; it is not a complete per-field event history. `travelerFacts` carries quoted entries, capped at 100.
- Quick Fill/entry context reaches the model as data, but only a current-message quote authorizes typed memory through this tool; form-only facts do not automatically become durable memory.

### Plan mutation and accepted identity

Accepted existing plans require patches. The patch machinery preserves untouched days and checks frozen-day hashes. If `metadata.editScope.dayNumbers` is supplied, changes outside it are rejected. A repository search found no `editScope` producer in the web frontend, so typical chat edits rely on model-selected patch targets, not a mechanically established requested-day scope. Guarding a proposed patch's boundaries does not independently prove the model chose the day the traveler meant. [server/src/services/trailieSimpleGuard.js:143 (local)](../../server/src/services/trailieSimpleGuard.js); [server/src/routes/modelFirstTrailie.js:74 (local)](../../server/src/routes/modelFirstTrailie.js).

The store validates canonical write candidates and response succession, then uses owner + `_id` + `updatedAt` + `__v` compare-and-swap. A competing update yields conflict and no successful result. Response IDs, versions, content hashes and itinerary hashes are carried through. The guest path uses the existing turn ledger for completion/quota/history and planning-state commit. [server/src/services/trailieSimpleStore.js:35 (local)](../../server/src/services/trailieSimpleStore.js); [server/src/services/trailieSimpleGuestStore.js:1 (local)](../../server/src/services/trailieSimpleGuestStore.js).

The browser recognizes server-owned persistence and avoids a second automatic write for that result; it retains the accepted trip ID. The simple store's optional notifier defaults to a no-op and the route does not wire one, so production's other update-notification machinery should not be assumed equivalent. [next-frontend/src/components/plan-ai/TripPlannerChat.jsx:2585 (local)](../../next-frontend/src/components/plan-ai/TripPlannerChat.jsx).

## What should survive

| Preserve | Improve without weakening |
| --- | --- |
| Owner-scoped load and commit | Explicit, reviewable target selection for cross-trip work |
| CAS, canonical identity, atomic accepted response | Handle ambiguous commit/disconnect outcomes by reading durable state rather than blind retry |
| Typed memory with source quote | Preserve per-field authority and distinguish user-confirmed facts from assumptions |
| Patch operations and untouched-day preservation | Attach structured day scope when selected in UI; clarify genuine ambiguous targets |
| Traveler correction invalidates stale geography | Normalize provider coordinates once into a shared source-backed artifact contract |
| Authoritative persisted history | Add relevant compact traveler context without injecting entire profile/trip archives |

Never restore production's success-before-save behavior merely to make local feel smoother. A useful answer and an accepted durable change are separate states the product can express clearly.
