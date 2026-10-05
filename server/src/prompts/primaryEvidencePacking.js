'use strict';

// Pure primary-input construction. The authoritative bundle and all validators
// remain unchanged; these cards expose choices, never choose itinerary stops.
const { countPromptTokens, truncatePromptTokens } = require('../utils/promptTokenAccounting');
const { buildEvidenceBoundRepairCandidates } = require('../utils/evidenceBoundRepairCandidates');
const { entityEvidenceProvenance } = require('../utils/entityEvidenceProvenance');
const { activityDurationRange } = require('../utils/evidenceActivityDuration');
const { conditionalDependency } = require('../utils/tripExperienceQuality');
const { SUBSTANTIAL_SINGLE_EXPERIENCE_MIN_MINUTES: SUBSTANTIAL } = require('../utils/itineraryCompleteness');
const { travelerValueClass, VALUE_CLASS } = require('../utils/travelerValueClass');
const { candidateMatchesDimension } = require('../utils/requestedExperienceCoverage');
const clean = value => String(value ?? '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
const clip = (value, tokens) => truncatePromptTokens(clean(value), tokens).text;
const uniq = values => [...new Set(values)];

function planningJob({ mode, constraints, userRequest = '', preferTripLogistics, preferAccessDecision } = {}) {
  const itinerary = mode === 'architect' || (!mode && !preferAccessDecision && (preferTripLogistics
    || /\bitinerary\b|\bday.by.day\b|\b(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten|multi)[ -]days?\b/i.test(userRequest)));
  const words = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
  const match = userRequest.match(/\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten)[ -]days?\b/i);
  const days = Math.max(1, Number(constraints?.tripDays || constraints?.dates?.numDays || constraints?.planningState?.dates?.numDays) || Number(match?.[1]) || words[match?.[1]?.toLowerCase()] || 1);
  return { itinerary, days };
}

// Token capacity grows sublinearly, not a fixed number of trails or attractions.
function primaryEvidenceBudget(job, destinationCount = 1) {
  return job.itinerary ? Math.min(3200, Math.round(1200 + 900 * Math.log2(job.days)
    + 250 * Math.log2(Math.max(1, destinationCount)))) : 1200;
}
function streamOf(record) {
  if (record.topic === 'accessibility') return 'CONSTRAINT / ACCESS';
  if (['destination_identity', 'destination_context', 'geography'].includes(record.topic)) return 'DESTINATION CONTEXT';
  return 'OPERATIONAL';
}
function critical(record) {
  const v = record.claim?.normalizedValue || {};
  if (record.claim?.polarity === 'negative' && v === false) return false;
  return ['alerts_closures', 'roads', 'permits_reservations'].includes(record.topic)
    || Boolean(v.permitRequired || v.reservationRequired || v.closureStatus === 'closed')
    || (v.operationalFacts || []).some(f => /closure|restriction|permit|reservation|access|season/i.test(f.type || ''));
}
function packingQuality({ job, eligibleCount, packedCount }) {
  // A rich multi-day universe with no choice (or just one) is objectively
  // starved. This is not an attraction quota or a validator acceptance rule.
  return job.itinerary && job.days > 1 && eligibleCount > job.days && packedCount <= 1
    ? ['primary_evidence_starvation'] : [];
}

