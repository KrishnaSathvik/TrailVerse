# Trailie source preservation and reserve discovery verification

Date: 2026-10-12

Status: offline verification passed; reserve discovery remains inactive and has no runtime configuration path.

## Implemented boundary

Part A retains complete normalized NPS source fields on the server-side evidence row and derives explicit current closures into operational facts. The model projection excludes the raw `sourceDetails` body, while retaining normalized access, exposure, closure, seasonality, status, and operational facts. Silence never becomes an `open` status.

Part B lets the existing final selector inspect already-retained reserve activity records only when `reserveDiscovery: true` is passed directly to the tool constructor. A reserve row is discoverable only when it is official, current, usable, and already has a resolved source-backed location. Visibility does not add it to validation evidence. If the model proposes its exact identity, the existing promotion path moves that one row into authoritative evidence without a provider or coordinate call.

The 12 KB reader admission calculation uses the model projection, so full source passages remain available server-side without consuming the model-view budget. The existing 28 KB fact ceiling remains unchanged. A separate 36 KB complete research-response ceiling removes reserve-derived facts first and never removes active facts.

## Frozen replay

The replay used the captured Zion NPS payload and all eight captured research requests. It reattached only coordinates already present in the retained frozen evidence. It made no provider, model, geocoding, or persistence calls.

| Result | Switch off | Switch on |
| --- | ---: | ---: |
| Distinct usable experiences | 4–6 | 10–12 |
| Cases with more usable experiences | — | 8/8 |
| Cases with more low-exposure experiences | — | 4/8 |
| Reserve experiences delivered | 0 | 5–7 |
| Maximum fact bytes | unchanged 28 KB ceiling | 27,952 |
| Maximum complete research response | — | 31,040 bytes |
| Maximum incremental model input | — | 17,401 bytes |
| Guard authority input changed | — | 0/8 |
| Provider work changed | — | 0/8 |
| Eager coordinate lookups | — | 0 |

The replay also confirmed that Weeping Rock remains `closed` with a `trail_closed` operational fact, cold-weather and designated-trail guidance remain in authoritative server evidence, raw source bodies do not enter model context, and no opening status is inferred from missing information.

Artifacts: `artifacts/trailie-reserve-discovery-replay-2026-10-12/replay.cjs` and `results.json`.

## Acceptance ceilings before activation

- Complete research response: at most 36,000 serialized bytes.
- Incremental full model input attributable to reserve visibility: at most 24,000 serialized bytes.
- Incremental provider-reported input tokens: at most 6,000 when a live provider reports usage.
- Correction-feedback growth: exactly 0 bytes.
- Additional coordinate lookups: exactly 0.
- Existing 28,000 fact-byte and 48-fact limits remain unchanged.

Runtime telemetry records full serialized model input for every model call, provider token usage when available, the research response size, evidence-delivery accounting, and correction-feedback bytes. Frozen replay cannot supply provider tokenizer counts, so the input-token ceiling remains a required live activation gate.

## Deterministic verification

Eight focused suites passed: 138 tests total. They cover source-based Zion fixtures, missing and ambiguous closure language, Canyonlands access requirements, a second-destination reserve fixture for Yosemite, eligibility/guard consistency, correction isolation, exact promotion, no extra provider/geocode work, and the whole-response ceiling.

No guard or itinerary-schema code changed. No live calls were made. Recovery, Pass 2, Pass 3, and final provider-hardening live verification remain separate.
