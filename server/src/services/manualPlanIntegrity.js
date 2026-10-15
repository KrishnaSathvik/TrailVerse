'use strict';

const { validateDayCompleteness, validateBaseTransition } = require('../utils/dayCompleteness');
const { evaluateTripSchemaVersion } = require('../../../shared/tripSchemaVersion.cjs');

/**
 * Structural integrity for owner manual edits. Reuses dayCompleteness /
 * base-transition helpers; does not run AI evidence or memory loops.
 *
 * @returns {{ ok: true } | { ok: false, code: string, issues?: string[] }}
 */
function validateManualPlanIntegrity(plan, { touchedDayNumbers = null } = {}) {
  if (!plan || !Array.isArray(plan.days) || plan.days.length === 0) {
    return { ok: false, code: 'manual_mutation_invalid' };
  }

  const schema = evaluateTripSchemaVersion(plan);
  if (!schema.ok) {
    return { ok: false, code: schema.code };
  }

  const issues = [];
  const touched = Array.isArray(touchedDayNumbers) && touchedDayNumbers.length
    ? new Set(touchedDayNumbers)
    : null;

  for (const day of plan.days) {
    if (touched && !touched.has(day.dayNumber)) continue;
    issues.push(...validateDayCompleteness(day, { required: true }));
  }

  for (let i = 1; i < plan.days.length; i += 1) {
    const prev = plan.days[i - 1];
    const cur = plan.days[i];
    if (touched && !touched.has(prev.dayNumber) && !touched.has(cur.dayNumber)) continue;
    issues.push(...validateBaseTransition(prev, cur));
  }

  // Dangling stopIds across the whole plan (not just touched days).
  for (const day of plan.days) {
    const stopIds = new Set((day.stops || []).map((s) => s.id).filter(Boolean));
    for (const block of day.dayStructure?.blocks || []) {
      for (const id of block.stopIds || []) {
        if (!stopIds.has(id)) issues.push('day_stop_coverage_invalid');
      }
    }
  }

  if (issues.length) {
    const unique = [...new Set(issues)];
    const code = unique.includes('day_structure_missing') || unique.includes('day_structure_invalid')
      ? 'day_structure_invalid'
      : unique[0];
    return { ok: false, code, issues: unique };
  }

  return { ok: true };
}

module.exports = { validateManualPlanIntegrity };
