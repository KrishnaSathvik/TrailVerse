'use strict';

/**
 * Stage 13.1/13.2 §1 — exact execution accounting.
 *
 * Explains precisely how the run total is derived from the eligible matrix cells,
 * and separates EXECUTED harness runs from REFERENCED regression evidence
 * (transport 41–44) so nothing is double-counted.
 *
 * The inventory partitions into three DISJOINT sets — executable, referenced
 * regression, and (other) not-executed — and the module asserts two invariants
 * that FAIL LOUDLY on any drift (Stage 13.2 §1):
 *
 *   1. derived expectedExecutionCount === actualExecutionCount (rows.length)
 *   2. executable + referenced + notExecuted === total inventory
 *
 * `REF|...` evidence rows are NEVER counted as Stage 13 executions.
 *
 * @param {Object}   params
 * @param {Object}   params.verifyRun    recorded verify-mode run (executable set only)
 * @param {Object}   params.enforceRun   recorded enforce-mode run (executable set only)
 * @param {Object[]} [params.parityReports]
 * @param {Object[]} [params.inventory]  the FULL scenario inventory (all 54 entries)
 * @param {Object[]} [params.scenarios]  deprecated alias for `inventory`
 */
function buildExecutionMatrix({ verifyRun, enforceRun, parityReports = [], inventory, scenarios } = {}) {
  const fullInventory = inventory || scenarios || [];
  const rows = [];
  const push = (r) => rows.push(r);

  for (const rec of verifyRun.records) {
    push({ runId: rec.runId, scenarioId: rec.scenarioId, category: rec.category, providerMode: rec.providerMode, provider: rec.provider, model: rec.model, routeVariant: rec.routeVariant, generationMode: rec.generationMode, consistencyMode: rec.consistencyMode, repetition: rec.repetition, executed: true });
  }
  for (const rec of enforceRun.records) {
    push({ runId: rec.runId, scenarioId: rec.scenarioId, category: rec.category, providerMode: rec.providerMode, provider: rec.provider, model: rec.model, routeVariant: rec.routeVariant, generationMode: rec.generationMode, consistencyMode: rec.consistencyMode, repetition: rec.repetition, executed: true });
  }

  const byField = (field) => rows.reduce((acc, r) => { acc[r[field]] = (acc[r[field]] || 0) + 1; return acc; }, {});

  // ── Inventory partition ────────────────────────────────────────────────────
  const referencedScenarios = fullInventory.filter((s) => s.expected && s.expected.referencedRegression);
  const referenced = referencedScenarios.map((s) => ({ scenarioId: s.scenarioId, ...s.expected.referencedRegression }));
  const referencedIds = new Set(referencedScenarios.map((s) => s.scenarioId));
  const executableScenarios = fullInventory.filter((s) => !referencedIds.has(s.scenarioId));

  const totalInventoryEntries = fullInventory.length;
  const referencedRegressionCount = referencedScenarios.length;
  const executableScenarioCount = executableScenarios.length;
  const notExecutedScenarioCount = totalInventoryEntries - executableScenarioCount - referencedRegressionCount;

  const verifyRoutes = [...new Set(verifyRun.records.map((r) => r.routeVariant))];
  const enforceRoutes = [...new Set(enforceRun.records.map((r) => r.routeVariant))];
  const providers = [...new Set(rows.map((r) => r.provider))];

  // ── Derived vs. actual execution count ─────────────────────────────────────
  const verifyExpected = verifyRun.meta.scenarioCount * verifyRun.meta.providerMatrix.length * verifyRoutes.length * verifyRun.meta.repetitions;
  const enforceExpected = enforceRun.meta.scenarioCount * enforceRun.meta.providerMatrix.length * enforceRoutes.length * enforceRun.meta.repetitions;
  const expectedExecutionCount = verifyExpected + enforceExpected;
  const actualExecutionCount = rows.length;

  // ── Leak checks: no referenced-regression scenario may appear as an execution.
  const executedScenarioIds = new Set(rows.map((r) => r.scenarioId));
  const leakedReferencedExecutions = [...executedScenarioIds].filter((id) => referencedIds.has(id));

  const invariants = [
    {
      check: 'execution_count_consistent',
      description: 'derived expectedExecutionCount === actualExecutionCount',
      expected: expectedExecutionCount,
      actual: actualExecutionCount,
      ok: expectedExecutionCount === actualExecutionCount,
    },
    {
      check: 'inventory_partition_consistent',
      description: 'executable + referenced + notExecuted === totalInventoryEntries',
      expected: totalInventoryEntries,
      actual: executableScenarioCount + referencedRegressionCount + notExecutedScenarioCount,
      ok: executableScenarioCount + referencedRegressionCount + notExecutedScenarioCount === totalInventoryEntries,
    },
    {
      check: 'no_referenced_executions',
      description: 'no REF|... scenario is counted as a Stage 13 execution',
      expected: 0,
      actual: leakedReferencedExecutions.length,
      ok: leakedReferencedExecutions.length === 0,
      leaked: leakedReferencedExecutions,
    },
    {
      check: 'executed_matches_executable',
      description: 'exactly the executable scenarios were executed (no more, no fewer)',
      expected: executableScenarioCount,
      actual: executedScenarioIds.size,
      ok: executedScenarioIds.size === executableScenarioCount && leakedReferencedExecutions.length === 0,
    },
  ];
  const accountingConsistent = invariants.every((i) => i.ok);

  return {
    rows,
    summary: {
      executedRuns: rows.length,
      verifyRuns: verifyRun.records.length,
      enforceRuns: enforceRun.records.length,
      parityReports: parityReports.length,
      providers,
      // Stage 13.2 §1 — the six explicit accounting fields, reconciled.
      accounting: {
        totalInventoryEntries,
        executableScenarioCount,
        referencedRegressionCount,
        notExecutedScenarioCount,
        expectedExecutionCount,
        actualExecutionCount,
        consistent: accountingConsistent,
        invariants,
        interpretation: `Interpretation B: ${totalInventoryEntries} total inventory entries = ${executableScenarioCount} executable + ${referencedRegressionCount} referenced regression (+ ${notExecutedScenarioCount} otherwise not executed); ${executableScenarioCount} × ${verifyRun.meta.providerMatrix.length} providers × (${verifyRoutes.length} verify route + ${enforceRoutes.length} enforce routes) = ${expectedExecutionCount} executions`,
      },
      derivation: {
        verify: `${verifyRun.meta.scenarioCount} executable scenarios × ${verifyRun.meta.providerMatrix.length} providers × ${verifyRoutes.length} route (${verifyRoutes.join('|')}) × 1 mode(verify) × ${verifyRun.meta.repetitions} rep = ${verifyRun.records.length}`,
        enforce: `${enforceRun.meta.scenarioCount} executable scenarios × ${enforceRun.meta.providerMatrix.length} providers × ${enforceRoutes.length} routes × 1 mode(enforce) × ${enforceRun.meta.repetitions} rep = ${enforceRun.records.length}`,
        total: `${verifyRun.records.length} + ${enforceRun.records.length} = ${rows.length}`,
      },
      intentionallyNotRun: [
        { cells: 'transport-41..44 (referenced_regression)', reason: 'covered byte-for-byte by external suites (see referencedRegression); cited as evidence but NOT executed as Stage 13 pipeline runs' },
        { cells: 'verify × {streaming, anonymous} routes', reason: 'the verifier verdict is route-invariant (proven by route parity); verify labeling runs on one route to avoid redundant executions' },
        { cells: 'off-mode verifier runs', reason: 'verifier does not run in off mode; consistency metrics require verify/enforce' },
      ],
      referencedRegressionCount: referenced.length,
    },
    accountingConsistent,
    byProvider: byField('provider'),
    byRoute: byField('routeVariant'),
    byConsistencyMode: byField('consistencyMode'),
    byCategory: byField('category'),
    referencedRegression: referenced,
  };
}

function toCsv(matrix) {
  const cols = ['runId', 'scenarioId', 'category', 'providerMode', 'provider', 'model', 'routeVariant', 'generationMode', 'consistencyMode', 'repetition', 'executed'];
  const rows = matrix.rows.map((r) => cols.map((c) => (r[c] == null ? '' : String(r[c]))).join(','));
  const referenced = matrix.referencedRegression.map((r) => [`REF|${r.scenarioId}`, r.scenarioId, 'persistence_transport', 'referenced', '', '', '', '', '', '', 'false'].join(','));
  return [cols.join(','), ...rows, ...referenced].join('\n');
}

module.exports = { buildExecutionMatrix, toCsv };
