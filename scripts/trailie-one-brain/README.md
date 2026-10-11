# Trailie One-Brain gates

Local mirrors of `.github/workflows/trailie-one-brain.yml`.

```sh
# From repo root — run the same provider-disabled suites CI uses.
./scripts/trailie-one-brain/run-local.sh
```

Jobs (parallel in Actions, sequential locally):

| Job | Gates |
|---|---|
| runtime-isolation | runtime selection + legacy require-time + throw-on-invoke |
| canonical-commit | commit parity + cutover + persisted:true |
| truth-boundary | experience ↔ map-anchor |
| mcp-parity | renderer-only + canonical lossless |
| public-export-parity | shared export + semantic fixture + share/PDF |
| schema-version | tripSchemaVersion |
| sample-verification | all 10 Samples |
| demo-contract | exporter/renderer + `DEMO_CURRENT_CONTRACT` |

Demo currency flag: `shared/demoCurrentContract.cjs` (`false` until recapture).
