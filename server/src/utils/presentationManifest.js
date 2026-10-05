'use strict';

const { shouldShowDayByDayItinerary } = require('../services/trailieTravelerJobResolver');

/**
 * Trailie Presentation Manifest v1.
 *
 * Pure application logic only: this module performs no provider/model/network
 * work and never copies canonical response data into presentation metadata.
 */

const PRESENTATION_SCHEMA_VERSION = 1;

const PRESENTATION_KINDS = Object.freeze([
  'plain_answer',
  'comparison',
  'itinerary',
  'route_plan',
  'flight_planning',
  'stay_options',
  'campground_options',
  'requirements',
  'access_plan',
  'current_status',
  'cost_summary',
  'recommendation_list',
]);

const SUPPORTING_MODULE_KINDS = Object.freeze([
  'getting_there',
  'flight_planning',
  'route_plan',
  'stay_options',
  'campground_options',
  'requirements',
  'access_plan',
  'current_status',
  'cost_summary',
  'recommendation_list',
]);

const PROSE_POLICIES = Object.freeze([
  'full',
  'supplemental_only',
  'intro_only',
  'hidden',
]);

function frozenRegistryEntry(kinds, resolve) {
  return Object.freeze({ kinds: Object.freeze([...kinds]), resolve });
}

const SOURCE_REGISTRY = Object.freeze({
  content: frozenRegistryEntry(['plain_answer', 'comparison'], (value) => value?.content),
  canonicalPlan: frozenRegistryEntry(['itinerary'], (value) => value?.canonicalPlan),
  'travelLogistics.transport': frozenRegistryEntry(
    ['getting_there'],
    (value) => value?.travelLogistics?.transport
  ),
  'travelLogistics.transport.airports': frozenRegistryEntry(
    ['flight_planning'],
    (value) => value?.travelLogistics?.transport?.airports
  ),
  'travelLogistics.transport.routeLegs': frozenRegistryEntry(
    ['route_plan'],
    (value) => value?.travelLogistics?.transport?.routeLegs
  ),
  'travelLogistics.stays': frozenRegistryEntry(
    ['stay_options'],
    (value) => value?.travelLogistics?.stays
  ),
  'travelLogistics.stays.insidePark': frozenRegistryEntry(
    ['stay_options'],
    (value) => value?.travelLogistics?.stays?.insidePark
  ),
  'travelLogistics.stays.gateway': frozenRegistryEntry(
    ['stay_options'],
    (value) => value?.travelLogistics?.stays?.gateway
  ),
  'travelLogistics.stays.campgrounds': frozenRegistryEntry(
    ['campground_options'],
    (value) => value?.travelLogistics?.stays?.campgrounds
  ),
  'travelLogistics.stays.vacationRentalHint': frozenRegistryEntry(
    ['stay_options'],
    (value) => value?.travelLogistics?.stays?.vacationRentalHint
  ),
  'responseArtifacts.comparison': frozenRegistryEntry(
    ['comparison'],
    (value) => value?.responseArtifacts?.comparison
  ),
  'responseArtifacts.requirements': frozenRegistryEntry(
    ['requirements'],
    (value) => value?.responseArtifacts?.requirements
  ),
  'responseArtifacts.accessPlan': frozenRegistryEntry(
    ['access_plan'],
    (value) => value?.responseArtifacts?.accessPlan
  ),
  'responseArtifacts.currentStatus': frozenRegistryEntry(
    ['current_status'],
    (value) => value?.responseArtifacts?.currentStatus
  ),
  'responseArtifacts.costSummary': frozenRegistryEntry(
    ['cost_summary'],
    (value) => value?.responseArtifacts?.costSummary
  ),
  'responseArtifacts.recommendations': frozenRegistryEntry(
    ['recommendation_list'],
    (value) => value?.responseArtifacts?.recommendations
  ),
});

function resolvePresentationSource(envelope, source) {
  const entry = SOURCE_REGISTRY[source];
  return entry ? entry.resolve(envelope) : undefined;
}

function sourceSupportsKind(source, kind) {
  return Boolean(SOURCE_REGISTRY[source]?.kinds.includes(kind));
}

function fulfilled(envelope, source) {
  const value = resolvePresentationSource(envelope, source);
  if (Array.isArray(value)) return value.length > 0;
  return value != null;
}

function normalizeChanges(changes) {
  if (!Array.isArray(changes)) return [];
  return [...new Set(changes
    .filter((change) => typeof change === 'string')
    .map((change) => change.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, ''))
    .filter((change) => /^[a-z0-9_]{1,64}$/.test(change))
  )].slice(0, 8);
}

function normalizeChangedDayNumbers(changedDayNumbers, canonicalPlan) {
  if (!Array.isArray(changedDayNumbers)) return [];
  const requested = new Set(changedDayNumbers.filter(
    (dayNumber) => Number.isInteger(dayNumber) && dayNumber > 0
  ));
  const canonicalNumbers = (canonicalPlan?.days || []).map((day, index) => {
    const value = Number(day?.dayNumber ?? day?.day ?? day?.dayIndex);
    return Number.isInteger(value) && value > 0 ? value : index + 1;
  });
  return [...new Set(canonicalNumbers.filter((dayNumber) => requested.has(dayNumber)))];
}

