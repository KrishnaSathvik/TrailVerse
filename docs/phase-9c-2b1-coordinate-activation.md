# Phase 9C.2B1 — authoritative stop-coordinate activation

## Production wiring

The existing V2 route bridge now supplies
`buildProductionGeoCoordinateResolver({ dispatchEphemeral })` from the runtime
singleton. Validation invokes it after `resolveStopIdentities` and before
finalization. Request ID, generation attempt, model dispatch index, turn signal
and the frozen evidence bundle are threaded through the existing artifact seam.

The default provider list adds `geocode_coordinate`. Its supports contract
accepts only `stop_coordinates`, absent from current EvidencePlanner policies.
It also declares `ephemeralOnly`; ordinary broker selection excludes such
providers. Persistent query, lease, coverage and bundle behavior is otherwise
unchanged. Coordinate candidates never enter that pipeline.

## Identity and authority

The original eligibility gate is unchanged: experiential, evidenceRef plus
canonicalPlaceName, and no existing authoritative coordinate source.

For production dispatch the resolver verifies the exact evidence binding against
the frozen bundle. It builds the query from the bound canonical name and park
context from that evidence, a same-entity destination profile, or the existing
NPS park-name catalog. Candidate-authored park names, stop-name flourishes and
tool coordinates are not corroboration inputs. A missing binding fails before
dispatch.

The existing geocodeAuthorityPolicy is unchanged:
- Curated known places remain authoritative.
- Google requires specific-place corroboration and passes the conflicting-park veto.
- Open-Meteo and unknown sources remain non-authoritative for POIs.

Google's adapter no longer substitutes the query when its returned address is
absent: echoed input cannot supply provider corroboration.

Accepted coordinates and coordinateSource decorate only the copied itinerary.
Rejected/no-result/failure outcomes leave grounded identity intact and never
promote tool coordinates. The existing map-authority projection recognizes the
accepted geocoder/catalog sources.

## Ownership, cancellation and cache

Each ephemeral call carries opaque attempt, dispatchIndex and
fingerprintCandidateStops ownership. The resolver checks returned ownership;
the artifact checks its original candidate fingerprint before returning a copy;
execution checks it again before applying the artifact.

The turn AbortSignal reaches the broker's shared controller, provider adapter,
geocodePlace and both node-fetch calls. Abort checks before fallback, after body
parsing and before cache writes prevent late acceptance or new fallback work.
An abort after an earlier stop resolved discards all new coordinates for that
attempt. Coalesced callers retain independent ownership and copies.

The existing 200-entry, seven-day cache remains. Cache results still pass current
authority checks and receive current caller ownership. Cancelled results are not
cached. The ephemeral provider opts into bounded failure reporting so exhausted
network failures are distinguishable from clean no-results; other service
callers retain their existing failure-return behavior.

## Observability

Internal telemetrySummary.coordinateResolution, also forwarded by
summarizeV2Telemetry, contains only aggregate counts:
eligibleStops, dispatches, authoritative, rejectedByAuthority, noResult,
providerFailure and cancelled. Dispatches count actual ephemeral invocations,
including coalesced callers; physical fetch accounting remains in broker events.
Counts accumulate across validations/retries, not unique places across a turn.

No raw query, address, provider payload or reviewer identifier is included in
these counts. Refresh events retain A2 accounting with persistedCandidateCount
zero. Frozen evidence and its fingerprint are not modified.

## Phase boundary

No route dispatch, route fingerprints, travel-edge attachment, driving-authority
activation or map visual changes were added. No live providers/models, commits,
pushes or deployments were used.

Ready for one separately authorized, bounded coordinate-only live acceptance.
That acceptance should inspect grounded eligibility, corroboration, map authority
and zero new route requests before proceeding to 9C.2B2.

## Validation

Broad backend regressions: 79 suites passed; 1,057 tests passed, two existing
opt-in replica-set persistence tests skipped. Coverage includes the broker,
persistent evidence, adapters, identity/authority, artifacts, V2 execution,
named experiences, travel edges and canonical persistence.

Frontend map projection: 15 tests passed. Restoration and itinerary persistence:
31 tests passed. No frontend source changes were needed.

Final focused production-wiring, activation/cancellation, broker and execution
rerun: 12 suites and 155 tests passed. Provider-disabled test summaries
confirmed zero live model constructors, live provider dispatches and external
provider HTTP requests.
