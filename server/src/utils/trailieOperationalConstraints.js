'use strict';

/**
 * First-party operational rules that must shape a plan before prose is written.
 * These records are deliberately typed and date-bounded. They are planning
 * inputs, not user-facing evidence objects.
 */

const { isExposureRelevantStop } = require('./hardConstraintEligibility');
const { isAvoidExposureActive } = require('./planningInputContract');

const CONSTRAINT_TYPE = Object.freeze({
  TRAIL_CLOSED: 'trail_closed',
  ROAD_CLOSED: 'road_closed',
  PARKING_TIME_LIMIT: 'parking_time_limit',
  RESERVATION_REQUIRED: 'reservation_required',
  SHUTTLE_TICKET_REQUIRED: 'shuttle_ticket_required',
  VEHICLE_RESTRICTION: 'vehicle_restriction',
  // P0-5 — a numeric size limit is its own semantics: capability is something
  // a traveler has or lacks; a dimension rule is arithmetic over two numbers.
  VEHICLE_DIMENSION: 'vehicle_dimension',
  SEASONAL_CLOSURE: 'seasonal_closure',
  EXPOSURE_CONSTRAINT: 'exposure_constraint',
  HEAT_CONSTRAINT: 'heat_constraint',
  ACCESS_UNCERTAIN: 'access_uncertain',
  ROUTE_GEOGRAPHY: 'route_geography',
  WATER_SAFETY: 'water_safety',
  TRAIL_CLASSIFICATION: 'trail_classification',
  PHOTO_ACCESS: 'photo_access',
});

const OFFICIAL_RULES = Object.freeze([]);

const norm = (value) => String(value || '').toLowerCase();
const matchesDestination = (rule, destination) => {
  const a = norm(rule.destination);
  const b = norm(destination);
  return a && b && (a.includes(b) || b.includes(a) || (a.includes('valley of fire') && b.includes('valley of fire')));
};

function requestedDate(constraints, now) {
  const raw = constraints?.dates?.start;
  const parsed = raw ? new Date(raw) : new Date(now || Date.now());
  return Number.isNaN(parsed.getTime()) ? new Date(now || Date.now()) : parsed;
}

function isRuleActive(rule, date) {
  const iso = date.toISOString().slice(0, 10);
  if (rule.effectiveFrom && iso < rule.effectiveFrom) return false;
  if (rule.effectiveThrough && iso > rule.effectiveThrough) return false;
  if (rule.effectiveFromMonthDay) {
    const md = iso.slice(5);
    if (md < rule.effectiveFromMonthDay || md > rule.effectiveThroughMonthDay) return false;
  }
  return true;
}

function userRejectsExposure(userText, constraints = null) {
  return isAvoidExposureActive(constraints, userText);
}

function resolveOperationalConstraints({ destination, constraints = {}, userText = '', now } = {}) {
  const date = requestedDate(constraints, now);
  const evidenceRules = Array.isArray(constraints?.operationalEvidence)
    ? constraints.operationalEvidence
    : [];
  return [...OFFICIAL_RULES, ...evidenceRules]
    .filter((rule) => matchesDestination(rule, destination) && isRuleActive(rule, date))
    .map((rule) => ({ ...rule, hard: rule.type !== CONSTRAINT_TYPE.ACCESS_UNCERTAIN }))
    .filter((rule) => rule.type !== CONSTRAINT_TYPE.EXPOSURE_CONSTRAINT || userRejectsExposure(userText, constraints));
}

function formatOperationalConstraintBlock(rules = []) {
  if (!rules.length) return '';
  const lines = rules.map((rule) => `- [${rule.type}] ${rule.plannerRule}`);
  return `\n\n--- VERIFIED OPERATIONAL PLANNER CONSTRAINTS ---\nThese rules constrain candidate-stop selection BEFORE you create the structured itinerary. Hard rules may not be worked around in optional text.\n${lines.join('\n')}\n--- END VERIFIED OPERATIONAL PLANNER CONSTRAINTS ---\n`;
}

function travelerFacingAccessRule(rule) {
  if (rule?.type === CONSTRAINT_TYPE.PARKING_TIME_LIMIT && Number(rule.maxMinutes) > 0) {
    const subject = (rule.subjects || []).filter(Boolean).join(', ') || 'This area';
    return `${subject} parking is limited to ${rule.maxMinutes} minutes. This is a park operating rule, not the traveler's drive budget or requested time limit.`;
  }
  return String(rule?.plannerRule || '').trim();
}

function formatAccessRulesForPrompt(rules = []) {
  if (!Array.isArray(rules) || rules.length === 0) return null;
  return {
    kind: 'park_operating_rules',
    instructions: 'These are park operating rules that affect feasibility. They are not traveler constraints or preferences. Explain them as park rules (for example, "parking is limited to 3 hours"), never as the traveler\'s own limit or drive cap.',
    rules: rules.map((rule) => ({
      type: rule.type,
      subjects: rule.subjects || [],
      travelerFacing: travelerFacingAccessRule(rule),
    })),
  };
}

