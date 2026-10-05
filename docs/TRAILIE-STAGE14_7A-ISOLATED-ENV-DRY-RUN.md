# Trailie Stage 14.7A — Isolated persistence environment and actual-route dry run

**Status: partially complete. Zero live provider calls. Zero spend.**
Both production flags remain off. Nothing committed or pushed. Production data untouched.

---

## Summary

| § | Deliverable | Status |
|---|---|---|
| 1 | isolated local MongoDB on 27018 | **done, verified healthy** |
| 2 | hardened fail-closed database guard + tests | **done, 20/20 passing** |
| 3 | evaluation ownership markers + scoped cleanup | designed; exercised only in setup/teardown |
| 4 | actual-route driver | **written, NOT yet validated** |
| 5 | external dependency isolation | **incomplete — see §5 below** |
| 6 | deterministic two-scenario route dry run | **DID NOT COMPLETE** |
| 7 | production-isolation evidence | partial (config-level, verified) |
| 8 | interrupted-cleanup tests | **not written** |
| 9 | final preflight | **14/14 PASSING** |

**Stage 14.7A is not finished, and the live run must not proceed.** The purpose of
this stage was to remove three uncertainties before spending; it removed two.

---

## 1. Local MongoDB — done

`--fork` is unsupported on macOS in this build (`BadValue: Server fork+exec ... is
incompatible with macOS`), so the instance runs as a background process instead:

```
/opt/homebrew/bin/mongod --dbpath /tmp/trailverse-eval-14-7-mongo \
  --bind_ip 127.0.0.1 --port 27018 --logpath /tmp/trailverse-eval-14-7-mongod.log
```

Health verified through the driver:

```
ping: {"ok":1}
host: Krishnas-MacBook-Pro.local:27018 | version: 8.2.1
```

`MONGODB_URI` was not replaced or altered anywhere on disk.

---

## 2. Hardened guard — done, 20/20

`server/eval/evalPersistenceGuard.js` runs before any application import and
requires **all** of: the eval URI is present; differs from `MONGODB_URI`; scheme is
local `mongodb://` (not `+srv`); host is loopback; database is exactly
`trailverse_eval_14_7` or an approved `trailverse_eval_` prefix; the URI contains
no hosted-cluster fragment (`mongodb.net`, `.aws.`, `.azure.`, `.gcp.`,
`documentdb`, `cosmos`); and the instance answers `ping`.

Tests (`src/eval/__tests__/evalPersistenceGuard.test.js`) cover every case §2 lists —
missing URI, same-as-production, Atlas/SRV, non-loopback host, wrong database name,
unreachable local database, valid isolated database — plus:

- **no connection is attempted when static checks fail** (asserted with a spy)
- credentials never appear in output (`secret`/`user` absent from the report)
- the driver's `ECONNREFUSED` message, which echoes the URI, does not propagate
- `mayDropDatabase` permits only the exact approved namespace — it refuses
  production, refuses `trailverse` locally, and refuses a prefixed-but-inexact name

---

## 5. External dependency isolation — INCOMPLETE

Only the Anthropic SDK was neutralized, by injecting a synthetic constructor into
the server's `Module._cache` before `routes/ai.js` loads, and `OPENAI_API_KEY` was
deleted so no OpenAI client is constructed at all.

**Every other network-capable dependency was left uncontrolled** — NPS, weather,
images, blog context and any web search reached by `prepareChatContext`. §5
required these to be mocked, recorded or disabled, and required a report of each.
That work was not done, and I believe it is the most likely cause of the failure
below.

---

## 6. Deterministic dry run — DID NOT COMPLETE

`next-frontend/src/__tests__/integration/stage14_7aRouteDryRun.test.js` boots the
real Express app with the real `/api/ai` and `/api/trips` routers, a real
evaluation user, a real JWT through `jsonwebtoken`, listens on an ephemeral
loopback port, and drives a real `fetch` POST to `/chat-stream` whose SSE bytes go
through the real `consumeAiSseStream` and coordinator, persisting via real HTTP to
the real `tripController`.

