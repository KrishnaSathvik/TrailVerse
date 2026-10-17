'use strict';

const { normalizeEvidencePlaceCandidates } = require('./evidencePlaceCandidate');
const { supportedDurationMaximum } = require('./evidenceActivityDuration');
const normalize = value => String(value || '').toLowerCase().trim();
const SUPPORT = new Set(['visitor_center', 'visitor_service', 'orientation', 'information']);
const CULTURAL = new Set(['museum', 'museum_cultural', 'cultural', 'interpretive_center', 'nature_center', 'nature_interpretive', 'historic_interior', 'exhibit_program']);
const LOGISTICS = new Set(['transport', 'drive', 'shuttle', 'parking', 'logistics', 'lodging', 'lodge', 'meal', 'restaurant', 'campground', 'picnic']);

// No authored note/why/label/intro is read here. Evidence establishes eligibility;
// structured visit bindings select among those facts. Duration never changes role.
function groundedExperienceCredit(stop, { bundle = null, classifyStop } = {}) {
  const records = require('./semanticDayValue').evidenceForStop(stop, bundle);
  const values = records.map(r => r.claim?.normalizedValue || {});
  const semantics = values.flatMap(v => [v.type, v.category, v.semanticCategory, v.experienceKind, ...(v.activityTypes || [])]).map(normalize);
  const places = normalizeEvidencePlaceCandidates({ evidence: records });
  const sourceType = places.find(p => p.canonicalType)?.canonicalType;
  const culture = semantics.some(s => CULTURAL.has(s)) || sourceType === 'museum';
  const facility = semantics.some(s => SUPPORT.has(s)) || ['visitor_center','visitor_service'].includes(normalize(stop.type));
  const grounding = require('./experienceActionability').assessExecutionGrounding({
    records, name: stop.canonicalPlaceName || stop.name, modelType: stop.type, modelDuration: stop.duration,
  });
  let canonicalType = culture || grounding.cultural ? 'museum' : facility || grounding.facilitySupport ? 'visitor_center' : sourceType || (records.length ? null : stop.type);
  let role = 'supporting_experience';
  let roleSource = records.length ? 'source_entity_semantics' : 'canonical_structural_identity';
  let reason = facility || grounding.facilitySupport ? 'visitor_service_support' : 'no_grounded_primary';
  if (LOGISTICS.has(normalize(stop.type))) { role = 'logistics'; canonicalType = stop.type; reason = 'structured_logistics'; }
  else if (culture || grounding.cultural || !facility && !grounding.facilitySupport && (classifyStop?.({ name: stop.canonicalPlaceName || stop.name, type: canonicalType }) === 'experiential')) {
    role = 'primary_experience'; reason = null;
  }
  // In the runtime identity has already been resolved. Legacy pure coverage
  // callers without a bundle operate on canonical structure, never authored prose.
  if (bundle && !records.length && facility) { role = 'logistics'; reason = 'execution_evidence_missing'; }
  const facetRefs = [];
  let boundMinutes = 0;
  let invalidBinding = false;
  const selectedRefs = new Set();
  for (const binding of stop.executionBindings || []) {
    const row = (bundle?.evidence || []).find(r => r.evidenceId === binding.evidenceRef);
    const value = row?.claim?.normalizedValue || {};
    const linked = row && (records.includes(row) || records.some(r => (r.claim?.normalizedValue?.experienceRefs || []).includes(row.evidenceId))
      || value.anchorRef && stop.evidenceRef && value.anchorRef === stop.evidenceRef);
    const executable = linked && (CULTURAL.has(normalize(value.type || value.category)) || value.experienceExecution
      || normalizeEvidencePlaceCandidates({evidence:[row]}).some(p => p.experienceClass === 'experiential'));
    if (!executable || selectedRefs.has(binding.evidenceRef) || !Number.isFinite(binding.durationMinutes) || !(binding.durationMinutes > 0)) { invalidBinding = true; continue; }
    selectedRefs.add(binding.evidenceRef);
    facetRefs.push(row.evidenceId);
    const limit = supportedDurationMaximum(value);
    boundMinutes += Math.min(Number(binding.durationMinutes), limit > 0 ? Number(limit) : Infinity);
  }
  if (facetRefs.length && !invalidBinding && role !== 'logistics') { role = 'primary_experience'; roleSource = 'grounded_experience_facet'; reason = null; }
  const plannedDuration = Math.max(0, Number(stop.duration) || 0);
  const limits = values.map(supportedDurationMaximum).filter(v => Number(v) > 0).map(Number);
  let creditedMinutes = role === 'primary_experience' ? Math.min(plannedDuration, ...(limits.length ? limits : [Infinity])) : 0;
  if (stop.compoundVisit?.facets?.length && !culture) {
    const verified=stop.compoundVisit.facets.filter(f=>require('./visitExperienceSemantics').groundedVisitFacet(f,records)?.kind === 'exterior_viewing');
    const exteriorMinutes=verified.reduce((n,f)=>n+Math.max(0,Number(f.duration)||0),0);
    if(exteriorMinutes) { role='primary_experience';roleSource='grounded_experience_facet';reason=null;creditedMinutes=Math.min(plannedDuration,exteriorMinutes); }
  }
  if (facetRefs.length) creditedMinutes = Math.min(plannedDuration, boundMinutes);
  const area = require('./visitExperienceSemantics').areaActionability(stop, bundle);
  if (!area.actionable || invalidBinding) { creditedMinutes = 0; role = 'logistics'; reason = invalidBinding ? 'experience_scope_unbound' : 'experience_not_actionable'; }
  const kind = normalize(stop.experienceKind || canonicalType);
  const scope = facetRefs.length ? 'BOUND_FACETS' : stop.subjectEvidenceRef && records.some(r => r.evidenceId === stop.subjectEvidenceRef) ? 'ANCHORED_SUBJECT'
    : area.applicable ? 'AREA_BOUNDED' : culture || facility ? 'FACILITY_BOUNDED'
      : /trail|hike|walk/.test(kind) ? 'TRAIL_BOUNDED' : /drive|route|ferry/.test(kind) ? 'ROUTE_BOUNDED' : /view|photo|wildlife/.test(kind) ? 'VIEWPOINT_BOUNDED' : 'ENTITY_BOUNDED';
  if (role === 'primary_experience' && scope === 'ROUTE_BOUNDED') roleSource = 'grounded_route';
  if (role === 'primary_experience' && scope === 'ANCHORED_SUBJECT') roleSource = 'grounded_subject';
  return { role, roleSource, canonicalType, duration: role === 'primary_experience' ? creditedMinutes : plannedDuration,
    plannedDuration, creditedMinutes, reason, groundedExecutionScope: scope,
    creditedExperienceIdentity: role === 'primary_experience' ? {anchor:stop.canonicalPlaceName || stop.name,kind:canonicalType,facetRefs} : null,
    scopeEvidenceRefs: [...new Set([...records.map(r => r.evidenceId).filter(Boolean),...facetRefs])], experienceFacetRefs: facetRefs,
    actionabilityStatus: invalidBinding || !area.actionable ? 'unbound' : role === 'primary_experience' ? 'grounded' : 'support_only',
    reasonCode: invalidBinding ? 'experience_scope_unbound' : !area.actionable ? 'experience_not_actionable' : null };
}
module.exports = { groundedExperienceCredit };