function splitPromptConstraints(constraints) {
  if (!constraints || typeof constraints !== 'object' || Array.isArray(constraints)) {
    return { userConstraints: constraints || null, accessRules: null };
  }
  const { operational, ...userConstraints } = constraints;
  return {
    userConstraints,
    accessRules: formatAccessRulesForPrompt(Array.isArray(operational) ? operational : []),
  };
}

/**
 * Subject identity for operational constraints.
 *
 * A stop matches a constrained subject when the activity *is* that subject,
 * targets it by name/id, or structurally depends on it — not merely because
 * explanatory prose mentions it (e.g. "Do not use Fire Wave").
 *
 * Narrative fields (note / notes / why / description) do not independently
 * establish subject identity. Same semantic class as backup independence:
 * English mentioning X ≠ the activity being / depending on X.
 */
const SUBJECT_IDENTITY_NAME_FIELDS = Object.freeze([
  'name', 'title', 'activity', 'subject', 'displayName',
]);
const SUBJECT_IDENTITY_ID_FIELDS = Object.freeze([
  'entityId', 'activityId', 'placeId',
]);
const SUBJECT_STRUCTURED_DEPENDENCY_FIELDS = Object.freeze([
  'accessDependency',
  'dependsOn',
  'requires',
  'accessSubject',
  'requiresAccess',
  'dependency',
  'blockedAccess',
]);

function pushIdentityValue(out, value) {
  if (value == null) return;
  if (Array.isArray(value)) {
    for (const item of value) pushIdentityValue(out, item);
    return;
  }
  if (typeof value === 'object') {
    if (value.name) out.push(String(value.name));
    if (value.title) out.push(String(value.title));
    if (value.displayName) out.push(String(value.displayName));
    if (value.entityId) out.push(String(value.entityId));
    if (value.activityId) out.push(String(value.activityId));
    return;
  }
  const text = String(value).trim();
  if (text) out.push(text);
}

function collectSubjectIdentityTexts(stop) {
  const out = [];
  if (!stop || typeof stop !== 'object') return out;
  for (const field of SUBJECT_IDENTITY_NAME_FIELDS) {
    pushIdentityValue(out, stop[field]);
  }
  for (const field of SUBJECT_IDENTITY_ID_FIELDS) {
    pushIdentityValue(out, stop[field]);
  }
  if (stop.entity && typeof stop.entity === 'object') {
    pushIdentityValue(out, stop.entity);
  }
  for (const field of SUBJECT_STRUCTURED_DEPENDENCY_FIELDS) {
    pushIdentityValue(out, stop[field]);
  }
  return out;
}

function identityContainsSubject(identityText, subject) {
  const hay = norm(identityText);
  const needle = norm(subject);
  if (!hay || !needle) return false;
  if (hay.includes(needle)) return true;
  // Entity / slug ids: "place:known:fire-wave" ↔ "Fire Wave"
  const needleSlug = needle.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return Boolean(needleSlug && hay.includes(needleSlug));
}

function subjectMatches(stop, rule) {
  if (!(rule.subjects || []).length) return true;
  const identityTexts = collectSubjectIdentityTexts(stop);
  if (!identityTexts.length) return false;
  return (rule.subjects || []).some((subject) =>
    identityTexts.some((text) => identityContainsSubject(text, subject))
  );
}

function isRoadOnlyStop(stop, rule) {
  if (rule?.closureScope !== 'trail_only') return false;
  const text = norm(`${stop?.name || ''} ${stop?.note || ''} ${stop?.why || ''}`);
  const roadAccess = /\b(?:road|scenic drive|drive-through|pullout|pulloff)\b/.test(text);
  const trailActivity = /\b(?:trail|hike|walk|loop|route|canyon)\b/.test(text);
  return roadAccess && !trailActivity;
}

