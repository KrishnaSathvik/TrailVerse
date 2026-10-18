# Trailie: current local vs production, 15 questions

Date: 2026-10-16. Paid run: 2026-10-16T21:49:45.688Z to 2026-10-16T21:55:09.281Z (about 5 minutes 24 seconds).

## Verdict

Current local answers are generally more natural, concise and appropriately qualified in this sample. Production shows readable text earlier, but has concrete stale recommendations and a serious destination mismatch. Local is not uniformly better: research is slow and the Colorado entity-resolution problem also exists underneath its better final answer. This is a qualitative review, not a blinded correctness score or a release approval.

## Results

| Metric | Production | Current local |
|---|---:|---:|
| Completed / attempted | 15 / 15 | 15 / 15 |
| Median first readable text | 3.87 s | 7.93 s |
| Median final response | 10.86 s | 7.93 s |
| Mean final response | 11.92 s | 9.36 s |
| Mean answer length (whitespace words) | 261.4 | 175.5 |
| Returned itinerary | 0 | 0 |
| Observed model calls | Not exposed | 17 |
| Estimated model cost | Not exposed | $0.3090 |

Production delivered first readable text sooner on 12/15 pairs. Local completed sooner on 11/15. All 30 returned HTTP 200 and a final response; no client retries. Local had no mutation proposals and no canonical itinerary persisted in its disposable database. Production plan absence is based on response metadata, not a database audit.

Local cost uses returned usage and the repository's pricing-2026-10-13 registry, not an invoice. Research-provider costs include unknown values; $0.3090 is model cost only, not total test spending. Production usage, model-call count and cost are unavailable; do not interpret unknown as zero. Earlier two-request testing is excluded.

## Per-question latency

Seconds from request start; question numbers match the full response appendix.

| Q | Prod readable | Local readable | Prod final | Local final | Local model calls |
|---|---:|---:|---:|---:|---:|
| 1 | 12.91 | 11.19 | 21.06 | 11.19 | 1 |
| 2 | 2.22 | 7.82 | 8.58 | 7.82 | 1 |
| 3 | 2.79 | 6.70 | 10.03 | 6.70 | 1 |
| 4 | 1.52 | 9.38 | 9.16 | 9.38 | 1 |
| 5 | 1.47 | 7.68 | 7.82 | 7.68 | 1 |
| 6 | 5.24 | 20.55 | 12.53 | 20.55 | 2 |
| 7 | 8.74 | 7.93 | 15.30 | 7.93 | 1 |
| 8 | 1.59 | 7.97 | 7.79 | 7.97 | 1 |
| 9 | 6.50 | 7.72 | 13.60 | 7.72 | 1 |
| 10 | 2.55 | 6.91 | 9.55 | 6.91 | 1 |
| 11 | 5.08 | 18.44 | 12.69 | 18.44 | 2 |
| 12 | 5.72 | 9.17 | 12.89 | 9.17 | 1 |
| 13 | 1.81 | 3.26 | 9.25 | 3.26 | 1 |
| 14 | 3.87 | 7.59 | 10.86 | 7.59 | 1 |
| 15 | 8.47 | 8.08 | 17.76 | 8.08 | 1 |

## Answer review

1. Local gives a balanced winter-city answer; production recommends the closed Signature Room and adds dubious local-color claims.
2. Both directly advise against a city rental. Local is shorter and avoids unsupported precise parking prices.
3. Local covers Maine and seasonal tradeoffs; production narrows the request to Acadia and adds a templated three-question intake.
4. Local considers travel friction and several non-park places. Production pushes remote parks and overconfident solitude claims.
5. Local acknowledges seasonal crowds and ferry logistics. Production promises empty peak-summer beaches without support.
6. Local offers a nearby astronomy club and admits unconfirmed access/program details. Production omits Petrified Forest's after-hours permit constraints.
7. Both choose Seattle with Portland tradeoffs. Local avoids production's insistence that national-park status makes nearby scenery superior.
8. Both favor Yellowstone. Local preserves Glacier's non-hiking appeal; production overstates Hidden Lake Overlook's hike length and inserts current closure claims.
9. Local compares South Rim/West/Phoenix without unsolicited current closures. Production claims lodging is suspended; this claim was not independently resolved in this review.
10. Local gives practical transit advice. Production recommends the discontinued DC Circulator and adds an unsolicited Shenandoah planning upsell.
11. Production answers about Colorado National Monument instead of mountain driving statewide. Local answers the actual question cautiously, but research also resolves Colorado to colm and leaves road/traction facts unresolved.
12. Local stresses flexibility, evacuation and policy exclusions. Production's suggestion only major direct hits shut things down is overly reassuring. Both give seasonality; local could better acknowledge elevated risk through mid-October.
13. Local responds naturally and asks two relevant context questions in 64 words. Production delivers a long park list and a templated intake.
14. Both distinguish scenery from commercialization. Local avoids production's disparaging sales language and unnecessary exact trail/fee details.
15. Local gives one clear first-park choice, an alternative and relevant questions. Production is substantially longer and adds current reservation claims without web search.

