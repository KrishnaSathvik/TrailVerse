# Trailie reliability: local implementation and acceptance gaps

## Scope

This is a local, offline-validated improvement, not production certification. No paid model requests, hosted changes, deployment, push or commit were performed for this implementation. The existing experimental conversational-streaming flag remains unchanged and default-off. Existing unrelated working-tree changes are retained.

## Implemented

- One optional **Things to Know** panel replaces separate guidance panels. Existing narrative Markdown preserves clickable links after serialization. Empty guidance is omitted.
- Model policy requests only material, trip-specific guidance, exact returned official resources, direct answers to resource questions, and explicit distinction between listings and availability. This is policy, not a guarantee that every generated sentence complies.
- Guard validation requires new or changed narrative Markdown links to appear in usable returned evidence. Unchanged prior sections remain valid without mandatory re-research. Inline links, reference definitions and HTTP(S) autolinks are checked; this is not a general-purpose prose/HTML URL sanitizer.
- RIDB no longer invents reservation URLs from facility IDs. Actual returned reservation URLs and listing URLs remain distinct; availability stays unknown. Ambiguous or mismatched recreation-area names do not produce authoritative matches.
- Region-only destination names do not match abbreviated park names. A rental car does not override a requested walking, transit, ferry or shuttle leg; explicit required modes retain precedence.
- Admitted `maxHotelChanges` constraints are checked against overnight transitions. Incomplete bases are rejected when that constraint applies. Day-count consistency also applies to patches and memory-only duration changes.
- Advice-only responses with an existing plan explicitly say the saved itinerary is unchanged. Canonical mutation/commit boundaries remain intact.
- Signup preserves the guest return context. Failed login migration retains valid guest context for retry instead of silently discarding it. Corrupt JSON cache entries are discarded separately from transport failures. Success messaging no longer prematurely claims that a trip was saved.
- Agent instructions now encode guest/auth parity, contextual guidance, ownership-safe migration and no extra mandatory model rounds.

## Integration status

| Integration | Status and evidence | Remaining limitation |
| --- | --- | --- |
| NPS and travel evidence | Existing broker/runtime reused; mocked freshness and research regressions | No live source or future operating-condition verification in this work |
| Recreation.gov / RIDB | Provider normalization tests cover exact identity and returned URLs | Listings are not inventory; no booking availability claim; strict names can produce safe misses |
| Live research | Existing bounded research path and evidence acceptance retained | Not exercised against a live provider |
| Routes / travel modes | Mode precedence and existing route-edge lifecycle regressions | Major airport/base/ferry transfers are not universally grounded in verified route edges |
| Overnight / timing constraints | Deterministic admitted hotel-limit checks; explicit transfer/departure overlap cases | Semantic extraction can still omit a constraint; base aliases are not reconciled; flight buffers/time zones need further acceptance |
| TripPlan / saved links | Existing narrative sections and canonical persistence reused | Unchanged historical guidance is preserved, not automatically reverified |
| Guest / authenticated runtime | Shared model-first tools, guards and patch engine retained | No new live guest-versus-auth answer-quality comparison |
| Guest allowance | Existing completion-coupled five-user-turn lifecycle regressions pass | Failed/cancelled attempts remain free under existing semantics; tool/model calls never consume separate turns |
| Login handoff | Transactional migration tests preserve five recorded scenario plans; idempotent same-owner retry and cross-owner rejection; frontend failure/retry coverage | These are backend integration and frontend component tests, not full browser end-to-end acceptance |

## Offline validation

- Focused server suites: 103 tests across four suites covering itinerary reliability, park identity, runtime and guest migration.
- Broader server regressions: 121 tests across 10 suites, including RIDB, broker adapters, persistence, research, migration, quota lifecycle, travel semantics, route edges and streaming routes.
- Frontend focused suites: 17 tests across three suites covering guidance, authentication and saved-trip gate.
- Frontend broader regressions: 57 tests across five suites covering rich itinerary rendering and chat smoke/retry/failure behavior.
- Provider-disabled runs report zero live provider constructors, dispatches and external provider HTTP requests. The backend test harness requires permission to bind its local in-memory MongoDB listener.
- Total: 298 tests passed across 22 suites/files. `git diff --check` passed.

## Call-count and release implications

No new orchestration stage, mandatory model call, classifier or link-generation call was added. Validation and UI changes are deterministic. New guard failures may use the existing bounded repair budget; this is not a claim that every request has identical call count or latency. No live performance measurements were taken for these changes.

Before shipping, run a real browser guest creation → scoped revision → login → same saved workspace flow, including quota exhaustion and failed migration retry. Separately authorize live source and model acceptance for route feasibility, resource precision and guest/auth parity. The general itinerary-reliability work is improved but not fully certified by these offline tests.
