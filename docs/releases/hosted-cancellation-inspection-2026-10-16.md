# Hosted cancellation inspection — read-only

**Result: not verified.** No new live AI request, deployment, configuration change, database write, or application edit was performed. SSH host verification remained strict.

## Evidence inspected

The live backend revision is `cffedbef29a2fd6765e1ae1b61d9d5b9c8c043ed`. Read-only SSH inspection found:

- `src/routes/ai.js`: both streaming routes obtain a disconnect abort signal and pass it into `streamRawLLMToSse`. The anonymous route checks `signal.aborted || streamResult?.aborted` immediately after streaming and returns before final assistant-response processing when true.
- `src/services/aiProviderStream.js`: the signal is forwarded in request options to both Anthropic and OpenAI SDK calls. The stream loops check signal state and return an aborted result. The helper has no correlated provider-abort log event.
- `src/utils/sseStream.js`: the deployed disconnect helper listens to **`req.on('close')`**, with no response completion guard.
- Candidate `db419a43` already uses **`res.on('close')`** and ignores normal completion via `res.writableEnded`. This is an existing candidate correction, not a new change from this inspection. The old deployed implementation is not evidence about candidate behavior.

Render application logs were searched for the prior cancellation smoke window, `2026-10-16T15:37:52Z` through `15:38:15Z`, using its client turn ID `4528283d-d693-4322-ab4d-7541c31baaab`, anonymous test ID `guest_v2_9405303b-5ce7-4813-9ba9-087db30f1cc5`, and abort/cancel/disconnect terms. The query returned no entries and `hasMore=false`. This does not prove absence of cancellation, nor absence of persistence. The deployed helper does not itself emit the necessary correlated event.

## Interpretation

Source inspection establishes intended signal forwarding and an early return guard, not a witnessed client-disconnect → backend-abort → provider-termination sequence. The old request-close listener differs from the corrected candidate response-close listener. Do not classify the hosted path as passing on the basis of SDK signal options alone.

There is no correlated provider termination evidence or post-cancel persistence evidence for the previous smoke. No unrelated user conversations or database records were read. No claim about billing or quota outcomes is made.

## Next verification gate

Before authorizing a new bounded request, establish a usable observation path: the same client turn must be correlatable to the backend abort event, provider request/termination evidence, and final persistence outcome. A repeated client-side abort without that observation would not resolve this gate. Any new live request requires separate user authorization, as requested.

Candidate acceptance must exercise the response-close implementation on an explicitly authorized hosted candidate environment. Existing local production-stack cancellation tests remain local evidence; the older live service cannot sign off unreleased code. No provider request or deployment is authorized by this document.

The CI gate remains at 45 reported findings. No dependency or audit-policy changes were made during this read-only investigation; the compatible-chain review and its limitations remain in [the focused gate report](remaining-release-gates-2026-10-16.md). Production deployment remains on hold.