function defaultEnding() {
  return { caveat: null, beforeYouGo: null, followups: [] };
}

function primaryFor(envelope) {
  const primaryIntent = envelope?.intent?.primaryIntent || 'general_qa';
  const verticals = new Set(envelope?.intent?.verticals || []);
  const requested = envelope?.requestedSlices || {};
  const artifacts = envelope?.responseArtifacts || {};

  const travelerJob = envelope?.intent?.travelerJob || null;
  if (travelerJob === 'trip_skeleton') {
    return { kind: 'plain_answer', source: 'content' };
  }

  if ((shouldShowDayByDayItinerary({ job: travelerJob })
    || (!travelerJob && (primaryIntent === 'trip_refinement'
      || primaryIntent === 'refinement'
      || primaryIntent === 'simple_itinerary'
      || primaryIntent === 'full_trip')))
    && fulfilled(envelope, 'canonicalPlan')) {
    return { kind: 'itinerary', source: 'canonicalPlan' };
  }

  if (primaryIntent === 'compare') {
    if (artifacts.comparison) {
      return { kind: 'comparison', source: 'responseArtifacts.comparison' };
    }
    if (envelope?.content) return { kind: 'comparison', source: 'content' };
  }

  if (primaryIntent === 'flight_strategy' || primaryIntent === 'flight_live_search') {
    if (requested.airports && fulfilled(envelope, 'travelLogistics.transport.airports')) {
      return { kind: 'flight_planning', source: 'travelLogistics.transport.airports' };
    }
  }

  if (primaryIntent === 'transport') {
    if (artifacts.accessPlan) {
      return { kind: 'access_plan', source: 'responseArtifacts.accessPlan' };
    }
    if (requested.routeLegs && fulfilled(envelope, 'travelLogistics.transport.routeLegs')) {
      return { kind: 'route_plan', source: 'travelLogistics.transport.routeLegs' };
    }
  }

  if (primaryIntent === 'lodging_strategy' || primaryIntent === 'hotel_live_search') {
    if (requested.campgrounds && fulfilled(envelope, 'travelLogistics.stays.campgrounds')) {
      return { kind: 'campground_options', source: 'travelLogistics.stays.campgrounds' };
    }
    if (fulfilled(envelope, 'travelLogistics.stays')) {
      return { kind: 'stay_options', source: 'travelLogistics.stays' };
    }
  }

  if (primaryIntent === 'permit_camping') {
    if (requested.campgrounds && fulfilled(envelope, 'travelLogistics.stays.campgrounds')) {
      return { kind: 'campground_options', source: 'travelLogistics.stays.campgrounds' };
    }
    if (artifacts.requirements) {
      return { kind: 'requirements', source: 'responseArtifacts.requirements' };
    }
  }

  if (primaryIntent === 'live_in_trip_assistance') {
    if (artifacts.currentStatus) {
      return { kind: 'current_status', source: 'responseArtifacts.currentStatus' };
    }
    if (artifacts.accessPlan) {
      return { kind: 'access_plan', source: 'responseArtifacts.accessPlan' };
    }
  }

  if (verticals.has('weather') && artifacts.currentStatus) {
    return { kind: 'current_status', source: 'responseArtifacts.currentStatus' };
  }
  if ((primaryIntent === 'destination_discovery' || primaryIntent === 'place_discovery')
    && artifacts.recommendations) {
    return { kind: 'recommendation_list', source: 'responseArtifacts.recommendations' };
  }

  return { kind: 'plain_answer', source: 'content' };
}

function supportsFor() {
  // Conversation-first: logistics and other structured slices may exist on the
  // envelope, but they are not automatic supporting modules. The renderer may
  // still enhance from primaryArtifact when that artifact is the answer.
  return [];
}

function buildPresentationManifest(envelope = {}) {
  const primaryArtifact = primaryFor(envelope);
  const changes = normalizeChanges(envelope?.refinement?.changes);
  const changedDayNumbers = normalizeChangedDayNumbers(
    envelope?.refinement?.changedDayNumbers,
    envelope?.canonicalPlan
  );
  const isRefinementIntent = ['trip_refinement', 'refinement']
    .includes(envelope?.intent?.primaryIntent);
  const refinement = {
    isRefinement: isRefinementIntent && (changes.length > 0 || changedDayNumbers.length > 0),
    changes: isRefinementIntent ? changes : [],
    changedDayNumbers: isRefinementIntent ? changedDayNumbers : [],
  };
  const baseEnding = defaultEnding();
  const requestedEnding = envelope.ending || {};
  const explicitFollowups = Array.isArray(requestedEnding.followups)
    ? requestedEnding.followups.filter((item) => typeof item === 'string' && item.trim()).slice(0, 3)
    : [];
  const manifest = {
    schemaVersion: PRESENTATION_SCHEMA_VERSION,
    presentationKind: primaryArtifact.kind,
    refinement,
    primaryArtifact,
    supportingModules: supportsFor(envelope, primaryArtifact),
    prosePolicy: 'full',
    ending: {
      caveat: requestedEnding.caveat ?? baseEnding.caveat,
      beforeYouGo: requestedEnding.beforeYouGo ?? baseEnding.beforeYouGo,
      followups: explicitFollowups,
    },
  };
  return manifest;
}

