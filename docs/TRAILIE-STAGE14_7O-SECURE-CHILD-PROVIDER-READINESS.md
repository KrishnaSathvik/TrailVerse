# Trailie Stage 14.7O — Secure child provider readiness

Stage 14.7O repairs the pre-provider failure recorded for run
`stage147g-msh0zd3p-3a32f5`. It is deterministic and makes no provider calls.

## Root cause

The bounded SSE error said `Claude API key not configured`, but the key had not
been dropped. The scenario child passed its inherited-key bootstrap check. The
failure occurred when `src/routes/ai.js` tried to construct its provider adapter:
the child runs with `NODE_ENV=test`, so `providerTestPolicy` required the separate
Jest live-suite acknowledgement. The authoritative Stage 14.7 command correctly
does not enable that suite. The policy exception was caught by the route and
collapsed into a null provider adapter, which produced the misleading SSE error.

The observed presence flow was:

```text
authoritative runner             true
→ live executor                  true
→ vite-node subprocess launcher  true
→ scenario driver                true
→ scenario child bootstrap       true
→ application provider adapter   true (constructor policy-refused)
```

There was no `true → false` credential-presence transition. The exact failure
boundary was scenario-child provider policy → application provider adapter.

## Repaired boundary

The authoritative flow is now:

```text
receipt + manifest + cumulative budget gates
→ explicit child-environment allowlist
→ vite-node scenario driver
→ explicit fork environment allowlist
→ pre-admission provider validation
→ live_child_ready handshake
→ turn admission
→ pre-reservation credential/model revalidation
→ reservation
→ provider_dispatch_authorized
→ SDK invocation
```

Only the Anthropic key, Claude model, Stage 14.7 flags and caps, isolated Mongo
target, and required local runtime values can cross the subprocess boundary.
OpenAI, email, search, NPS, RIDB, production Mongo and unrelated credentials are
not forwarded. The scenario child no longer loads `server/.env`.

`deny_live` remains dominant. Deterministic, replay, provider-disabled and
unauthorized modes receive no live Anthropic credential. A missing key fails
before lifecycle events. Removing the key after readiness returns
`live_provider_configuration_changed` before reservation or dispatch.
