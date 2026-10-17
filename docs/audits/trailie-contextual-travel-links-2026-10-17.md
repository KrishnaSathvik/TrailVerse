# Contextual travel links — local acceptance

Date: 2026-10-17. Local changes only; no paid requests, live searches, commits, pushes, deployments or hosted-setting changes in this implementation pass.

## Root cause and correction

RIDB catalog records can identify a facility while returning no reservation URL. Existing broad business discovery exposed listing identities but had no exact-resource page extraction path. Successful lookup therefore did not necessarily deliver an actionable booking link.

`read_travel` now accepts up to three optional named resources with a destination and one of eight categories: hotel, campground, permit, shuttle, rental car, restaurant, attraction or tour. These requests reuse the existing research phase, provider budget, timeouts and cache. Repeated resource requests are deduplicated. No extra mandatory model call, correction round, itinerary search or booking subsystem was added.

For matching RIDB evidence, a valid provider-returned reservation URL is preferred over its listing URL. Missing URLs can use the existing Tavily search/extract adapter. Successful extraction must contain the exact resource name and destination; snippets alone are insufficient. A known RIDB identity additionally requires the discovered Recreation.gov URL to match its ID and resource category. URLs are never generated from facility IDs. Ambiguous IDs, unsafe URLs, failed extraction, soft 404s and mismatched resources fail closed.

General resource pages are classified as listing or reservation pages. Research evidence does not assert official ownership solely from search ranking. Price, availability and requested-date inventory remain unknown. Serper business discovery prefers returned website URLs and rejects destination-mismatched rows. Existing canonical guidance validation preserves supported URLs through serialization/export; conversational exact-resource help removes unsupported links without a model retry.

The policy places actionable itinerary links in the single Things to Know section and answers direct booking questions in conversation. Hotel or rental discovery is not automatic for ordinary itineraries. Guest limits and migration, streaming defaults, NPS alerts, layout and the bounded itinerary repair architecture remain unchanged.

## Offline verification

- Five focused backend suites: **124 passed**, covering resource extraction, RIDB/provider selection, caching, mismatch rejection, direct reply filtering and active policy.
- Recovery and itinerary link-boundary suites: **30 passed**.
- Frontend Things to Know rendering: **9 passed**, including all eight resource categories and section behavior.
- Provider isolation reports: zero live model constructors, provider dispatches and external provider HTTP requests.
- One-Brain gate: **PASS**, including runtime isolation, canonical commit, truth boundary, MCP parity, public export, schema, samples and demo contract.
- `git diff --check`: passed.

## Limits

At implementation time no live acceptance call was authorized or made for this extension. A subsequent authorized provider-only run was a partial pass; see [live acceptance findings](trailie-link-live-acceptance-2026-10-17.md). Previously recorded RIDB authentication/catalog and Zion/Bryce itinerary results remain separate evidence. A reachable resource page is not proof of inventory or of future link availability. Exact-name/destination extraction deliberately may omit useful pages when their text is incomplete, redirected or inaccessible. Broad hotel discovery can return listing pages; it does not guarantee a verified booking page for every option. Model selection of relevant resources and concise prose still depend on policy adherence.
