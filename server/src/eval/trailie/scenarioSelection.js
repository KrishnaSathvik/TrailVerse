'use strict';

/**
 * Stage 13.8B §1 — fail-closed scenario selection override for targeted runners.
 *
 * `TRAILIE_EVAL_SCENARIO_IDS` is a comma-separated list of scenario ids drawn from
 * the executable scenario inventory. It affects EVALUATION SELECTION ONLY: nothing
 * on a production route or in generation policy reads it (proved by test).
 *
 * Every failure mode aborts the runner BEFORE a provider call:
 *   - empty list
 *   - unknown id (not in the supplied inventory)
 *   - duplicate id
 *   - count != the runner's contract
 *
 * Supplied order is authoritative — targeted runs order scenarios by cost.
 */

const SCENARIO_IDS_ENV = 'TRAILIE_EVAL_SCENARIO_IDS';

/** Split a raw env value into trimmed ids, dropping empty segments, preserving order. */
function parseScenarioIdList(raw) {
  if (typeof raw !== 'string') return [];
  return raw.split(',').map((s) => s.trim()).filter(Boolean);
}

/**
 * @param {object}   args
 * @param {string=}  args.raw            raw env value (undefined = override absent)
 * @param {object[]} args.inventory      executable scenarios ({ scenarioId, ... })
 * @param {number}   args.requiredCount  exact number of scenarios this runner accepts
 * @param {boolean=} args.required       when false, an absent value is OK (default true
 *                                       once a value is present; absence => applied:false)
 * @returns {{ ok, applied, ids, scenarios, errors, printable }}
 */
function resolveScenarioSelection({ raw, inventory, requiredCount, supportedIds = null, required = true }) {
  const present = typeof raw === 'string';
  const ids = parseScenarioIdList(raw);
  const errors = [];

  if (!present && !required) {
    return {
      ok: true, applied: false, ids: [], scenarios: [], errors: [],
      printable: { env: SCENARIO_IDS_ENV, applied: false, count: 0, ids: [] },
    };
  }

  const known = new Set((inventory || []).map((s) => s.scenarioId));
  const supported = supportedIds ? new Set(supportedIds) : null;
  const seen = new Set();

  if (ids.length === 0) errors.push(`${SCENARIO_IDS_ENV} resolved to an empty scenario list`);
  for (const id of ids) {
    if (!known.has(id)) errors.push(`unknown scenario id: ${id}`);
    else if (seen.has(id)) errors.push(`duplicate scenario id: ${id}`);
    // A known id the executing harness would silently drop is a fail-closed error:
    // the run must never quietly execute fewer scenarios than were approved.
    else if (supported && !supported.has(id)) errors.push(`not executable by this runner: ${id}`);
    seen.add(id);
  }
  if (Number.isFinite(requiredCount) && ids.length !== requiredCount) {
    errors.push(`expected exactly ${requiredCount} scenarios, got ${ids.length}`);
  }

  const ok = errors.length === 0;
  const byId = new Map((inventory || []).map((s) => [s.scenarioId, s]));
  return {
    ok,
    applied: true,
    ids: ok ? ids : [],
    scenarios: ok ? ids.map((id) => byId.get(id)) : [],
    errors,
    // Sanitized: ids only. Never scenario prompts or expectations.
    printable: { env: SCENARIO_IDS_ENV, applied: true, ok, count: ok ? ids.length : 0, ids: ok ? ids : [] },
  };
}

module.exports = { SCENARIO_IDS_ENV, parseScenarioIdList, resolveScenarioSelection };
