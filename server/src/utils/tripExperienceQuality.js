'use strict';

const { createHash } = require('crypto');
const { evidenceForStop, experienceRole } = require('./semanticDayValue');
const { canonicalExperienceKey } = require('./canonicalExperience');
const { classifyStop, SUBSTANTIAL_SINGLE_EXPERIENCE_MIN_MINUTES } = require('./itineraryCompleteness');
const { buildEvidenceBoundRepairCandidates } = require('./evidenceBoundRepairCandidates');
const { conditionalDependency } = require('./conditionalPrimary');
const { assessCandidateActionability } = require('./experienceActionability');
const norm = canonicalExperienceKey;
const digest = value => createHash('sha256').update(value).digest('hex').slice(0, 20);
const family = type => /museum|cultural|exhibit|interpretive/.test(type) ? 'culture'
  : /photo|viewpoint|viewing/.test(type) ? 'viewing' : /walk|hike|trail/.test(type) ? 'walking'
    : /scenic|route/.test(type) ? 'scenic_route' : type;

function experienceIdentity(stop, bundle) {
  const records = evidenceForStop(stop, bundle);
  const values = records.map(r => r.claim?.normalizedValue || {});
  const role = experienceRole(stop, { bundle, classifyStop });
  const anchor = norm(values.find(v => v.canonicalEntityName)?.canonicalEntityName || stop.canonicalPlaceName || stop.name);
  let purpose = family(String(role.canonicalType || stop.type || 'unknown'));
  let subject = '';
  let time = '';
  // An exterior subject/revisit needs the identity boundary's evidence binding.
  // Rewording note/why or supplying a model-authored time never grants novelty.
  const subjects = values.flatMap(v => v.experienceSubjects || []);
  const structuredSubject = subjects.find(s => norm(s.name) === norm(stop.experienceSubject)
    && ['photography', 'viewing', 'wildlife_viewing', 'stargazing'].includes(s.activityType));
  const boundSubject = stop.experienceSubject && stop.subjectEvidenceRef === stop.evidenceRef
    && stop.resolutionStatus === 'resolved';
  if (boundSubject) {
    subject = norm(stop.experienceSubject);
    purpose = structuredSubject?.activityType || (stop.type === 'wildlife' ? 'wildlife_viewing' : 'viewing');
    const supportedTimes = structuredSubject?.timeContexts || [];
    const requestedTime = norm(stop.timeContext || stop.timeWindow);
    if (supportedTimes.map(norm).includes(requestedTime)) time = requestedTime;
  }
  if (!stop.compoundVisit && stop.experienceFacet?.kind === 'exterior_viewing'
    && stop.experienceFacet.evidenceRef === stop.evidenceRef) {
    purpose = 'viewing'; subject = norm(stop.experienceFacet.subject);
  }
  const signature = `${anchor}|${purpose}|${subject}|${time}`;
  return { anchor, purpose, subject, time, identity: digest(signature), role: role.role,
    duration: role.duration, grounded: records.length > 0, semanticCategory: stop.semanticCategory || purpose };
}

function revisitRelationship(a, b) {
  if (a.anchor !== b.anchor) return null;
  if (!a.grounded || !b.grounded) return 'UNCERTAIN';
  return a.identity === b.identity ? 'REDUNDANT_REPEAT' : 'DISTINCT_REVISIT';
}

