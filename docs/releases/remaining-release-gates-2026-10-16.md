# Focused release gates — October 16, 2026

Deployment remains on hold. This follow-up to `4c8ad357` is limited to configuration preparation, dependency-chain review, and authenticated runtime access. No push, deployment, hosted setting change, or planning-engine change was made.

## Coordinated MCP configuration change — prepared, not applied

| Field | Required value |
| --- | --- |
| Workspace | My Workspace (`tea-d3ikoc2dbo4c73fqtdd0`) |
| Service | `trailverse-mcp` (`srv-d7kql4navr4c73e3gth0`) |
| Key | `PLAN_TRIP_TIMEOUT` |
| Saved current value | `30` |
| Release value | `180` |
| Preserve | `BACKEND_TIMEOUT=30` and existing matching bypass secrets |

The candidate Blueprint already specifies 180. Apply the hosted setting only within an approved coordinated backend/MCP release. Before release, identify exact revisions for both services, capture rollback revisions, reconcile the backend build command with the validated `npm ci` path, and account for MCP auto-deploy on master. Do not push to trigger an incidental MCP deployment. After release, verify the active processes, paired-secret equality without disclosure, completion and cancellation before accepting the release. Rollback must restore the paired revisions and recorded configuration; do not treat 30 seconds as a satisfactory final state.

### Deadline review

- MCP `server/client.py` passes its separate planning timeout to the HTTPX POST. An explicit hosted `30` overrides the candidate's `180` default. HTTPX's timeout governs network phases; it is not proof of a single end-to-end 180-second wall-clock budget.
- The candidate MCP default backend URL points directly to Render, outside the website's Vercel rewrite. The effective hosted backend URL and external ChatGPT/Claude client deadlines still need verification. No claim of complete MCP deadline coverage is made.
- Website nonstreaming AI calls in `next-frontend/src/services/aiService.js` explicitly use 120,000 ms. Streaming calls use fetch with the caller's abort signal and do not set that Axios deadline.
- `next-frontend/next.config.mjs` externally rewrites `/api/*` to Render. [Vercel's error documentation](https://vercel.com/docs/errors/router_external_target_error) specifies a 120-second maximum wait for an external target to respond. A Node function's duration setting does not establish the deadline of this external rewrite. The existing four-second SSE smoke does not validate a long stream or a 180-second nonstreaming request. Do not infer a hard 120-second total lifetime for an already-streaming response from this documentation alone.
- Render's general web-service documentation did not establish all relevant request/proxy deadlines. Long-request acceptance remains open; no unverified platform limit is substituted for measurement.

## CI gate — reduced, still failing

A scoped backend override sets `@istanbuljs/load-nyc-config > js-yaml` to **4.3.2**. The loader calls `load`, which remains available. This removes its argparse 1 / sprintf-js chain. YAML 4.3.2 was already present in the backend's OpenAPI parser chain; npm deduplicated that version. No framework or test-runner migration was performed.

- Backend audit: **31 high, zero moderate/critical**, down from 36 total.
- Frontend: unchanged at **14 findings** from the preceding audit.
- Combined remaining findings: **45**, down from 50; 24 of the original 69 entries are now resolved.
- Backend production-only audit: **zero**. Frontend production dependencies were unchanged; their prior zero-finding result remains separate evidence.
- The moderate-severity audit threshold is unchanged and still fails.

Targeted replacement review:

| Chain | Evidence and disposition |
| --- | --- |
| Micromatch → braces | Registry latest Micromatch 4.0.8 still requires braces ^3.0.3; braces latest remains 3.0.3. Picomatch alone is not a compatible replacement for the full braces parse/compile/expand API used by these consumers. No blind alias or fake version used. |
| Coverage loader → sprintf-js | Removed by the scoped YAML override. Actual loader successfully parsed an isolated `.nycrc.yml` with arrays, booleans and a hyphenated setting. |
| Lighthouse utils → sprintf-js | Latest LHCI remains 0.15.1. Its YAML consumer calls `safeLoad`, removed by YAML 4; applying the same override would break that path. Retained pending a compatible consumer patch/replacement. |
| Puppeteer browsers → extract-zip | Compatible latest Puppeteer Core 24.43.1 uses browsers 2.13.2, which still requires extract-zip ^2.0.1. Browsers 3.2.5 uses a different extraction chain, but forcing that major into Puppeteer 24 is not a demonstrated compatible security fix. No speculative major override applied. |

No published patched versions were found for the three root packages in the registry queries. This review is not an exhaustive endorsement of third-party forks. The audit remains the release gate.

Validation: the actual NYC YAML loader compatibility check passed. Both focused backend suites passed with coverage enabled: **42 tests**, zero live provider dispatches or external provider HTTP requests. The first sandboxed attempt could not bind the isolated MongoDB fixture; rerunning with local socket permission passed. Backend audits were rerun after installation. No frontend build was repeated for this backend development-tool-only change.

## Runtime access and provider cancellation — blocked

The Oregon host fingerprint from [Render's official SSH documentation](https://render.com/docs/ssh#renders-public-key-fingerprints) matches the fetched Ed25519 key:

`SHA256:KkZPgnApmttFYSkdJsCi7B01sgZPMI6kY53MDbbanGM`

The key was placed in a temporary known-hosts file and used with `StrictHostKeyChecking=yes`. Host verification is resolved. Authentication then returned **Permission denied (publickey)**; the available client identity is not accepted. No host-key bypass, account-key addition, or remote configuration mutation was performed. An existing Mac public key must be enabled for the Render account, or an authenticated Dashboard Shell made available, to continue.

Saved bypass-secret equality remains verified; active-process equality, active backend Node version and MCP timeouts remain unverified. The previous hosted cancellation smoke proved the client reader aborted, but correlated backend/provider evidence was absent. No further provider request was made without a way to observe its cancellation.

Once runtime access is available, correlate one bounded request by client turn ID and backend/provider request ID: capture disconnect time, abort-signal propagation and provider termination; check that no final response is committed after cancellation and report quota/billing effects only if observable. A missing log line or HTTP success is not acceptance evidence. Repeat on the approved release candidate; evidence from the older live revisions cannot sign off the candidate.
