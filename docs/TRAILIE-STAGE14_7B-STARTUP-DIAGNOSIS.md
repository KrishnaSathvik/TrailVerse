# Trailie Stage 14.7B — Actual-route startup diagnosis

**Status: diagnosis complete, stage otherwise incomplete. Zero provider calls. $0.00 spend.**
Both production flags off. Nothing committed or pushed. Production data untouched.

---

## 1. Exact checkpoint where the hang occurred

`server/eval/stage14_7b-startup-checkpoints.js` walks the startup sequence one
bounded step at a time. Result:

```
ok    A. install evaluation environment            (0ms)
ok    B. isolated-store guard                      (1ms)   127.0.0.1:27018/trailverse_eval_14_7
ok    C. import mongoose                         (212ms)   v7.8.7
ok    D. connect to isolated MongoDB               (8ms)
ok    E. verify connected host/database            (0ms)   127.0.0.1/trailverse_eval_14_7
ok    E2. evaluation-owned probe round-trip        (5ms)   insert+delete ok
ok    F. import evaluation-owned models           (10ms)
ok    I. seed evaluation user                     (90ms)   create+delete ok
ok    G. import authentication middleware         (53ms)
FAIL  H. import AI router                       (1315ms)   checkpoint_error
H2.   import trips router                        (15ms)   ok
```

**Checkpoint I — `User.create` — is where Stage 14.7A stalled**, not the AI
router and not MongoDB. On the first diagnostic pass it took **17,750 ms** and
then threw.

---

## 2. Root causes — two, both mine, neither the one I guessed

I said in the 14.7A report that uncontrolled NPS/weather calls were "the most
likely cause." **That was wrong.** Neither was involved.

### Cause 1 — invalid fixture email (the actual 14.7A failure)

`src/models/User.js:28` validates email with:

```js
/^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/
```

The TLD group allows **2–3 characters**. My harness used
`eval-14-7a-<uuid>@example.invalid` — a 7-character TLD — so `User.create`
rejected it with `email: Please provide a valid email`, `beforeAll` threw, and the
database was left with **0 collections**, which is exactly the symptom reported.

Corrected to a `.com` fixture address, checkpoint I completes in **90 ms**.

### Cause 2 — import-time side effect in the AI router graph

With `OPENAI_API_KEY` deleted (which my driver did deliberately, to guarantee zero
OpenAI calls), importing the AI router throws:

```
The OPENAI_API_KEY environment variable is missing or empty;
either provide it, or instantiate the OpenAI client with an ...
```

Located precisely:

```
src/services/openaiService.js:8   const openai = new OpenAI({ ... })
```

This is constructed **unconditionally at module scope**, with no key guard —
unlike `routes/ai.js:301` and `services/trailieLiteLlm.js:26`, which both guard on
the key being present. It is reached transitively when the AI router is imported.

Classification per §6: **`unexpected_import_side_effect`**.

This is a genuine finding about the application, not a harness artifact: any
process that imports the AI router without an OpenAI key crashes at import. It
also means "omit the API key" is not a valid isolation strategy for OpenAI — which
is precisely what §5 warned against.

### A third finding, about my own diagnostic

The first checkpoint run reported `NPS API key is required` at checkpoint H. That
was a **diagnostic artifact**: the script had not called `require('dotenv').config()`,
so `NPS_API_KEY` — which *is* present in `.env` — was invisible. Corrected. I am
recording it because it briefly looked like a second application defect and was not.

---

## 3. Startup timing by checkpoint

See §1. Every step except H is now under 250 ms; total pre-router startup is
under 400 ms. The original 17.7 s at checkpoint I was validation failure against a
cold connection, not index building or a genuine hang — it does not reproduce once
the fixture is valid.

---

## 4. What is NOT done

I want to be unambiguous, because a partial result here previously got mistaken
for readiness:

| § | Item | Status |
|---|---|---|
| 1 | composite `liveExecutionReady` gate | **not implemented** |
| 4 | application-factory seam review | not done |
| 5 | full outbound dependency disposition table | **not done** |
| 5 | evaluation-only outbound network guard | **not implemented** |
| 6 | import-time network activity test | not written (though one such defect was found manually) |
| 7 | completed actual-route driver | still blocked on §5 |
| 8 | deterministic two-scenario route proof | **not run** |
| 9 | visibility-ordering journal from a real route | not obtained |
| 10 | interrupted-cleanup tests | **not written** |
| 11 | production-isolation instrumentation | not implemented |
| 12 | dry run integrated into readiness | not done |

**`liveExecutionReady` is false.** The `staticConfigurationPreflight: 14/14`
result stands but authorizes nothing on its own.

---

## 5. Next actions, in order

1. **Fix the import-time defect properly.** Either guard
   `openaiService.js:8` the way the other two call sites already do, or give it a
   lazy accessor. This is a small behavior-preserving change with real value beyond
   evaluation — it currently makes the AI router unimportable without an OpenAI key.
2. Implement the §5 outbound network guard (allow only `127.0.0.1:27018` and the
   ephemeral test server; everything else fails immediately with a bounded code),
   installed **before** any application import.
3. Build the §5 disposition table for NPS, weather, images, blog context, web
   search, geocoding, review queue.
4. Re-run the checkpoint script; expect H to pass.
5. Complete the §8 two-scenario proof and §9 journal.
6. Write the §10 cleanup tests.
7. Implement the §1 composite gate and wire the dry run into readiness (§12).

---

## 6. Unchanged live command and cap

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

## 7. Environment

`mongod` was stopped by its captured listening PID (`37977`) rather than a broad
`pkill`, then restarted explicitly on **127.0.0.1:27018** (dbpath
`/tmp/trailverse-eval-14-7-mongo`, log `/tmp/trailverse-eval-14-7-mongod.log`).

The evaluation database holds only what the checkpoint probes created and deleted;
both the probe record and the probe user were removed by the same run. Stop it
when convenient with:

```bash
kill "$(lsof -nP -iTCP:27018 -sTCP:LISTEN -t)"
```

---

## Stop

Stage 14.7B: diagnosis complete, remaining scope not started. Zero provider calls,
zero spend, no flags enabled, no commits. Live execution remains blocked.
