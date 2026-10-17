# Pass 2: minimal day-type policy clarification

Implemented one paragraph in the initial travel policy:

> Choose each day's type to fit the trip. For the type you declare, arrival requires an arrival block; departure requires a departure block; transfer requires a transfer block; rest requires a downtime block. These are structural requirements for the chosen type, not instructions to assign any particular type to a day.

The primary runtime imports this policy and includes it in model instructions before the first call and subsequent synthesis/correction rounds. The requirements are now available before a rejection, rather than relying on correction feedback to explain them.

## Offline result

**32 tests passed across two suites.** Each of the four mappings is checked against the exported policy and the unchanged day validator: omission fails, and the corresponding block satisfies the contract on a deliberately partial day. Existing tests cover full sightseeing, partial arrival/departure, flexible experiences, stop binding and timing. The existing instruction against assuming first-day arrival or final-day departure remains intact.

```sh
cd server
npm run test:non-network -- --runInBand \
  src/prompts/__tests__/trailieModelFirstPolicy.test.js \
  src/utils/__tests__/dayCompleteness.test.js
```

Provider isolation reported zero live model constructors, provider dispatches and external provider HTTP requests. Whitespace validation passed.

## What remains unproven

The initial policy correctly communicates the existing contract. Offline tests do not establish whether Sol follows it more reliably, whether corrections decrease, or whether latency improves. A controlled live comparison is still needed for those claims: identical traveler input, frozen evidence, schema, model settings and guard; change only the clarification. Both arms must use the same evidence normalization version so Pass 1 does not confound the comparison. Record first-proposal acceptance, day-type failures, travel decisions, tokens, cache state, cost and latency; one successful generation is not a reliable failure-rate estimate.

No live comparison was run in this pass. No guard, schema, model setting, auto-insertion, template, historical saved-plan remediation or Pass 1 repair changes were made. Passes 3–5, reserve discovery, commits and deployment remain held.
