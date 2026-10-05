'use strict';

const { evidenceForStop } = require('./semanticDayValue');

/**
 * Deterministic conditional dependence from frozen evidence + resolved dates.
 * No season-to-date guessing; only already-resolved ISO dates are read.
 */
function conditionalDependency(stop, bundle, { constraints = {}, userPrompt = '' } = {}) {
  const records = evidenceForStop(stop, bundle);
  const held = require('./travelerFitEvaluation').declaredCapabilities(constraints, userPrompt);
  const start = constraints?.dates?.startDate;
  const end = constraints?.dates?.endDate || start;
  const datesKnown = /^\d{4}-\d{2}-\d{2}$/.test(start || '') && /^\d{4}-\d{2}-\d{2}$/.test(end || '');
  const first = datesKnown ? new Date(`${start}T00:00:00Z`) : null;
  const last = datesKnown ? new Date(`${end}T00:00:00Z`) : null;
  return records.some((row) => {
    const value = row.claim?.normalizedValue || {};
    const facts = `${row.claim?.text || ''} ${value.description || ''}`;
    const months = Array.isArray(value.operatingMonths) ? value.operatingMonths.map(Number) : [];
    let inOperatingMonths = false;
    if (months.length && first && last && last >= first && last - first <= 366 * 86400000) {
      inOperatingMonths = true;
      for (let date = new Date(first); date <= last; date.setUTCDate(date.getUTCDate() + 1)) {
        if (!months.includes(date.getUTCMonth() + 1)) { inOperatingMonths = false; break; }
      }
    }
    const permitHeld = held.has('permit');
    const dependency = (value.operationalFacts || []).some((f) => {
      if (['satisfied', 'confirmed', 'not_required'].includes(f.status)) return false;
      if (/permit|reservation/.test(f.type || '') && permitHeld) return false;
      return /season|permit|reservation|weather_dependency|shuttle_dependency|road_status/.test(f.type || '');
    });
    const seasonal = !inOperatingMonths && (value.seasonal === true || months.length > 0
      || /\b(during (?:the )?(?:summer|winter)|seasonal (?:hours|access|opening|operation|closures?|programs?)|operates? seasonally|summer season|open only)\b/i.test(facts));
    const permit = !permitHeld && /\b(?:permit|reservation) required\b/i.test(facts)
      && !/\bno (?:permit|reservation) required\b/i.test(facts);
    return dependency || seasonal || permit;
  });
}

module.exports = { conditionalDependency };
