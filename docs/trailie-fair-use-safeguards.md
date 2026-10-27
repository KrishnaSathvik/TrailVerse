# Trailie signed-in fair-use safeguards

Product decision 2026-10-26: signed-in Trailie has **no daily conversation or token ceiling**. Guests keep the 5 completed turns / 48h allowance (`openGuestTurn`), unchanged. Signed-in turns on `/api/ai/chat`, `/chat-stream`, and signed-in `/plan-itinerary` callers pass `admitSignedInTurn` in `server/src/routes/modelFirstTrailie.js`:

| Safeguard | Behavior | Refusal |
| --- | --- | --- |
| Burst window | 30 **user-initiated turns** per sliding 15 min per account. Model calls, tool calls, corrections and provider retries inside a turn are not counted. A resend with the same `clientTurnId` (stream to non-stream fallback, axios network/5xx retry) is counted once, for up to 5 transport attempts | `429`, `Retry-After` header, body `{ code: 'trailie_turn_burst_limit', retryAfterSeconds }` |
| One active generation per conversation | Key = `tripId`, otherwise the client `conversationId` (for example `temp-…`) | `409 { code: 'trailie_generation_in_progress' }` |
| Two active generations per account | Two slot leases per account (multiple tabs) | `409 { code: 'trailie_concurrent_generation_limit' }` |
| Spend alerts | Per-user and aggregate UTC-day cost/token counters. One alert per scope/metric/day. **Never blocks** | none |

Leases are acquired first, so a busy refusal never uses burst allowance. A turn rejected by the burst window releases its leases right away. All other protections are still in place: the app-level `tieredLimiter` (200/15 min per user, 60 per anonymous IP), the 30k-char message and 50 KB metadata guards, OpenAI `maxRetries: 0` with a 180 s timeout, the runtime limits of 3 model calls, 1 tool call and 1 correction, client-disconnect abort, and the turn ledger.

## Store and cross-instance safety

All state lives in MongoDB, the existing shared store. The repo has no Redis. The collections are listed in `server/src/models`:

- `trailie_generation_leases` (`TrailieGenerationLease`): `_id` is the lease key (`c:<principalHash>:<conversation>`, `u:<principalHash>:<slot>`). Acquire is one atomic `findOneAndUpdate({_id, expiresAt <= now}, …, {upsert})`. If a live holder exists, the upsert collides on the unique `_id` (E11000), which means busy. A single document is linearizable, so this holds across any number of instances. Each lease has an owner token, so release and renewal are owner-fenced. Live generations renew every TTL/3. Leases are released before the terminal response write, on client disconnect (abort signal), on runtime failure, on exceptions, and in `finally`. A crashed instance stops renewing. Its lease is free once `expiresAt` passes (TTL 240 s, above the 180 s model timeout), and acquire treats an expired lease as free without waiting for the ~60 s TTL monitor. Renewal stops after 10 min (`leaseMaxHoldMs`), so a hung handler cannot hold a slot forever.
- `trailie_turn_bursts` (`TrailieTurnBurst`): a sliding-window log per account, updated by compare-and-swap on `version`. The first insert is guarded by a unique `_id`. Two instances cannot both admit the 31st turn.
- `trailie_spend_daily` (`TrailieSpendDaily`): `$inc` counters. The alert is claimed atomically with `updateOne({_id, 'alerts.<metric>': null})`, so it is sent once across instances. Rows expire after 35 days.

Principals are HMAC hashes (`hashPrincipal`, the same as `trailie_ai_turns.principalHash`), not raw user ids. Rows are short-lived, so account erasure needs no new wiring. The alert payload (log and email) includes the raw `userId` for operators.

If a fair-use store call fails, the turn is admitted and a warning is logged (fail open). These limits are for fair use, not security.

**Deploy step:** the three models add TTL indexes. Production startup only verifies indexes (`docs/application-index-provisioning.md`), so run `npm run indexes:check`, then `npm run indexes:apply`, against production **before** deploying this change. Otherwise `connectDB()` refuses to start.

## Configuration (env, read per request)

