# Hotel discovery coverage — targeted local fix

## Diagnosis

The original Springdale live capture retained an empty Serper adapter result, not the upstream response. It cannot retrospectively establish whether Serper returned zero records. No new live request was made to fill that evidence gap.

Two code-level losses are established and reproduced offline:

1. The Serper adapter discarded every record without `website`, `link` or `url` before retaining its provider place identity. A name/address/ID-only lodging result therefore vanished instead of becoming a useful candidate with an unresolved link.
2. Shared web relevance checked title and snippet but not the structured address. Even a hotel with a returned URL could be rejected when its destination appeared only in its address.

Separately, the recorded Desert Pearl Inn search placed its HTTPS property homepage third. Exact-resource extraction took the first two eligible URLs, spending both slots on aggregator pages that returned no extracted content.

## Changes

Only the Serper lodging adapter and exact-resource extraction selection changed; no runtime orchestration, prompt, booking provider, frontend or account behavior changed.

Lodging discovery now requires a returned name and address containing the requested normalized destination. It retains a structured recommendation signal using the provider ID, or a deterministic name/address identity when no ID exists. This is not an independently confirmed hotel inventory record or itinerary stop. Missing or unsupported URLs remain null with `resource_link_unverified`; no URL is built from an ID. Valid provider website URLs retain preference over other returned listing URLs. Prices, reservation URLs and date-specific availability remain unknown.

Count-only `discoveryDiagnostics` now distinguish upstream count, considered/retained records, missing/unsupported URLs, missing identity, destination mismatch and truncation. They are available in adapter raw results and fetch metadata, including cache hits, without names, addresses, queries, credentials or response headers. They allow a future authorized capture to distinguish upstream emptiness from filtering.

Hotel extraction selection now scores exact name and destination matches, prioritizing property-like hostnames when the title also matches the requested hotel. This is a ranking hint, not proof of official ownership. Successfully extracted text must still match the exact resource name and destination. HTTPS rules remain unchanged; HTTP URLs are neither followed nor rewritten. Non-hotel selection remains unchanged. Discovery still examines at most six returned records; exact research still uses one search and at most two extracted pages, with existing budgets, timeouts and cache behavior.

## Verification

The final focused provider/link run passed **58 tests across three suites**, including **15 hotel-specific cases**. Provider isolation counters were all zero. `git diff --check` passed. The required **One-Brain gate passed**, covering runtime isolation, canonical commit, truth boundary, MCP parity, public export, schema, samples and demo contract. Fixtures span Springdale, Boston and Portland, with no live provider requests. Cases cover URL-less identities reaching model context through the real broker, address-based matching, wrong destinations, missing identities, unsafe URLs, upstream-empty versus filtered diagnostics, cache reuse, bounded extraction and rejection after mismatched extracted content. The captured Desert Pearl candidates are replayed offline to verify that the previously third-ranked homepage is now selected.

## Remaining limits and release disposition

The exact cause of the historical upstream-empty observation remains unprovable from the retained capture. This patch addresses demonstrated adapter filtering defects and adds the missing diagnostic distinction. Corrected hotel discovery and revised extraction ranking have not been retested live. Retaining candidates does not guarantee they have booking URLs; extraction may still fail. Hostname matching is conservative and cannot identify every chain, alternate domain or official owner. Exact destination-address matching may exclude abbreviated or incomplete addresses. It does not infer a state for an ambiguous city name.

Existing campground and named-hotel live evidence remains valid as historical evidence. Feature work can stop here for release review, with these limits recorded. No paid calls, commits, pushes, deployments or hosted-setting changes were made in this pass.
