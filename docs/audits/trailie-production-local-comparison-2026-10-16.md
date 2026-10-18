# Two-request production/local comparison

Executed October 16, 2026, 21:38–21:39 UTC after the owner approved two chat requests and subsequently removed the dollar cap. Exactly one production request and one local request were submitted, without client retries. No deployment or hosted configuration was changed.

## Inputs and boundaries

Identical fresh-conversation prompt:

> Compare Zion and Bryce Canyon for a first-time visitor who prefers scenic views and easy walking. In under 180 words, give practical trade-offs and recommend which suits that preference. General advice only: no live conditions, bookings, itinerary, or saved preferences.

- Production: direct Render `/api/ai/chat-anonymous-stream`, observed deployed revision `cffedbef29a2fd6765e1ae1b61d9d5b9c8c043ed`. Its terminal reported Claude Sonnet 5. The request creates an ordinary anonymous test conversation on production.
- Local: real model-first router and guest persistence on loopback, with disposable MongoDB replica set, local working tree based on `6392da99` plus uncommitted changes. The terminal reported GPT-6.1 Sol. Local model dispatches were limited to three with SDK retries disabled; exactly one occurred.
- Experimental conversational streaming and itinerary preview were explicitly disabled in the local subprocess; no negotiation header was sent to either endpoint. No application environment file was edited.
- This compares the actual old production behavior with the current local default, **not** a same-model handoff A/B experiment. Runtime, model, network and database environments differ.
- Measurements are API-client arrival times, not browser paint times. Neither request went through the Vercel frontend rewrite. First readable text is a reproducible heuristic: at least five words and 24 characters after basic Markdown-marker removal; it is not a semantic usefulness score.

## Results

| Measurement | Production | Local |
|---|---:|---:|
| HTTP status | 200 | 200 |
| First SSE data event | 0.783 s | 1.681 s |
| First nonempty content | 3.241 s | 10.934 s |
| First readable-text threshold | 3.386 s | 10.934 s |
| Final response | 10.556 s | 10.934 s |
| End of stream | 10.557 s | 10.934 s |
| Observed local model calls | Not instrumented | 1 |
| Model usage | Not exposed by old streaming path | 5,805 input / 222 output tokens |
| Model cost | Unknown | $0.016731, repository ledger estimate |

Local usage included 5,802 cache-write input tokens and zero cache-read tokens. Cost uses the repository's `pricing-2026-10-13` table and actual provider-reported usage, not a reconciled invoice. Production's streamed adapter does not return usage, so total paid cost and production model-call count cannot be claimed from this test.

Production progressively delivered readable text about **7.55 seconds earlier**. Local finished approximately **0.38 seconds later**. This one sample shows no local responsiveness improvement and does not establish a statistically meaningful total-latency difference.

Local emitted `understanding_request`, then `saving_response`, then content and final together. Its terminal confirmed persistence; the disposable session contained one user message and one assistant message. Production's older stream emitted chunks before its final event; its canonical/persistence safety was not certified by this test.

## Answer quality

Both recommended Bryce for easy walking and scenic views. Local was more concise and balanced: it described Zion's immersive canyon scenery without saying that easy walkers miss its signature views, clarified the Bryce walk as round-trip, and described Riverside Walk as not entirely flat. Production called Riverside Walk flat and made the subjective claim that Zion's best views require harder hiking or wading.

Local satisfied the under-180-word instruction; production exceeded it. A simple whitespace count ignoring Markdown-only/table-divider tokens produced 159 words local versus 196 production; these are formatting-normalized counts, not provider token counts.

Spot-checks support the local answer's trail distinctions: [NPS Bryce hiking information](https://www.nps.gov/brca/planyourvisit/day-hikes.htm) identifies the paved Sunset–Sunrise section as half a mile one way, and [NPS Zion's spring 2026 guide](https://www.nps.gov/zion/planyourvisit/upload/26-Spring-InfoGuide.pdf) lists Riverside Walk as 2.2 miles round-trip with elevation change and only its initial portion generally flat. No live conditions or closure status were tested. This is a narrow quality check, not a factual certification of either model or research-backed-answer acceptance; local made no research call.

## Decision

Keep experimental streaming off. The old production runtime already streams ordinary text; current local default waits for commit. This comparison does not test the new answer-only handoff and supplies no reason to enable it or rewrite the architecture.

No feature fix was made based on one sample. No commit, push or deployment was performed. GitHub protection was read back before testing: master requires one independent approving review, the `security` check, administrator enforcement, and no force pushes. Publication must respect that protected workflow; the test does not waive it or establish full release acceptance.

Private captures and the single-use runner are in `/private/tmp/trailie-two-request-comparison-20261016/results.json`, `/private/tmp/trailie-two-request-comparison-console.log`, and `/private/tmp/trailie-two-request-comparison.cjs`. The runner's exclusive start marker prevents accidental repeat spending. Captures are temporary local evidence, not committed user/session data.
