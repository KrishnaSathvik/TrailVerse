#!/usr/bin/env bash
# Local One-Brain gate runner (provider-disabled). Mirrors CI job coverage.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

export NODE_ENV=test
export JWT_SECRET="${JWT_SECRET:-test_jwt_secret_one_brain}"
export CLIENT_URL="${CLIENT_URL:-http://localhost:3000}"
export TRAILIE_TEST_PROVIDER_MODE=deny_live

echo "== runtime-isolation =="
(cd server && npx jest src/config/__tests__/trailieRuntimeSelection.test.js --runInBand --coverage=false)
(cd server && node scripts/trace-model-first-legacy-reachability.js)
(cd server && node scripts/run-provider-disabled-tests.js \
  src/routes/__tests__/modelFirstLegacyIsolation.test.js \
  src/routes/__tests__/modelFirstCutover.test.js --runInBand --coverage=false)

echo "== canonical-commit =="
(cd server && node scripts/run-provider-disabled-tests.js \
  src/services/__tests__/trailieCanonicalCommitParity.test.js \
  src/routes/__tests__/modelFirstCutover.test.js --runInBand --coverage=false)
(cd next-frontend && npx vitest run src/utils/__tests__/modelFirstPersistence.test.js)

echo "== truth-boundary =="
(cd server && node scripts/run-provider-disabled-tests.js \
  src/utils/__tests__/experienceMapAnchorTruth.test.js \
  src/services/__tests__/namedPlaceExperience.test.js --runInBand --coverage=false)

echo "== mcp-parity =="
(cd mcp-server && .venv/bin/python -m pytest \
  tests/test_mcp_renderer_only.py tests/test_canonical_parity.py tests/test_model_first_contract.py -q)

echo "== public-export-parity =="
(cd server && node scripts/run-provider-disabled-tests.js \
  src/utils/__tests__/publicPlanExportBoundary.test.js \
  src/utils/__tests__/oneBrainSemanticParity.test.js \
  src/routes/__tests__/projectionBoundaries.test.js --runInBand --coverage=false)
(cd next-frontend && npx vitest run \
  src/lib/__tests__/publicItineraryExport.test.js \
  src/lib/__tests__/publicExportBoundaryParity.test.js \
  src/lib/pdf/__tests__/buildTripExportPayload.test.js)

echo "== schema-version =="
(cd server && node scripts/run-provider-disabled-tests.js \
  src/utils/__tests__/tripSchemaVersion.test.js --runInBand --coverage=false)
(cd next-frontend && npx vitest run src/lib/__tests__/publicExportBoundaryParity.test.js)
(cd mcp-server && .venv/bin/python -m pytest tests/test_mcp_renderer_only.py -q)

echo "== sample-verification =="
(cd next-frontend && npx vitest run \
  src/lib/__tests__/oneBrainSamplesVerification.test.js \
  src/lib/__tests__/trailieDemoCapture.test.js)

echo "== demo-contract =="
(cd next-frontend && npx vitest run \
  src/lib/__tests__/oneBrainDemoContract.test.js \
  src/lib/__tests__/trailieDemoPlayback.test.js)

echo "Trailie One-Brain — PASS"
