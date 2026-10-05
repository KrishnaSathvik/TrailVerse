# Durable memory authority

This correction applies only to model-first durable memory proposals. Ordinary conversation and plan-only proposals make no verification request. Runtime selection, existing Mongo provisioning work, MCP and widget flags are unchanged.

## Admission contract

The proposing model does not grant authority. The runtime makes at most **one independent semantic verification request per turn**, flattening proposed memory groups into exact field/value facts. The verifier receives only the current user message, the exact source quote, the dotted field, the proposed value and a correlation ID. No saved trip, history, research, proposer explanation or authority label is supplied.

The verifier has no tools or planning role. It returns a verdict per fact: `supported`, `relationship`, and a short reason. `supported: true` is valid only with `relationship: explicit`. Unsupported, contradicted, hypothetical, conditional and uncertain claims cannot become durable memory. Explicit negative values are allowed when supported; definite commitments are distinguished from possibilities. Unstated years, currencies, counts and other values must not be filled in.

Deterministic admission requires:

1. Existing schema/type/quote-presence checks pass.
2. A completed, non-refused, well-formed verifier response covers every expected fact exactly once, without tool calls or extra fields.
3. An internal, non-serializable receipt approves the exact message/quote/field/value. A JSON approval from the model or HTTP client cannot substitute for it. Mutating the input while verification is pending cannot expand the approval.
4. Existing calendar, canonical-place, itinerary, transport, ownership and persistence checks still pass.

All proposed memory is atomic: if any fact is rejected, candidate traveler state is restored before route authorization. The proposal is not committed. The existing single correction step may omit rejected facts and retain independently verified identical facts. Changed or newly added facts have no receipt and cannot trigger another verifier request that turn.

For a memory-only semantic rejection, Trailie may answer normally without a memory mutation. It does not force confirmation. If no correction opportunity remains, a short deterministic response says the detail remains unconfirmed instead of publishing the rejected “saved” response. Plan failures retain the existing failure behavior.

## Bounds and failure behavior

- Same configured model as the model-first runtime: `gpt-6.1-sol`, low reasoning, in a separate stateless request.
- At most 16 updates / 32 leaf facts, a 30,000-character current message and a 64,000-byte serialized verification payload. Existing quote/value limits remain enforced by the guard.
- At most 4,096 output tokens, 15 seconds per verification request, zero SDK retries, no tools and `store: false`.
- Truncation, refusal, invalid JSON/schema, missing/duplicate IDs, inconsistent verdicts, timeout, cancellation and unavailable verification fail closed.
- The planner retains its existing maximum of three model calls, one research phase and one correction. Verification adds at most one call, so a memory-writing turn can make **four model calls total**. It does not consume another planning loop or permit further research.
- Verification usage/cost joins the normal call ledger and account token accounting, identified by `purpose: memory_verification`. Verifier reasons are not supplied to the planner or persisted as authority. Existing provenance gains a guard-authored `semantic_verified` marker.

## Driving propagation

Provider research may retrieve drive-time evidence even when car availability is unknown. A rejected car fact never changes `planningState.transportation`; the canonical guard therefore leaves the edge unverified with no duration or driving mode. Independently supported rental availability can authorize already grounded driving evidence. An explicit supported `rentalCar: false` continues to veto driving despite an older positive mode.

## Qualification and limits

Offline tests use explicit synthetic verifier verdicts to test the admission boundary; they do **not** establish a language model's semantic accuracy. They cover the requested car/booking/party/date matrix, cherry-picked negation, third-party quotes, mixed facts, receipt binding, atomic rejection, cancellation/timeouts, one-call bounds, correction reuse, token accounting, route propagation and guest/account persistence.

`node scripts/verify-trailie-memory-authority.js` from `server/` prints the fixed live evaluation manifest without dispatching. The opt-in `--execute-live` run requires the existing live-test authorization variables (`TRAILIE_ALLOW_LIVE_TESTS=true` and `TRAILIE_LIVE_TEST_ACK=I_UNDERSTAND_THIS_MAKES_REAL_PROVIDER_CALLS`) and a configured API key. It runs at most 15 verifier requests, no planner/tools/database writes, with the bounds above. An unavailable or malformed verifier fails qualification even for a negative case, so outages cannot masquerade as correct rejection.

Semantic verification remains a model judgment, not a mathematical proof. Passing a fixed corpus does not guarantee every paraphrase or adversarial statement will be judged correctly. This change guards **new writes**; it does not retroactively re-verify or delete pre-existing saved memory, including facts accepted before this correction. Real browser/ChatGPT acceptance and production runtime alignment remain separate work.