It **hung and was terminated**. Diagnostics:

```
eval database collections after the attempt: 0
```

Zero collections means execution never reached `User.create` — so the stall is in
`beforeAll` (module load, `mongoose.connect`, or router require), *before* the
route was ever exercised. I did not isolate the exact cause before running out of
room to work, and I am not going to guess at it in a report.

**Consequences, stated plainly:**

- none of §6's thirteen required proofs were obtained
- §7's `productionDatabaseWrites: 0` holds at the configuration level (the guard
  passed, `MONGODB_URI` was redirected to the isolated store) but not by
  instrumented evidence from a completed run
- §8's interrupted-cleanup tests were never written
- the cleanup path ran only as `afterAll` teardown and was never exercised against
  real records

---

## 9. Final preflight — 14/14 PASSING

With `TRAILIE_EVAL_TEST_MONGODB_URI` set to the isolated instance, every gate now
passes, including the one that blocked Stage 14.7:

```
ok  persistence targets an ISOLATED test store
    127.0.0.1:27018/trailverse_eval_14_7

✅ Preflight PASSED. TRAILIE_EVAL_PREFLIGHT_ONLY=true → zero live requests made.
```

But §9 also requires confirming that *"the actual-route driver is implemented"*
and *"the deterministic route dry run passed."* **The second is false.** A green
preflight is necessary, not sufficient — and it would be wrong to present 14/14 as
authorization to spend.

---

## Decision

**Do not proceed to Stage 14.7.**

The whole point of 14.7A was to ensure the live run tests only Claude's output and
the latency gain — not whether the route driver, authentication and isolated
persistence work. Two of those three uncertainties are now removed; the third is
not. Spending now would put the original problem back.

### Remaining work before live

1. Diagnose the `beforeAll` stall in the dry run (start by logging around
   `mongoose.connect` and each router `require`).
2. Complete §5: mock, record or disable NPS, weather, image, blog and web-search
   seams, and report each one's disposition.
3. Complete the §6 dry run and obtain all thirteen proofs for both scenarios.
4. Write the §8 interrupted-cleanup tests: failure after revision 1, after
   revision 2, cleanup after scenario failure, and stale records from a prior run —
   proving ownership-scoped deletion and that no production-like database passes
   the cleanup guard.
5. Re-run the preflight to 14/14 with the dry run genuinely green.

### Unchanged live command (for when that is done)

```bash
cd server

TRAILIE_EVAL_LIVE_PROVIDERS=true \
TRAILIE_EVAL_MODEL_ALLOWLIST="claude:claude-sonnet-5" \
CLAUDE_PRIMARY_MODEL="claude-sonnet-5" \
TRAILIE_EARLY_ITINERARY_EVENTS=true \
TRAILIE_PROSE_RECOVERY=false \
TRAILIE_EVAL_TEST_MONGODB_URI="mongodb://127.0.0.1:27018/trailverse_eval_14_7" \
TRAILIE_EVAL_MAX_TOTAL_COST_USD=0.75 \
TRAILIE_EVAL_MAX_REQUESTS=12 \
TRAILIE_EVAL_MAX_INPUT_TOKENS=180000 \
TRAILIE_EVAL_MAX_OUTPUT_TOKENS=50000 \
TRAILIE_EVAL_CAPTURE_PRIVATE_DRAFTS=true \
node eval/run-stage14_7-early-visibility-two.js
```

Estimated spend remains capped at **$0.75**, ≤ 12 requests, two scenarios once each.

---

## Environment left running

The isolated `mongod` on **127.0.0.1:27018** is still running (dbpath
`/tmp/trailverse-eval-14-7-mongo`, log `/tmp/trailverse-eval-14-7-mongod.log`) and
its database is **empty — 0 collections**. Stop it with `pkill -f "port 27018"` if
you would rather not leave it up.

---

## Stop

Stage 14.7A incomplete. Zero provider calls, zero spend, no flags enabled, no
commits, production data untouched.
