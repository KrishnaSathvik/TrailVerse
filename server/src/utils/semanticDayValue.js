'use strict';

const { classifyExperienceRelationship } = require('./canonicalExperience');
const { normalizeEvidencePlaceCandidates } = require('./evidencePlaceCandidate');
const key = value => String(value || '').trim().toLowerCase();

function evidenceForStop(stop, bundle) {
  return (bundle?.evidence || []).filter(row => (stop.evidenceRef && row.evidenceId === stop.evidenceRef)
    || (stop.evidenceEntityId && row.claim?.normalizedValue?.entityId === stop.evidenceEntityId)
    || key(row.claim?.normalizedValue?.name) === key(stop.canonicalPlaceName || stop.name));
}

// Authoritative role derivation never reads model prose.
function experienceRole(stop, options = {}) {
  return require('./groundedExperienceCredit').groundedExperienceCredit(stop, options);
}

function evaluateDayValue({ day, priorStops = [], bundle, classifyStop, compareIdentity, lightByIntent = false,
  minimumMinutes = 90, availableMinutes = null, transferMinutes = 0, dayIntent = null, priorDay = null }) {
  const counted = [];
  const roles = (day.stops || []).map(stop => {
    const semantic = experienceRole(stop, { bundle, classifyStop });
    const repeated = semantic.role !== 'logistics' && [...priorStops, ...counted].some(existing => {
      if (experienceRole(existing, { bundle, classifyStop }).role === 'logistics') return false;
      const relation = classifyExperienceRelationship(existing, stop, {
        identityRelation: compareIdentity ? compareIdentity(existing, stop) : null,
      });
      return relation !== 'distinct' && relation !== 'same_place_distinct_visit';
    });
    if (!repeated && semantic.role !== 'logistics') counted.push(stop);
    return { ...semantic, name: stop.name, repeated };
  });
  const useful = roles.filter(r => !r.repeated);
  const primaryMinutes = useful.filter(r => r.role === 'primary_experience').reduce((n, r) => n + r.duration, 0);
  const supportingMinutes = useful.filter(r => r.role === 'supporting_experience').reduce((n, r) => n + r.duration, 0);
  // Travel consumes capacity, never experience minutes. Only an independently
  // supplied time budget can justify reducing capacity; long travel alone cannot.
  const capacity = availableMinutes > 0 ? Math.max(0, availableMinutes - transferMinutes) : null;
  const meaningfulMinutes = primaryMinutes + Math.min(primaryMinutes, supportingMinutes);
  const substantial = primaryMinutes >= minimumMinutes;
  const restByIntent = dayIntent?.kind === 'rest' && dayIntent.travelerAsserted === true;
  const burden = require('./dayIntentSemantics').compareDayBurden(priorDay, day, bundle);
  const relativeFits = dayIntent?.relativeBurden !== 'reduce' || !priorDay || burden.status === 'reduced';
  const capacityFits = capacity > 0 && primaryMinutes > 0
    && meaningfulMinutes >= capacity;
  const absoluteValueOk = restByIntent || substantial || meaningfulMinutes >= minimumMinutes || capacityFits;
  const ok = absoluteValueOk && relativeFits;
  const reason = !relativeFits ? 'relative_burden_not_reduced' : restByIntent ? 'valid_rest_day' : ok ? substantial && useful.filter(r => r.role === 'primary_experience').length === 1
    ? 'valid_substantial_single_experience' : meaningfulMinutes >= minimumMinutes ? 'valid_day_value' : 'valid_light_day'
    : roles.some(r => r.repeated) ? 'repetitive_experience'
      : !primaryMinutes ? supportingMinutes ? 'only_supporting_experiences' : 'only_logistics'
        : 'primary_too_thin_for_available_day';
  return { ok, reason, absoluteValueOk, relativeFits, burden, dayIntent, roles, primaryMinutes, supportingMinutes, meaningfulMinutes, availableMinutes, transferMinutes, capacity };
}
module.exports = { evidenceForStop, experienceRole, evaluateDayValue };
