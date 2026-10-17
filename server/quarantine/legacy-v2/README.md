# Legacy V2 wiring quarantine

These 58 reviewed suites exercise the rollback executor, bridge or retired pre-model semantic planners as their
system under test. See ownership.json for each suite's imports and test cases.
The compatibility aliases explicitly identify these owners as rollback-only;
`node scripts/trace-model-first-legacy-reachability.js` reports zero legacy hits.
Mixed shared-helper, provider, auth/security and model-first suites remain active.

Assertions and original source/fixture targets are preserved. Historical failures
are not passes. Some require ignored historical capture artifacts.
`canonicalRouteConvergence` asserts the retired bridge, V2 checkpoints and day
value quotas. Current route parity remains in modelFirstCutover and
trailieArtifactAccess, which run in the default suite.

Opt-in diagnostic run (not a release gate, known historical failures):

    node scripts/run-provider-disabled-tests.js --config jest.quarantine.config.js --runInBand
