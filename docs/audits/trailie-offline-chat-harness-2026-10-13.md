# Pass 3B — offline chat integration stabilization

## Verdict

The requested functional preflight passed without paid model dispatch: eight browser cases across two runs, at 390×850 and 1200×850. Each run covered successful synthetic submission and a real socket disconnect before the response. The second run additionally verified credentialed browser authentication, stable history reads while composing, exact persisted messages after reload, and unchanged persisted history after failure.

This is readiness evidence for review before a separately authorized live acceptance test. It is not Sol-stream, draft-to-plan, mid-generation interruption or production acceptance.

## Confirmed composer cause and repair

The actual chat initialization effect depends on `authRestoreStatus` and unconditionally loaded an existing URL trip. `loadExistingTrip()` sets that status to `pending`, then `restored`; those changes retriggered initialization. Browser logs showed repeated successful trip reads, repeated history replacement and a repeatedly disabled composer. Input could be cleared before submission.

`TripPlannerChat` now records the trip-and-owner key when beginning URL restoration, waits for authenticated owner identity, and does not restart that same restoration on status changes. Another trip or owner has a different key. A failed restoration retains the existing reload-to-retry behavior. This changes conversation initialization only; planning policy, model settings, proposal schema and guard are untouched.

## Offline harness contracts

The harness runs the actual Next chat page, model-first authenticated Express route, JWT/user middleware, quota admission, TripPlan model and canonical conversation store against temporary local MongoDB.

The model boundary is a fixed response double: “Offline submission received. No model was called.” No OpenAI client or key is loaded. SDK imports are prohibited, `TRAILIE_TEST_PROVIDER_MODE=deny_live` is set, and the backend outbound-network guard denies external traffic. Four response-double invocations occurred across the two completed runs; these are not provider calls. Provider counters were all zero, with zero blocked SDK import attempts.

The auth-me fixture matches the actual controller's user projection, including both `id` and `_id`. Real JWT verification and user lookup remain in place. Provider discovery uses the expected object shape. Actual trip-read/list controllers serve history. A local Socket.IO transport supplies connection establishment; this does not test product websocket notifications. API rewrites, browser API URL and websocket URL are all pinned to the isolated backend. Browser requests outside loopback are blocked.

Earlier setup failures were corrected before the passing runs: the response double used an invalid one-call runtime limit (the runtime requires at least two), and the auth fixture omitted `id`, causing `/trips/user/undefined`. Importing the entire auth controller also pulled in an unavailable email Babel preset, so the harness reproduces its response projection without loading email infrastructure. These are harness issues, not asserted production failures.

## Verification results

| Check | Result |
|---|---|
| Exact input retained before submission | Passed at both widths, both runs |
| Send enabled | Passed |
| One submission → one `/chat-stream` request | Passed; exact body compared |
| Synthetic success saved through actual canonical store | Passed |
| Reload retrieves exact submitted message and synthetic response | Passed in second run |
| Normal captured conversation loads | Passed |
| No repeated trip load while typing | Passed in second run |
| Real server-side socket close before model boundary | Passed; zero response-double invocations for failed requests |
| No non-streaming fallback or automatic retry | Passed |
| Failed submission leaves stored history unchanged | Passed in second run |
| Credentialed cross-origin browser auth | Passed in second run |
| CORS preflight allows exact local origin and credentials | Passed |
| Missing/invalid JWT | Both rejected with 401 |
| Valid JWT | 200 |
| Floating voice invitation absent in actual chat | Passed |

Fifteen focused frontend regression tests passed (8 transport, 4 replay rendering, 3 chat smoke/contract). `git diff --check` passed. The browser assertions provide the behavioral regression coverage for the restoration loop; the smoke suite alone does not prove it fixed.

## Limits and remaining observations

A development hydration warning about the composer's initial `disabled` attribute remains in console captures. The checks wait for loaded history and interactive state, then verify retention and readiness; they do not establish warning-free initial hydration. Initial guest-status probes can return 404 before authentication settles because this authenticated fixture creates no guest session. These observations are retained rather than hidden.

The disconnect check closes a real connection before the response double. It does not verify streamed draft withdrawal during generation or a commit race. The fixed response is conversational and does not validate live itinerary generation, draft timing, itinerary persistence or sharing/export/navigation isolation.

Private scripts, logs, screenshots and results are gitignored under `artifacts/private/pass3b-offline/`. The harness has no live switch. Start `server.cjs`, run the development frontend with API and websocket origins set to `http://127.0.0.1:3110`, preview opt-in enabled, and port 3107; run `check.cjs`. It creates fresh browser contexts and local fixture trips. Stop both processes after testing. No environment files were enabled.

No paid calls were authorized or made. All changes remain uncommitted; reserve discovery, production activation and broader Passes 4–5 remain held. Step 2 requires separate explicit authorization.