function validatePresentationManifest(manifest, envelope = null) {
  const errors = [];
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    return { valid: false, errors: ['presentation_not_object'] };
  }
  if (manifest.schemaVersion !== PRESENTATION_SCHEMA_VERSION) {
    errors.push('presentation_schema_version_invalid');
  }
  if (!PRESENTATION_KINDS.includes(manifest.presentationKind)) {
    errors.push('presentation_kind_invalid');
  }

  const primary = manifest.primaryArtifact;
  if (!primary || typeof primary !== 'object' || Array.isArray(primary)) {
    errors.push('presentation_primary_missing');
  } else {
    if (primary.kind !== manifest.presentationKind) {
      errors.push('presentation_primary_kind_mismatch');
    }
    if (!sourceSupportsKind(primary.source, primary.kind)) {
      errors.push('presentation_source_invalid');
    } else if (envelope && !fulfilled(envelope, primary.source)) {
      errors.push('presentation_source_missing');
    }
    if (Object.prototype.hasOwnProperty.call(primary, 'data')) {
      errors.push('presentation_canonical_data_duplicated');
    }
  }

  const supports = manifest.supportingModules;
  if (!Array.isArray(supports)) {
    errors.push('presentation_support_invalid');
  } else {
    if (supports.length > 3) errors.push('presentation_support_limit_exceeded');
    const seen = new Set();
    for (const support of supports) {
      if (!support || typeof support !== 'object') {
        errors.push('presentation_support_invalid');
        continue;
      }
      if (!SUPPORTING_MODULE_KINDS.includes(support.kind)) {
        errors.push('presentation_support_kind_invalid');
      }
      if (support.kind === manifest.presentationKind || seen.has(support.kind)) {
        errors.push('presentation_support_duplicate');
      }
      seen.add(support.kind);
      if (!sourceSupportsKind(support.source, support.kind)) {
        errors.push('presentation_source_invalid');
      } else if (envelope && !fulfilled(envelope, support.source)) {
        errors.push('presentation_source_missing');
      }
      if (Object.prototype.hasOwnProperty.call(support, 'data')) {
        errors.push('presentation_canonical_data_duplicated');
      }
    }
  }

  if (!PROSE_POLICIES.includes(manifest.prosePolicy)) {
    errors.push('presentation_prose_policy_invalid');
  }
  const refinement = manifest.refinement;
  const changedDayNumbersValid = !Object.prototype.hasOwnProperty.call(
    refinement || {}, 'changedDayNumbers'
  ) || (
    Array.isArray(refinement.changedDayNumbers)
    && refinement.changedDayNumbers.every((dayNumber) => Number.isInteger(dayNumber) && dayNumber > 0)
    && new Set(refinement.changedDayNumbers).size === refinement.changedDayNumbers.length
  );
  const refinementValid = refinement
    && typeof refinement.isRefinement === 'boolean'
    && Array.isArray(refinement.changes)
    && refinement.changes.every((change) => typeof change === 'string' && /^[a-z0-9_]{1,64}$/.test(change))
    && new Set(refinement.changes).size === refinement.changes.length
    && (refinement.isRefinement
      ? refinement.changes.length > 0 || (refinement.changedDayNumbers?.length || 0) > 0
      : refinement.changes.length === 0 && (refinement.changedDayNumbers?.length || 0) === 0);
  if (!refinementValid) errors.push('presentation_refinement_invalid');
  if (!changedDayNumbersValid) errors.push('presentation_refinement_changed_days_invalid');

  if (!manifest.ending || typeof manifest.ending !== 'object'
    || ![null, 'string'].includes(manifest.ending.caveat === null ? null : typeof manifest.ending.caveat)
    || ![null, 'string'].includes(manifest.ending.beforeYouGo === null ? null : typeof manifest.ending.beforeYouGo)
    || !Array.isArray(manifest.ending.followups)
    || manifest.ending.followups.length > 3
    || manifest.ending.followups.some((item) => typeof item !== 'string' || !item.trim() || item.length > 120)) {
    errors.push('presentation_ending_invalid');
  }

  return { valid: errors.length === 0, errors: [...new Set(errors)] };
}

module.exports = {
  PRESENTATION_KINDS,
  PRESENTATION_SCHEMA_VERSION,
  PROSE_POLICIES,
  SOURCE_REGISTRY,
  SUPPORTING_MODULE_KINDS,
  buildPresentationManifest,
  resolvePresentationSource,
  validatePresentationManifest,
};