function packPrimaryEvidence({ items, bundle, constraints, userRequest, dimensions = [], pinned = new Set(),
  job, limit, scoreFn }) {
  const eligibleIds = new Set(items.map(i => i.evidenceId));
  const catalog = buildEvidenceBoundRepairCandidates({ bundle, constraints, includeExisting: true,
    limit: Math.max(1, bundle?.evidence?.length || 1) });
  const byId = new Map(items.map(i => [i.evidenceId, i]));
  const experiences = catalog.candidates.map(candidate => {
    const records = candidate.evidenceIds.filter(id => eligibleIds.has(id)).map(id => byId.get(id).candidate);
    const identityRecords = records.filter(r => !entityEvidenceProvenance(r).evidenceDocumentTitle);
    if (!identityRecords.length) return null;
    const ranges = identityRecords.map(r => activityDurationRange(r.claim?.normalizedValue?.duration)).filter(Boolean);
    const values = identityRecords.map(r => r.claim?.normalizedValue || {});
    const conditional = conditionalDependency({ name: candidate.canonicalName, type: candidate.canonicalType,
      evidenceRef: identityRecords[0].evidenceId }, bundle, { constraints: constraints || {} });
    const matched = dimensions.filter(d => identityRecords.some(r => candidateMatchesDimension({ ...r, claim: { ...r.claim, normalizedValue: {
      ...r.claim.normalizedValue, activityTypes: [...(r.claim.normalizedValue.activityTypes || []), candidate.canonicalType],
    } } }, d)));
    const demanding = values.some(v => /hard|strenuous|challenging/i.test(v.difficulty || '') || v.exposureLevel === 'high')
      || identityRecords.some(r => /\b(strenuous|challenging|difficult|steep drop.offs?|technical climbing)\b/i.test(r.claim?.text || ''));
    const requestedHard = /\b(strenuous|challenging|hard hikes?|high exposure)\b/i.test(userRequest || '');
    const substantial = ranges.some(r => r.maxMinutes >= SUBSTANTIAL);
    const score = Math.min(...identityRecords.map(r => scoreFn(byId.get(r.evidenceId))))
      - matched.length * 45 - (substantial ? 24 : ranges.length ? 6 : 0)
      + (conditional ? 35 : 0) + (demanding && !requestedHard ? 40 : 0);
    return { candidate, records, identityRecords, ranges, conditional, substantial, score,
      family: candidate.canonicalType, entity: candidate.destinationId || candidate.entityId || identityRecords[0].entityId || '',
      ids: records.map(r => r.evidenceId) };
  }).filter(Boolean);
  const experienceIds = new Set(experiences.flatMap(e => e.ids));
  const context = items.filter(i => !experienceIds.has(i.evidenceId));
  const support = i => i.candidate.topic === 'visitor_services'
    || [VALUE_CLASS.SUPPORTING_EXPERIENCE, VALUE_CLASS.LOGISTICS, VALUE_CLASS.REST].includes(
      travelerValueClass(i.candidate.claim?.normalizedValue || {}));
  const criticalItems = items.filter(i => critical(i.candidate)
    && (!experienceIds.has(i.evidenceId) || entityEvidenceProvenance(i.candidate).evidenceDocumentTitle));
  const provenance = r => `${r.evidenceId} | ${r.source?.provider || 'unknown'} | ${r.source?.url || r.source?.title || 'source unspecified'} | ${byId.get(r.evidenceId)?.resolution.status || 'unresolved'}${r.observation?.observedAt ? ' | observed=' + r.observation.observedAt : ''}`;
  function fact(r, compact) {
    const v = r.claim?.normalizedValue || {};
    const fields = ['difficulty', 'exposureLevel', 'walkingDistanceMiles', 'wheelchairAccessible', 'avoidStairs',
      'currentStatus', 'closureStatus', 'permitRequired', 'reservationRequired', 'seasonalStatus', 'operatingMonths',
      'experienceExecution', 'execution', 'operationalFacts', 'petsAllowed', 'durationMinutes', 'maxVisitDurationMinutes'];
    const structured = Object.fromEntries(fields.filter(k => v[k] != null).map(k => [k, v[k]]));
    return [Object.keys(structured).length ? JSON.stringify(structured) : '',
      v.accessibility ? `accessibilityExcerpt (partial source detail): ${clip(v.accessibility, compact ? 12 : 28)}` : ''].filter(Boolean).join('; ');
  }
  function experienceBlock(e, compact) {
    const r = e.identityRecords.slice().sort((a,b) => Number(Boolean(b.claim?.normalizedValue?.duration))
      - Number(Boolean(a.claim?.normalizedValue?.duration)) || a.evidenceId.localeCompare(b.evidenceId))[0];
    const facts = uniq(e.records.map(r => fact(r, compact)).filter(Boolean));
    const overlays = e.records.filter(r => entityEvidenceProvenance(r).evidenceDocumentTitle)
      .map(r => `${provenance(r)}: ${r.retention?.storeClaimText === false ? '' : clip(r.claim?.text, compact ? 25 : 50)}`);
    return [`[EXPERIENCE | ${e.family}] ${e.candidate.canonicalName}; evidenceRef=${r.evidenceId}`,
      e.ranges.length ? `Source duration: ${uniq(e.ranges.map(r => r.sourceText)).join('; ')}` : `Source duration: ${uniq(e.identityRecords.map(r => r.claim?.normalizedValue?.duration).filter(Boolean)).join('; ') || 'unknown'} (numeric range unknown)`,
      ...facts, e.conditional ? 'Conditional dependency unresolved; do not assume available.' : '',
      r.retention?.storeClaimText === false ? '' : clip(r.claim?.text, compact ? 18 : 45),
      `Sources: ${e.identityRecords.map(provenance).join('; ')}`, ...overlays.map(o => 'Overlay: ' + o)].filter(Boolean).join('\n');
  }
  function contextValue(r) {
    const v = r.claim?.normalizedValue;
    if (!v || typeof v !== 'object') return v == null ? '' : `Value: ${v}`;
    if (Array.isArray(v.periods) && v.periods.length) {
      const temps = v.periods.flatMap(p => [p.minimumF, p.maximumF, p.temperatureF]).filter(Number.isFinite);
      return JSON.stringify({forecastHorizon:v.forecastHorizon, temperatureRangeF:temps.length ? [Math.min(...temps),Math.max(...temps)] : null, conditions:uniq(v.periods.map(p=>p.condition).filter(Boolean)), detail:'aggregate forecast; not a daily forecast'});
    }
    return clip(JSON.stringify(Object.fromEntries(Object.entries(v).filter(([k,val]) =>
      !['accessibility','name','description'].includes(k) && ['number','boolean','string'].includes(typeof val)))), 45);
  }
  function contextBlock(i, compact) {
    const r = i.candidate;
    const absent = r.claim?.polarity === 'negative' && r.claim?.normalizedValue === false;
    return [`[${support(i) ? 'SUPPORT' : streamOf(r)} | ${r.topic}] ${provenance(r)}`,
      ['activities','visitor_services'].includes(r.topic) ? 'Context/support only; not an eligible primary experience card.' : '',
      absent ? `No matching ${r.topic} record in the complete official source; not a guarantee of absence of the condition.`
        : r.retention?.storeClaimText === false ? '' : clip(r.claim?.text, critical(r) ? 100 : compact ? 18 : 40),
      contextValue(r), fact(r, compact)].filter(Boolean).join('\n');
  }
  function attempt(compact) {
    const blocks = [], included = new Set(), packed = [];
    const add = (block, ids, experience) => {
      if (ids.every(id => included.has(id)) && (!experience || packed.includes(experience))) return true;
      if (countPromptTokens([...blocks, block].join('\n\n')) > limit) return false;
      blocks.push(block); ids.forEach(id => included.add(id)); if (experience) packed.push(experience); return true;
    };
    // Explicit identities and operational truth are mandatory, regardless of score.
    for (const id of pinned) {
      const e = experiences.find(e => e.ids.includes(id));
      if (e) add(experienceBlock(e, compact), e.ids, e);
      else if (byId.has(id)) add(contextBlock(byId.get(id), compact), [id]);
    }
    const operationGroups = new Map();
    for (const i of criticalItems) {
      const key = JSON.stringify([i.candidate.claim, i.candidate.source?.url]);
      const group = operationGroups.get(key) || []; group.push(i); operationGroups.set(key, group);
    }
    for (const group of operationGroups.values()) add(contextBlock(group[0], compact)
      + (group.length > 1 ? '\nAlso: ' + group.slice(1).map(i => i.evidenceId).join(', ') : ''), group.map(i => i.evidenceId));
    const remaining = experiences.filter(e => !packed.includes(e));
    const reserve = limit * 0.72;
    while (remaining.length) {
      // Soft diversity: requested theme and planning utility can outweigh it.
      const adjusted = e => e.score + packed.filter(p => p.family === e.family).length * 2
        + packed.filter(p => p.entity === e.entity).length * 8;
      remaining.sort((a,b) => adjusted(a) - adjusted(b) || a.candidate.placeKey.localeCompare(b.candidate.placeKey));
      const e = remaining.shift();
      const block = experienceBlock(e, compact);
      if (countPromptTokens([...blocks, block].join('\n\n')) <= reserve || !context.some(i => !critical(i.candidate))) add(block, e.ids, e);
    }
    const contextPriority = i => ['destination_identity','destination_context','accessibility','weather_forecast','weather_current'].includes(i.candidate.topic) ? -100 : scoreFn(i);
    const queues = new Map();
    for (const i of context.slice().sort((a,b) => contextPriority(a)-contextPriority(b))) {
      const queue = queues.get(i.candidate.topic) || []; queue.push(i); queues.set(i.candidate.topic, queue);
    }
    while ([...queues.values()].some(q => q.length)) for (const q of queues.values()) {
      const i = q.shift(); if (i) add(contextBlock(i, compact), [i.evidenceId]);
    }
    for (const e of experiences.slice().sort((a,b) => a.score-b.score)) if (!packed.includes(e)) add(experienceBlock(e, compact), e.ids, e);
    return { text: blocks.join('\n\n'), included, packed };
  }
  let result = attempt(false);
  let warnings = packingQuality({job, eligibleCount: experiences.length, packedCount: result.packed.length});
  const missingMandatory = r => [...pinned].some(id => eligibleIds.has(id) && !r.included.has(id))
    || criticalItems.some(i => !r.included.has(i.evidenceId));
  let repackOccurred = false;
  const initialWarnings = [...warnings];
  // A single smaller deterministic retry, never a model repair.
  if (warnings.length || missingMandatory(result)) { result = attempt(true); repackOccurred = true; }
  warnings = packingQuality({job, eligibleCount: experiences.length, packedCount: result.packed.length});
  if (missingMandatory(result)) warnings.push('primary_mandatory_evidence_overflow');
  const metrics = {
    primaryEligibleUniverseCount: experiences.length, repairEligibleUniverseCount: catalog.count,
    eligibleExperienceCount: experiences.length, packedExperienceCount: result.packed.length,
    eligibleSubstantialCount: experiences.filter(e => e.substantial).length, packedSubstantialCount: result.packed.filter(e => e.substantial).length,
    eligibleExperienceFamilies: uniq(experiences.map(e => e.family)), packedExperienceFamilies: uniq(result.packed.map(e => e.family)),
    eligibleSourceDurationBackedCount: experiences.filter(e => e.ranges.length).length,
    packedSourceDurationBackedCount: result.packed.filter(e => e.ranges.length).length,
    supportRecordCount: context.filter(support).length, packedSupportCount: context.filter(i => support(i) && result.included.has(i.evidenceId)).length,
    criticalOperationalCount: criticalItems.length, packedCriticalOperationalCount: criticalItems.filter(i => result.included.has(i.evidenceId)).length,
    deduplicatedExperienceCount: experiences.reduce((n,e) => n + e.identityRecords.length - 1, 0),
    primaryPackTokenEstimate: countPromptTokens(result.text), repackOccurred, packingWarnings: uniq([...initialWarnings, ...warnings]),
  };
  if (warnings.length) {
    const error = new Error('Primary planning evidence cannot fit a useful, grounded context');
    error.code = warnings[0]; error.packingTelemetry = metrics; throw error;
  }
  return {text:result.text, tokens: metrics.primaryPackTokenEstimate, includedEvidenceIds:[...result.included],
    omittedEvidenceIds:items.filter(i => !result.included.has(i.evidenceId)).map(i => i.evidenceId), primaryPacking:metrics};
}
module.exports = { planningJob, primaryEvidenceBudget, packingQuality, packPrimaryEvidence };
