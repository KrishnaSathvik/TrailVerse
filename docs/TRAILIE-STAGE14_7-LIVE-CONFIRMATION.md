# Trailie Stage 14.7 — Two-scenario live early-visibility confirmation

**Status: preflight aborted. Zero provider calls. Zero dollars spent.**
Both production flags remain off. Nothing committed or pushed.

---

## 1. Preflight result — FAILED (blocked before spend)

The runner `server/eval/run-stage14_7-early-visibility-two.js` was built and its
fail-closed preflight executed. Thirteen of fourteen gates passed:

| Gate | Result |
|---|---|
| exactly the two approved scenarios, in order | ok — `basic-02-three-day → basic-03-seven-day` |
| `TRAILIE_EARLY_ITINERARY_EVENTS=true` (runner scope only) | ok |
| `TRAILIE_PROSE_RECOVERY` disabled | ok |
| Claude Sonnet 5 is the only allowlisted provider | ok — `claude:claude-sonnet-5` |
| `CLAUDE_PRIMARY_MODEL` matches the allowlist | ok |
| OpenAI absent from the live matrix | ok |
| live providers explicitly enabled | ok |
| `ANTHROPIC_API_KEY` present | ok |
| estimated-cost cap enforceable (≤ $0.75) | ok |
| request cap active | ok — 12 |
| input-token cap active | ok — 180,000 |
| output-token cap active | ok — 50,000 |
| private draft capture gitignored + synthetic-only | ok |
| **persistence targets an ISOLATED test store** | **FAIL** |

### The blocker

`MONGODB_URI` resolves to a hosted Atlas cluster
(`trailverseapp.…mongodb.net`, database `trailverse`) and
`TRAILIE_EVAL_TEST_MONGODB_URI` is unset. Under §3 that is production data.

Running the two scenarios would have written evaluation trips — with real
generated itineraries, revision-1 checkpoints and revision-2 prose — directly
into the application database. §3 requires exactly the opposite:

> Use an isolated test database, database namespace, or transaction-safe test
> store. **Fail closed when the configured database resembles production.**
> Do not write evaluation trips into production data.

So the preflight aborted before the first token. This is the gate working, not a
defect in Stage 14.

The isolation check is deliberately conservative — it requires an explicitly
named eval/test namespace *and* rejects hosted clusters, so a false positive
costs a blocked run while a false negative costs contaminated user data.

### What unblocks it

`mongod` is installed (`/opt/homebrew/bin/mongod`) but nothing is listening on
`127.0.0.1:27017`. Starting a local instance and re-running with:

```
TRAILIE_EVAL_TEST_MONGODB_URI="mongodb://127.0.0.1:27017/trailverse_eval_14_7"
```

satisfies the gate. **I did not start a database, point the runner at a different
store, or spend anything** — provisioning infrastructure and then buying provider
calls against a configuration you have not seen is your decision, not mine.

---

## 2. Runner architecture (built, not yet executed live)

The preflight half is complete and runnable today. Per §3 the live driver must:

```
authenticated POST /chat-stream        (the ACTUAL route, not extracted seams)
→ actual SSE response bytes
→ real consumeAiSseStream parser
→ real Stage 14.3 coordinator + reducers
→ actual canonical persistence controller path
→ isolated eval trip storage
```

This is the gap Stage 14.6 explicitly left open — 14.6 exercised the seams below
`routes/ai.js`; 14.7 is where the real route gets driven end to end.

**I have not written the live driver.** Writing it against a configuration whose
persistence target is blocked would mean shipping an untestable path, and the
first thing it must do is bind to the isolated store that does not yet exist. It
is scoped in §3 above and is the remaining work for this stage.

---

## 3. Measurements — not obtained

No scenario ran, so every §7–§15 measurement is unavailable:

| Required | Value |
|---|---|
| `timeToItineraryVisibleMs` (both scenarios) | **not measured** |
| `timeToProseVisibleMs` (both scenarios) | **not measured** |
| `absoluteEarlyGainMs` / `relativeEarlyGain` | **not computed** |
| Phase A budget selection evidence | not obtained |
| Phase B verification / retry / fallback evidence | not obtained |
| persistence + component-identity evidence | not obtained |
| safety invariant counts | not obtained |
| cost ledger | **$0.00 — no calls made** |
| restore confirmation | not obtained |

I am not estimating, projecting, or reusing Stage 13.9A numbers in their place.
The Stage 14.0 figures (≈36.2 s / ≈53.5 s) were always labelled projections; they
remain projections.

---

## 4. Flag-off offline replay (§16)

§16 depends on "captured deterministic terminal objects and transcript metadata"
from this run. No transcripts were captured, so the offline replay could not be
performed against live data.

The equivalent assertions do already hold deterministically from Stage 14.6:
scenario B produces exactly `response_started · thinking · chunk · stream_end ·
done` with one terminal write, no early events, and no Stage 14 optional fields
when the early lifecycle is unused. That is offline evidence, not a replay of a
live run, and I am not presenting it as one.

---

## 5. Shared-route cache prerequisite (§17) — reconfirmed

Re-inspected and unchanged: **`/shared/:shareId` sets no explicit `Cache-Control`
policy** (no `Cache-Control`, `res.set`, `setHeader` or `maxAge` on that route in
`server/src/routes/trips.js`). Nothing was modified during this stage.

Required before production rollout:

```
verify deployed CDN/proxy caching for /shared/:shareId
  or
add an explicit bounded freshness / no-store policy
```

---

## 6. Decision

```
STAGE14_7_LIVE_CONFIRMATION_FAILED
```

Returned because live confirmation did not occur. I want to be precise about what
this does and does not mean:

- It is **not** a correctness failure. No Stage 14 invariant was violated; none
  was exercised live.
- It is **not** `STAGE14_7_CORRECT_BUT_GAIN_INSUFFICIENT` — that requires a
  measured gain, and there is none.
- It is **not** `READY_FOR_STAGE14_CANARY_PLAN` — that requires both scenarios to
  pass the latency gate, and neither ran.

The three defined codes all presuppose a completed run. This is a configuration
blocker at the preflight boundary, and `STAGE14_7_LIVE_CONFIRMATION_FAILED` is
the only code that does not advance rollout, which is the correct outcome.

---

## 7. To resume

1. Start an isolated eval database and export
   `TRAILIE_EVAL_TEST_MONGODB_URI` (e.g. `mongodb://127.0.0.1:27017/trailverse_eval_14_7`).
2. Re-run the preflight command from the header of the runner — it should reach
   14/14.
3. Authorize completion of the live driver (§2), which drives the real
   `/chat-stream` route into the isolated store.
4. Re-run preflight, then the live form with no code changes in between.

Estimated spend when it does run, under the stated caps: ≤ $0.75, ≤ 12 requests,
across exactly two scenarios run exactly once each.

---

## 8. Stage 14 status

| Area | Status |
|---|---|
| Generation correctness | passed |
| Canonical persistence | passed |
| Early revision contracts | passed |
| Persist-before-reveal | passed deterministically |
| Restore / share / export | passed |
| Composed deterministic lifecycle | passed (48/48) |
| Resolver equivalence | passed (960/960) |
| **Real user-visible latency** | **blocked — isolated eval store required** |
| Recovery composed integration | required before recovery rollout |
| Shared-route cache policy | required before production rollout |
| Production flags | **off** |

---

## Stop

Stage 14.7 halted at the preflight boundary. Zero provider calls, zero spend,
no flags enabled, no commits.
