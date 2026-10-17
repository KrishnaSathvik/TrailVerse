# Offline operational-binding evidence

`operational-binding-evidence.json` is the repository-local fixture for
`evidenceEntityBinding.test.js`. It retains the 294 public normalized evidence
records used by the historical Grand Teton operational-binding regression.

Source: the `bundle` in the local acceptance capture
`artifacts/trailie-phase4nr-live-rerun/frozen-bundle.json`. The test no longer
loads that capture or assumes a developer checkout path.

Retained record fields: evidenceId, entityId, topic, evidenceType,
schemaVersion, claim, scope, source, observation, quality. Database IDs,
request/refresh bookkeeping, capture prompts, user constraints, provenance and
session material were not copied. The export was checked for credential-shaped
strings and credential-bearing URL query parameters. Official identities,
claim text, observation metadata and schema versions are unchanged; this is
historical offline evidence, not a refreshed v7/live-provider snapshot.

Purpose: direct-entity binding, name/namespace equivalence, no operational
requirement leakage to similarly named neighboring places, and evidence-bound
repair candidate identity. Ship this file with the test in any clean checkout.
