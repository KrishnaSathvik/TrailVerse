# Contextual resource links — live acceptance, 2026-10-17

**Result: partial pass. Do not mark the Springdale accommodation-options check passed.** No runtime code was changed during this verification. No model calls, database writes, commits, pushes, deployments or hosted-setting changes were made.

## Results

| Check | Result |
|---|---|
| Missing RIDB campground URL → exact official page | Passed |
| Broad Springdale hotel options with useful links | Failed: Serper adapter returned zero usable results |
| Named Cable Mountain Lodge fallback | Passed: matching third-party booking page |
| Named Desert Pearl Inn fallback | Safely unresolved: no extracted page |
| Wrong resource ID / wrong destination / unextracted content | Rejected offline |
| Prices and availability | Unknown / null throughout |

Upper Pines Campground (RIDB facility 232447) returned no reservation or listing URL. Existing research independently discovered and extracted https://www.recreation.gov/camping/campgrounds/232447 and matched the resource identity. `read_travel` returned the link with no unresolved items, in approximately 3.0 seconds.

The existing Serper `lodging_strategy` query `Springdale lodging hotels near park` returned an empty adapter result. This happened before normalization. The adapter discards entries without website/link/url; the raw upstream response was not retained, so this capture cannot distinguish an empty upstream response from discarded URL-less records. No repeat discovery query was made.

Two named-hotel probes then exercised the exact-resource fallback, independently of the failed discovery step. Cable Mountain Lodge produced https://www.guestreservations.com/cable-mountain-lodge/booking. Its extracted page matched the hotel and Springdale. This is an independent third-party booking page, not the hotel's official website. Official-site candidates returned by search used HTTP and were excluded by the existing HTTPS rule; they were not silently rewritten or probed.

Desert Pearl Inn search returned Travel Weekly and Tripadvisor first. Neither produced usable extraction. The official hotel homepage was third and outside the existing two-page extraction limit. The result stayed unresolved; no page was invented or promoted from its search snippet. Both named hotel probes together took approximately 8.7 seconds. This exposes a ranking/coverage limitation, not an availability claim or justification to loosen identity validation.

## Delivery and safety verification

Live providers were invoked through the existing RIDB, Serper and Tavily adapters. Campground and exact hotel requests used the real broker and `read_travel` resource path with an in-memory destination resolver and ephemeral evidence. No model was invoked. Deterministic harness guidance containing returned URLs passed the existing link guard, conversational link filter, canonical JSON roundtrip and public export. This establishes link plumbing, not a live model's decision to include a link or a saved database itinerary.

The captured Upper Pines extraction was altered offline to use a wrong facility ID, a different park, and no successful extraction. All three were rejected. The existing resource regression suite passed all 28 tests with provider isolation counters at zero.

The actual TripGuidance component also passed **two captured-live rendering checks**: Upper Pines and Cable Mountain Lodge both rendered clickable exact URLs in a single Things to Know section, preserved the unknown-price/availability wording, and did not render Desert Pearl Inn. The temporary rendering harness was removed from the working tree after verification.

The live run made nine provider HTTP requests: two RIDB catalog requests, one Serper discovery request, and three Tavily search/extract pairs. Model calls and model cost were zero. Search/extraction provider credit charges were not measured; this was not claimed to be cost-free.

Sanitized evidence: [JSON capture](trailie-link-live-acceptance-2026-10-17.json). It includes returned links, unknown inventory fields, provider outcomes and candidate extraction status, but no keys or request headers. Raw extracted page text remains in a private temporary capture, outside release files.

## Release disposition

Feature work remains frozen. The campground fallback has live evidence; hotel discovery is not fully accepted. Release preparation can use the existing local candidate notes, but the hotel finding should be resolved or explicitly accepted before describing all checks as passed. No GitHub branch settings were changed. The required security check and review remain release workflow requirements.
