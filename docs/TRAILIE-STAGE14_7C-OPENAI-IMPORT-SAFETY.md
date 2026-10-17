# Trailie Stage 14.7C — OpenAI import safety

**Status: §1 complete. §2–§13 not started. Zero provider calls. $0.00 spend.**
Both production flags off. Nothing committed or pushed. No Atlas connection.

---

## 1. The OpenAI lazy-client fix — done

`src/services/openaiService.js` previously did this at module scope:

```js
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
```

Because this module sits in the AI router's import graph, **the entire router was
unimportable without an OpenAI key** — including for Claude-only requests that
never touch OpenAI.

Replaced with a lazy, memoized, injectable seam:

```js
getOpenAIClient()          // builds on first use, caches per key
OPENAI_NOT_CONFIGURED      // bounded code: 'openai_not_configured'
__setOpenAIClientConstructorForTests(ctor)
```

Both call sites (`openai.chat.completions.create` at lines 26 and 53) now go
through `getOpenAIClient()`. The default export is unchanged — still the
`OpenAIService` singleton — so every existing caller is untouched; the seams are
attached to it rather than replacing the export shape.

Behavior now matches the required contract exactly:

```
import openaiService without a key        → succeeds
import the AI router without a key        → succeeds
Claude-only path                          → no client constructed
OpenAI path without a key                 → throws `openai_not_configured` at INVOCATION
```

No fake key was introduced anywhere.

### Tests — 9/9 passing

`src/services/__tests__/openaiImportSafety.test.js` covers all seven required
cases plus two more:

1. service imports without a key
2. AI router imports without a key
3. a Claude-only path constructs no client (spy asserts zero constructor calls)
4. invocation without a key → bounded `openai_not_configured`
5. lazy construction when a key is present — nothing built until asked, and the
   constructor receives exactly `{ apiKey }`
6. constructor runs **at most once** for the same configuration; all three
   `getOpenAIClient()` calls return the identical object
   - 6b. a *changed* key rebuilds (memoization is per-key, not permanent)
7. no secret, env value, or SDK text leaks — the error message is exactly
   `openai_not_configured`, and asserted not to contain the key or the SDK's own
   "environment variable is missing" wording
8. a source-level assertion that module-scope construction cannot return

### Regression check

```
server src/ suite : 140 suites, 1,522 tests → 1,517 passing
route + OpenAI suites: 8 suites, 119 tests → 119 passing
```

The 5 failures are the unchanged pre-existing live-data ones. The suite grew from
1,493 → 1,522; no existing test changed behavior.

---

## 2. A second finding of the same class

With OpenAI fixed, importing the AI router without `NPS_API_KEY` now fails at:

```
NPS API key is required. Please set NPS_API_KEY in your environment variables.
```

This is the **same `unexpected_import_side_effect` pattern** in a different
module. `NPS_API_KEY` *is* configured in this repo's `.env`, so it is not blocking
anything today, and §1 scoped this stage to OpenAI — so I supplied the key inside
the two affected tests to isolate the OpenAI dimension, and documented that
inline rather than silently.

**Recommendation:** apply the same lazy treatment to the NPS module. Any process
that imports the AI router without an NPS key still crashes at import, which will
resurface the moment the evaluation harness tries to control NPS as a dependency
(§6 requires exactly that).

---

## 3. What is NOT done

| § | Item | Status |
|---|---|---|
| 2 | evaluation fixture correction + fixture-validation test | **not done** |
| 3 | env-load-order test for the child process | **not done** |
| 4 | fresh-child-process route proof | **not done** |
| 5 | application-factory review | **not done** |
| 6 | dependency-isolation table | **not done** |
| 7 | outbound-network guard | **not done** |
| 8 | authenticated actual-route driver | **not proven** |
| 9 | two deterministic scenarios | **not run** |
| 10 | cleanup/interruption tests | **not written** |
| 11 | composite readiness gate | **not implemented** |
| 12 | final preflight with composite result | **not run** |

`liveExecutionReady` is **false**. The `staticConfigurationPreflight: 14/14`
result from 14.7A still stands and still authorizes nothing on its own.

Note that §2's fixture correction was applied to the *diagnostic* script in 14.7B
(`.com` address), but the fixture-validation test that would surface an invalid
seed during preflight — rather than inside `beforeAll` — was not written.

---

## 4. Recommended next order

1. Give the NPS module the same lazy treatment (§2 above) — otherwise §6 is blocked.
2. §7 outbound-network guard, installed before any application import.
3. §6 dependency-disposition table.
4. §4 fresh-child-process driver + §5 factory review.
5. §8/§9 two-scenario proof with the visibility journal.
6. §10 cleanup tests, §11 composite gate, §12 final preflight.

---

## 5. Unchanged live command and cap

```bash
cd server

TRAILIE_EVAL_PREFLIGHT_ONLY=true \
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

Estimated live cap unchanged: **$0.75**, ≤ 12 requests, two scenarios once each.

---

## 6. Environment

`mongod` is running on **127.0.0.1:27018** (dbpath `/tmp/trailverse-eval-14-7-mongo`).
The evaluation database is empty. Stop it by PID:

```bash
kill "$(lsof -nP -iTCP:27018 -sTCP:LISTEN -t)"
```

---

## Stop

Stage 14.7C: §1 complete, remainder not started. Zero provider calls, zero spend,
no flags enabled, no commits. Live execution remains blocked.