function evaluateTripExperienceQuality({ itineraryData, bundle, constraints = {}, userPrompt = '', touchedDayNumbers = null, excludedEvidenceIds = [] } = {}) {
  const days = itineraryData?.days || [];
  const isConditional = stop => conditionalDependency(stop, bundle, { constraints, userPrompt });
  const catalog = buildEvidenceBoundRepairCandidates({
    bundle, constraints, candidatePlan: itineraryData, includeExisting: true, requireExecutablePrimary: true,
  });
  const used = new Set(days.flatMap(d => d.stops || []).map(s => norm(s.canonicalPlaceName || s.name)));
  const recordsFor = (ids) => {
    const wanted = new Set(ids || []);
    return (bundle?.evidence || []).filter((row) => wanted.has(row.evidenceId));
  };
  const prior = [];
  const seenAnchors = new Map();
  const repeatedIdentities = new Map();
  const seenIdentities = new Set();
  const profile = days.map((day, index) => {
    const dayNumber = Number(day.dayNumber || day.day || index + 1);
    const entries = (day.stops || []).map((stop, stopIndex) => {
      const e = experienceIdentity(stop, bundle);
      const relationship = e.role === 'logistics' ? null : prior.filter(p => p.anchor === e.anchor)
        .map(p => revisitRelationship(p, e)).find(r => r === 'REDUNDANT_REPEAT')
          || (prior.some(p => p.anchor === e.anchor && (!p.grounded || !e.grounded)) ? 'UNCERTAIN'
            : prior.some(p => p.anchor === e.anchor) ? 'DISTINCT_REVISIT' : null);
      if (e.role !== 'logistics') {
        const visits = seenAnchors.get(e.anchor) || new Set();visits.add(dayNumber);seenAnchors.set(e.anchor, visits);
        if (relationship === 'REDUNDANT_REPEAT') repeatedIdentities.set(e.identity, (repeatedIdentities.get(e.identity) || 0) + 1);
      }
      const conditional = e.role === 'primary_experience' && isConditional(stop);
      const fallbackNames = [...(stop.alternatives || []), ...(day.alternatives || [])].map(a => norm(a.name));
      const fallback = conditional && catalog.candidates.some(c => !c.evidenceIds.some(id => excludedEvidenceIds.includes(id)) && fallbackNames.includes(norm(c.canonicalName))
        && !used.has(norm(c.canonicalName)) && !isConditional({ name: c.canonicalName, evidenceRef: c.evidenceIds?.[0] }));
      return { ...e, stopIndex, relationship, conditional, fallback, previouslyUsed: seenIdentities.has(e.identity),
        stopName: norm(stop.canonicalPlaceName || stop.name) };
    });
    const primary = entries.filter(e => e.role === 'primary_experience');
    const independent = primary.filter(e => !e.conditional && !e.previouslyUsed);
    const independentMinutes = independent.reduce((sum,e) => sum + e.duration, 0);
    const fragile = primary.some(e => e.conditional && !e.fallback)
      && independentMinutes < SUBSTANTIAL_SINGLE_EXPERIENCE_MIN_MINUTES;
    for (const e of entries.filter(e => e.role !== 'logistics')) { prior.push(e);seenIdentities.add(e.identity); }
    return { dayNumber, entries, conditionalStatus: !primary.some(e => e.conditional) ? 'PRIMARY_CONFIRMED'
      : fragile ? 'PRIMARY_CONDITIONAL_UNSUPPORTED' : 'PRIMARY_CONDITIONAL_WITH_FALLBACK', provisional: primary.some(e => e.conditional),
      fragile, coverageStatus: fragile ? 'conditional_weakness' : 'day_value_validated' };
  });
  const experiences = profile.flatMap(d => d.entries).filter(e => e.role !== 'logistics');
  const repeats = experiences.filter(e => e.relationship === 'REDUNDANT_REPEAT');
  // Material trip padding, not a per-place visit limit: repeated uses must
  // occupy a substantial share of both trip days and meaningful experiences.
  const repeatRequested = constraints?.preferences?.repeatExperiences === true
    || /\b(?:revisit|return to|repeat)\b.{0,45}\b(?:every day|daily|same (?:place|experience))\b/i.test(userPrompt);
  const intentional = repeatRequested && !/\b(?:no|not|never|avoid|don't)\b.{0,40}\b(?:revisit|return|repeat)\b/i.test(userPrompt);
  const repeatedMinutes = repeats.reduce((sum,e) => sum + e.duration, 0);
  const meaningfulMinutes = experiences.reduce((sum,e) => sum + e.duration, 0);
  const material = repeatedMinutes / Math.max(1, meaningfulMinutes) >= 0.2 && days.length >= 3 && repeats.length >= 2 && repeats.length / Math.max(1, experiences.length) >= 0.25
    && [...seenAnchors.values()].some(visits => visits.size / days.length >= 0.75);
  const excessive = material && !intentional;
  const affectedDays = profile.filter(d => (d.fragile || excessive && d.entries.some(e => e.relationship === 'REDUNDANT_REPEAT'))
    && (!touchedDayNumbers || touchedDayNumbers.includes(d.dayNumber))).map(d => d.dayNumber);
  // Identities already on an affected day stay reserved for that day. Places
  // used only elsewhere (or unused) remain legal structural replacements.
  const reservedOnAffected = new Set();
  for (const day of profile) {
    if (!affectedDays.includes(day.dayNumber)) continue;
    for (const entry of day.entries) {
      if (entry.role !== 'logistics' && entry.stopName) reservedOnAffected.add(entry.stopName);
    }
  }
  const candidates = catalog.candidates.filter((c) => {
    if (c.evidenceIds.some((id) => excludedEvidenceIds.includes(id))) return false;
    if (reservedOnAffected.has(norm(c.canonicalName))) return false;
    if (isConditional({ name: c.canonicalName, evidenceRef: c.evidenceIds?.[0] })) return false;
    const action = assessCandidateActionability({
      records: recordsFor(c.evidenceIds), name: c.canonicalName, constraints,
    });
    if (!(action.standalonePrimaryEligible && action.constraintStatus !== 'incompatible')) return false;
    // When repairing a bounded touched scope, reject candidates that would
    // immediately duplicate a frozen day's base experience.
    if (Array.isArray(touchedDayNumbers) && touchedDayNumbers.length) {
      const { projectCandidateCrossDayViability } = require('./refinementCrossDayCandidateViability');
      const crossDay = projectCandidateCrossDayViability({
        plan: itineraryData,
        targetDayNumbers: touchedDayNumbers,
        candidateStop: {
          name: c.canonicalName,
          canonicalPlaceName: c.canonicalName,
          type: c.canonicalType || 'hike',
          duration: c.maxDurationMinutes || 75,
          evidenceRef: c.evidenceIds?.[0] || null,
        },
      });
      if (crossDay.crossDayConflict) return false;
    }
    return true;
  });
  const reasons = [];
  if (excessive && affectedDays.some(n => profile.find(d => d.dayNumber === n).entries.some(e => e.relationship === 'REDUNDANT_REPEAT'))) reasons.push('excessive_trip_repetition');
  if (profile.some(d => affectedDays.includes(d.dayNumber) && d.fragile)) reasons.push('conditional_primary_unsupported');
  // Repairability is context-sensitive: reason code alone is never an evidence blocker.
  const repairable = candidates.length > 0 && affectedDays.length > 0;
  return { ok: reasons.length === 0, reasonCodes: reasons, retryability: reasons.length ? repairable ? 'model_fixable' : 'evidence_blocker' : null,
    candidates, affectedDays, frozenDayNumbers: profile.map(d => d.dayNumber).filter(n => !affectedDays.includes(n)),
    diagnostics: { experienceFamilies: [...new Set(experiences.map(e => e.purpose))].sort(),
      repeatedCanonicalAnchors: [...seenAnchors].filter(([,v]) => v.size > 1).map(([k,v]) => ({ anchor: digest(k), days: [...v] })),
      repeatedExperienceIdentities: [...repeatedIdentities].map(([identity,count]) => ({ identity, redundantUses: count })),
      eligibleDistinctAlternativeCount: candidates.length, intentionalRepetition: intentional, materialRepetition: material, repeatedMinutes, meaningfulMinutes,
      days: profile.slice(0, 32).map(d => ({ dayNumber: d.dayNumber, coverageStatus: d.coverageStatus,
        conditionalStatus: d.conditionalStatus, provisional: d.provisional,
        activityFamilies: [...new Set(d.entries.filter(e => e.role !== 'logistics').map(e => e.purpose))],
        geographicAnchors: [...new Set(d.entries.filter(e => e.role !== 'logistics').map(e => digest(e.anchor)))],
        primaryExperienceIdentities: d.entries.filter(e => e.role === 'primary_experience').map(e => e.identity),
        supportingExperienceIdentities: d.entries.filter(e => e.role === 'supporting_experience').map(e => e.identity),
        repeatedAnchors: d.entries.filter(e => e.relationship).map(e => ({ stopIndex: e.stopIndex, relationship: e.relationship })),
        weakStopIndexes: d.entries.filter(e => e.relationship === 'REDUNDANT_REPEAT' || e.conditional && !e.fallback).map(e => e.stopIndex),
      })) } };
}
module.exports = { evaluateTripExperienceQuality, experienceIdentity, revisitRelationship, conditionalDependency };