function applyOperationalConstraints(itinerary, rules = []) {
  const result = JSON.parse(JSON.stringify(itinerary || { days: [] }));
  const corrections = [];
  const conflicts = [];

  for (const [dayIndex, day] of (result.days || []).entries()) {
    const kept = [];
    for (const [stopIndex, stop] of (day.stops || []).entries()) {
      let remove = false;
      if (Array.isArray(stop.alternatives)) {
        stop.alternatives = stop.alternatives.filter((alternative) => {
          const closed = rules.some((rule) =>
            [CONSTRAINT_TYPE.TRAIL_CLOSED, CONSTRAINT_TYPE.SEASONAL_CLOSURE].includes(rule.type) &&
            subjectMatches(alternative, rule)
          );
          if (closed) corrections.push(`Removed closed alternative "${alternative.name || 'unnamed stop'}".`);
          return !closed;
        });
      }
      for (const rule of rules) {
        if (!subjectMatches(stop, rule)) continue;
        if (rule.type === CONSTRAINT_TYPE.ROUTE_GEOGRAPHY && rule.incompatibleWithOtherStops) {
          const hasOtherStops = (day.stops || []).some((candidate) => candidate !== stop);
          if (hasOtherStops) {
            remove = true;
            corrections.push(`Removed "${stop.name}" because it requires a dedicated travel corridor.`);
          }
        }
        if ([CONSTRAINT_TYPE.TRAIL_CLOSED, CONSTRAINT_TYPE.SEASONAL_CLOSURE].includes(rule.type)) {
          if (isRoadOnlyStop(stop, rule)) continue;
          remove = true;
          corrections.push(
            `Removed "${stop.name}" because the named trail is seasonally closed; this does not mean its approach road or the entire area is closed.`
          );
        }
        if (rule.type === CONSTRAINT_TYPE.EXPOSURE_CONSTRAINT) {
          if ((rule.subjects || []).length) {
            remove = true;
            corrections.push(`Removed "${stop.name}" because its ${rule.exposureLevel || 'listed'} exposure conflicts with the user's no-exposure preference.`);
          }
        }
        if (rule.type === CONSTRAINT_TYPE.PARKING_TIME_LIMIT && Number(stop.duration) > rule.maxMinutes) {
          conflicts.push({
            type: 'parking_duration_conflict', severity: 'warning', stopName: stop.name,
            maxMinutes: rule.maxMinutes, sourceClass: rule.sourceClass,
          });
          remove = true;
          corrections.push(`Removed "${stop.name}" because its activity duration leaves no margin within the parking limit.`);
        }
        if (rule.type === CONSTRAINT_TYPE.SHUTTLE_TICKET_REQUIRED) {
          const acknowledgesTicket = /\b(ticket|reservation|recreation\.gov)\b/i.test(`${stop.note || ''} ${stop.why || ''}`);
          if (!acknowledgesTicket) {
            remove = true;
            corrections.push(`Removed "${stop.name}" because its required shuttle-ticket access was not part of the plan.`);
          }
        }
        if (rule.type === CONSTRAINT_TYPE.HEAT_CONSTRAINT) {
          conflicts.push({
            type: 'heat_constraint',
            stop: stop.name,
            reasonCode: 'operational_heat_restriction',
          });
        }
        if (rule.type === CONSTRAINT_TYPE.PHOTO_ACCESS) {
          remove = true;
          corrections.push(`Removed "${stop.name}" because official access guidance prohibits using it as a planned photo stop.`);
        }
        if (remove) break;
      }
      if (!remove && rules.some((rule) => rule.type === CONSTRAINT_TYPE.EXPOSURE_CONSTRAINT) && isExposureRelevantStop(stop)) {
        const level = String(stop.exposureLevel || stop.exposure || '').toLowerCase();
        if (level === 'moderate' || level === 'high') {
          remove = true;
          corrections.push(
            `Removed "${stop.name}" because its ${stop.exposureLevel || stop.exposure} exposure conflicts with the user's no-exposure preference.`
          );
        } else if (!level || level === 'unknown') {
          conflicts.push({
            type: 'exposure_unknown',
            dayNumber: Number(day.dayNumber ?? day.day ?? dayIndex + 1),
            stop: stop.name,
            reasonCode: 'constraint_eligibility_unknown',
          });
        }
      }
      if (!remove) kept.push(stop);
    }
    day.stops = kept;
  }

  return { itinerary: result, corrections, conflicts };
}

function toDaypart(time) {
  const match = String(time || '').match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return time;
  const hour = Number(match[1]);
  if (hour < 9) return `Early morning · around ${Math.max(5, hour)}–${Math.max(6, hour + 1)} AM`;
  if (hour < 12) return 'Late morning';
  if (hour < 15) return 'Early afternoon';
  if (hour < 17) return 'Late afternoon';
  return 'Evening / golden hour';
}

function normalizeSchedulePrecision(itinerary) {
  for (const day of itinerary?.days || []) {
    for (const stop of day.stops || []) {
      const operationallyExact = /\b(reservation|timed entry|tour departs?|shuttle departs?|sunset at|sunrise at|ferry|train|opens? at|closes? at)\b/i
        .test(`${stop.name || ''} ${stop.note || ''} ${stop.why || ''}`);
      if (!operationallyExact && stop.startTime) {
        stop.timeWindow = toDaypart(stop.startTime);
        stop.startTime = '';
      }
    }
  }
  return itinerary;
}

module.exports = {
  CONSTRAINT_TYPE,
  OFFICIAL_RULES,
  resolveOperationalConstraints,
  formatOperationalConstraintBlock,
  formatAccessRulesForPrompt,
  splitPromptConstraints,
  applyOperationalConstraints,
  normalizeSchedulePrecision,
  userRejectsExposure,
  subjectMatches,
  collectSubjectIdentityTexts,
};