| Env var | Default |
| --- | --- |
| `TRAILIE_FAIR_USE` | on (`off` disables burst + leases; alerts still record) |
| `TRAILIE_BURST_MAX_TURNS` | 30 |
| `TRAILIE_BURST_WINDOW_MS` | 900000 (15 min) |
| `TRAILIE_TURN_MAX_TRANSPORT_ATTEMPTS` | 5 |
| `TRAILIE_MAX_ACTIVE_GENERATIONS_PER_USER` | 2 |
| `TRAILIE_GENERATION_LEASE_TTL_MS` | 240000 |
| `TRAILIE_GENERATION_LEASE_MAX_HOLD_MS` | 600000 |
| `TRAILIE_SAME_TURN_WAIT_MS` | 3000 (a same-`clientTurnId` resend waits for its predecessor's lease; `0` disables) |
| `TRAILIE_COST_ALERT_USER_DAILY_USD` | 5 |
| `TRAILIE_COST_ALERT_USER_DAILY_TOKENS` | 2000000 |
| `TRAILIE_COST_ALERT_AGGREGATE_DAILY_USD` | 50 |
| `TRAILIE_COST_ALERT_AGGREGATE_DAILY_TOKENS` | 20000000 |
| `TRAILIE_COST_ALERT_EMAIL_TO` | unset. In production, falls back to `ADMIN_EMAIL` |

## Alert channel

- A structured `console.error('[Trailie cost_alert]', {...})` line is always written, so it can be searched in Render logs.
- An optional email is sent through the existing Resend client (`getResendClient`), tagged `trailie-cost-alert`.

The repo has no Sentry or server-side PostHog to reuse.

## Threshold derivation (2026-10-26)

The source is the local `trailverse-dev` `trailie_ai_turns` collection, read only. It has 202 rows, of which 21 are priced (the model-first rows are mostly `cost_unknown`):

- Priced turn cost: p50 $0.037, p90 $0.058, max $0.173. Signed-in `chat-stream` turns averaged $0.032 (max $0.058). Guest stream turns averaged $0.082.
- Tokens per turn: average 15.6k in / 0.6k out, max 56.8k in / 5.3k out. Average 1.7 model calls per turn, max 4.
- Highest local user-day: $0.33 over 11 turns.
- Pricing registry (`gpt-6.1-sol`: $2/M input, $10/M output): the theoretical worst turn is about 3 calls × (60k in + 10k out), roughly $0.66.

The user threshold of **$5/day** is about 150 average turns, or about 8 worst-case turns. That is far above a long revision session (30–60 turns ≈ $1–3). **2M tokens/day** is about 125 average turns, and it also catches `cost_unknown` traffic. The aggregate threshold of **$50/day** is about 1,500 average turns. These numbers come from development data, so treat them as starting points.

## Calibrating with production data (read-only)

```js
// mongosh against production, read-only user. Last 14 days of signed-in spend per user-day.
db.trailie_ai_turns.aggregate([
  { $match: { userTier: 'authenticated', createdAt: { $gte: new Date(Date.now() - 14 * 864e5) } } },
  { $group: { _id: { p: '$principalHash', d: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } } },
      cost: { $sum: { $ifNull: ['$costUsd', 0] } }, turns: { $sum: 1 } } },
  { $group: { _id: null, days: { $push: '$cost' }, maxTurns: { $max: '$turns' } } },
]);
// After deploy, the spend rows give the same view directly (they include /plan-itinerary and failed turns):
db.trailie_spend_daily.find({ scope: 'user' }).sort({ costUsd: -1 }).limit(20);
db.trailie_spend_daily.find({ scope: 'aggregate' }).sort({ day: -1 }).limit(14);
```

Set the per-user threshold to about 3–5× the p99 user-day. Set the aggregate threshold to about 2× the p95 daily total. Change the env vars; no deploy is needed. Note that `trailie_ai_turns` does not record `/plan-itinerary` (not in `CHAT_ROUTES`) and records only completed turns. `trailie_spend_daily` records every turn that reached the runtime.

## Known limits

- `tieredLimiter` (express-rate-limit) still uses in-memory storage, so its limits apply per instance.
- Clients that send no `clientTurnId` (older web builds, other signed-in API callers) are counted once per request.
- A same-turn resend that arrives while the first request is still running waits up to 3 s. If the first request is still running after that, the resend gets a busy refusal.
- Spend is recorded after the runtime returns. A turn killed mid-flight by an instance crash is not counted.
