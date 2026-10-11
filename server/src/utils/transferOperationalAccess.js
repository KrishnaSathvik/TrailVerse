'use strict';
const TRUSTED = new Set(['official_owner', 'official_partner', 'trusted_specialist']);
const MODES = new Set(['shuttle', 'transit', 'ferry', 'walking', 'bicycling']);
// Inputs are place-bound facts from fresh authoritative evidence, never model prose.
function resolveOperationalAccess(factGroups = [], dates = {}) {
  const rows = factGroups.flat().filter(f => TRUSTED.has(f.provenance?.authority) && f.provenance?.sourceUrl);
  const sources = [...new Set(rows.map(f => f.provenance.sourceUrl))];
  const applicable = f => {
    if (f.validFrom || f.validTo || f.requiresTravelDates) {
      if (!dates.startDate || !dates.endDate) return false;
      if (f.requiresTravelDates && !(f.validFrom && f.validTo)) return false;
      if (f.validFrom && dates.startDate < f.validFrom) return false;
      if (f.validTo && dates.endDate > f.validTo) return false;
    }
    return true;
  };
  const active = rows.filter(applicable);
  const required = active.filter(f => f.type === 'shuttle_ticket_required' || f.type === 'transfer_mode_required');
  const modes = [...new Set(required.map(f => f.requiredMode || (/ferry|boat/i.test(f.requirement || '') ? 'ferry' : 'shuttle')).filter(m => MODES.has(m)))];
  const restricted = active.some(f => ['private_vehicle_restricted', 'vehicle_restriction', 'seasonal_closure'].includes(f.type));
  if (modes.length > 1) return { status: 'restricted', requiredMode: null, reason: 'conflicting_access_evidence', sources };
  if (modes.length === 1) return { status: 'required_alternative', requiredMode: modes[0], sources };
  if (restricted) return { status: 'restricted', requiredMode: null, sources };
  // Both endpoints must have affirmative, applicable access authority.
  const allowed = factGroups.length > 0 && factGroups.every(group => group.some(f => active.includes(f) && f.type === 'private_vehicle_access_allowed'));
  if (allowed && !rows.some(f => !applicable(f))) return { status: 'allowed', requiredMode: null, sources };
  return { status: 'unknown', requiredMode: null, sources };
}
function transferDates(dates = {}) {
  const startDate = dates.startDate;
  const endDate = dates.endDate || (startDate && dates.durationDays ? new Date(Date.parse(startDate) + (dates.durationDays - 1) * 86400000).toISOString().slice(0,10) : startDate);
  return { startDate, endDate };
}
module.exports = { resolveOperationalAccess, transferDates };