## Spot-checked issues

- Production Q1 recommends Signature Room. It closed in 2023; an April 2026 report still describes the space as a former restaurant awaiting redevelopment. [Axios, April 2026](https://www.axios.com/local/chicago/2026/04/08/john-hancock-360chicago-view-new-windows).
- Production Q6 suggests casually accessing Petrified Forest after sunset. NPS requires a wilderness or dark-sky permit; dark-sky visitors must enter before closing. [NPS dark-sky access](https://home.nps.gov/pefo/planyourvisit/darkskyviewpermit.htm).
- Production Q8 groups Hidden Lake Overlook with 5–10-mile hikes. NPS lists the overlook at 1.3 miles one way, not a 5–10-mile outing. [NPS trailhead](https://www.nps.gov/places/hidden-lake-trailhead.htm).
- Production Q10 recommends DC Circulator. DDOT confirms service ended December 31, 2024. [DDOT termination notice](https://ddot.dc.gov/release/dc-circulator-service-end-dec-31-riders-encouraged-seek-alternate-routes-metro).
- Local Q11 appropriately declines to assert unverified traction specifications and points to official guidance; current rules emphasize tire type/tread, not merely AWD. [CDOT](https://www.codot.gov/news/2025/november/new-traction-law-requirements).
- Local Q12's seasonal discussion is broadly sensible, but the active Atlantic period extends through mid-October, not only late August/September. [NHC climatology](https://www.nhc.noaa.gov/climo/).

This is targeted spot-checking, not verification of every place, price, weather claim, closure or trail detail. Unverified claims above are not automatically classified as false.

## Research behavior and remaining gaps

Local uses 1 model call on 13 questions, 2 on Q6 and Q11 after one read_travel call each: 17 total, no conversational handoff overhead. Q6 research leaves astronomy unresolved and visitor_services unsupported; the answer explicitly avoids claiming confirmed programs/access. Q11 requests Colorado roads, restrictions, rules, weather and closures, but evidence contains catalog:nps:park:colm (Colorado National Monument), not a statewide mountain-road authority; roads and vehicle_restrictions remain unresolved. The answer handles this cautiously, but the research mismatch remains a product issue.

Production marks live data on Q1, Q8, Q9 and Q11; hasWebSearch is false on all 15. This does not prove no internal data work occurred or reveal exact provider/model-call counts. Its Q11 active destination is explicitly parkCode colm. More live data is not automatically relevant or current evidence.

## Method and limits

- Same 15 exact user prompts, fresh anonymous conversation per request, no added word limit or formatting instruction; alternating production/local order for successive pairs. One sample per environment per question.
- Production live revision observed at start: cffedbef29a2fd6765e1ae1b61d9d5b9c8c043ed, deploy dep-db0j3eugekts739u65og. Returned model: claude-sonnet-5.
- Local working tree: branch ci/security-controls-2026-10-16, HEAD 6392da99 plus existing uncommitted work; real model-first router/provider/guard with disposable MongoMemoryReplSet. Returned model: gpt-6.1-sol. Review worker disabled. Existing running backend was not used to avoid its database configuration.
- Direct backend SSE requests (Render vs local loopback), not browser or Vercel proxy. First-readable threshold: at least 24 characters and five whitespace words after basic Markdown marker stripping. This measures API arrival, not browser paint or judged usefulness.
- Production chunks arrive before final; local readable content and final arrive together on all 15. This does not isolate underlying model-token timing from server chunk scheduling.
- Different revisions, models, infrastructure, database and network paths; this is a product comparison, not a controlled same-model streaming A/B benchmark. Small single-pass results do not establish p95 latency or general accuracy rates.
- Experimental answer streaming and draft previews remained OFF. No handoff experiment acceptance claim, cancellation test or itinerary validation test is made here.
- No application changes, commits, push, deployment or frozen-release modification made for this comparison. No more paid requests are needed to inspect these results.

## Recommendation

Prefer the local answer style, but do not describe it as improved first-text responsiveness. Keep experimental streaming off. Before promoting changes, address the concrete Colorado research-resolution mismatch in a separately scoped task and retain normal release checks. This run provides no evidence that the extra-round handoff experiment is worthwhile, because it was not enabled.

Full answers: [response appendix](trailie-15-question-responses-2026-10-16.md). Raw timing/events/usage/telemetry remain locally at /private/tmp/trailie-30-request-comparison-20261016/results.json; runner at /private/tmp/trailie-30-request-comparison.cjs. Those temporary files are not committed and may be cleaned by the OS.

