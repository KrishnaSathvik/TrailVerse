import { travelLogisticsBelongsToTurn } from '@/lib/trailieEnhancementOwnership';
import { selectCurrentDerived, publishDerivedSurfaces } from '@/lib/planDerivedPublication';

export const TRAILIE_PRESENTATION_KINDS = Object.freeze([
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

const PRESENTATION_KIND_SET = new Set(TRAILIE_PRESENTATION_KINDS);
const PROSE_POLICIES = new Set(['full', 'supplemental_only', 'intro_only', 'hidden']);

const SOURCE_REGISTRY = Object.freeze({
  content: (response) => response.content,
  canonicalPlan: (response) => response.canonicalPlan,
  'travelLogistics.transport': (response) => response.travelLogistics?.transport,
  'travelLogistics.transport.airports': (response) => response.travelLogistics?.transport?.airports,
  'travelLogistics.transport.routeLegs': (response) => response.travelLogistics?.transport?.routeLegs,
  'travelLogistics.stays': (response) => response.travelLogistics?.stays,
  'travelLogistics.stays.insidePark': (response) => response.travelLogistics?.stays?.insidePark,
  'travelLogistics.stays.gateway': (response) => response.travelLogistics?.stays?.gateway,
  'travelLogistics.stays.campgrounds': (response) => response.travelLogistics?.stays?.campgrounds,
  'travelLogistics.stays.vacationRentalHint': (response) => response.travelLogistics?.stays?.vacationRentalHint,
  'responseArtifacts.comparison': (response) => response.responseArtifacts?.comparison,
  'responseArtifacts.requirements': (response) => response.responseArtifacts?.requirements,
  'responseArtifacts.accessPlan': (response) => response.responseArtifacts?.accessPlan,
  'responseArtifacts.currentStatus': (response) => response.responseArtifacts?.currentStatus,
  'responseArtifacts.costSummary': (response) => response.responseArtifacts?.costSummary,
  'responseArtifacts.recommendations': (response) => response.responseArtifacts?.recommendations,
});

const SOURCE_KINDS = Object.freeze({
  content: ['plain_answer', 'comparison'],
  canonicalPlan: ['itinerary'],
  'travelLogistics.transport': ['getting_there'],
  'travelLogistics.transport.airports': ['flight_planning', 'getting_there'],
  'travelLogistics.transport.routeLegs': ['route_plan'],
  'travelLogistics.stays': ['stay_options'],
  'travelLogistics.stays.insidePark': ['stay_options'],
  'travelLogistics.stays.gateway': ['stay_options'],
  'travelLogistics.stays.campgrounds': ['campground_options', 'stay_options'],
  'travelLogistics.stays.vacationRentalHint': ['stay_options'],
  'responseArtifacts.comparison': ['comparison'],
  'responseArtifacts.requirements': ['requirements'],
  'responseArtifacts.accessPlan': ['access_plan'],
  'responseArtifacts.currentStatus': ['current_status'],
  'responseArtifacts.costSummary': ['cost_summary'],
  'responseArtifacts.recommendations': ['recommendation_list'],
});

function hasPlan(plan) {
  return Boolean(plan && Array.isArray(plan.days) && plan.days.length > 0);
}

function hasMarkdownTable(content) {
  return /(^|\n)\s*\|.+\|\s*\n\s*\|\s*:?-+/m.test(String(content || ''));
}

function normalizeLegacyKind(kind, hasCanonicalPlan = false) {
  const mappings = {
    compare: 'comparison',
    comparison: 'comparison',
    simple_itinerary: 'itinerary',
    full_trip: 'itinerary',
    itinerary: 'itinerary',
    trip_refinement: 'itinerary',
    refinement: 'itinerary',
    transport: hasCanonicalPlan ? 'itinerary' : 'route_plan',
    lodging_strategy: 'stay_options',
    logistics: hasCanonicalPlan ? 'itinerary' : 'route_plan',
    recommendation: 'recommendation_list',
    destination_discovery: 'recommendation_list',
    place_discovery: 'recommendation_list',
    status: 'current_status',
    current_info: 'current_status',
    direct_answer: 'plain_answer',
    general_qa: 'plain_answer',
    plain_answer: 'plain_answer',
  };
  return PRESENTATION_KIND_SET.has(kind) ? kind : mappings[kind] || null;
}

function shouldShowDayByDayPlan(intent = null, refinement = null) {
  const job = intent?.travelerJob;
  if (job === 'trip_skeleton' || job === 'trip_duration_advice' || job === 'general_advice') {
    return false;
  }
  if (job === 'day_by_day_itinerary' || job === 'itinerary_refinement' || job === 'constraint_update') {
    return true;
  }
  if (refinement?.isRefinement) return true;
  return ['simple_itinerary', 'full_trip', 'trip_refinement', 'refinement'].includes(intent?.primaryIntent);
}

export function inferTrailiePresentationKind({
  content = '',
  canonicalPlan = null,
  presentationKind = null,
  refinement = null,
  intent = null,
} = {}) {
  const normalizedKind = normalizeLegacyKind(presentationKind, hasPlan(canonicalPlan));
  if (normalizedKind) return normalizedKind;
  if (hasPlan(canonicalPlan) && shouldShowDayByDayPlan(intent, refinement)) return 'itinerary';
  if (hasMarkdownTable(content)) return 'comparison';
  return 'plain_answer';
}

export function resolveTrailiePresentationSource(response, source) {
  const resolver = SOURCE_REGISTRY[source];
  return resolver ? resolver(response) : undefined;
}

export function validateTrailiePresentation(presentation) {
  if (!presentation || presentation.schemaVersion !== 1) return false;
  if (!PRESENTATION_KIND_SET.has(presentation.presentationKind)) return false;
  if (!PROSE_POLICIES.has(presentation.prosePolicy)) return false;
  if (presentation.primaryArtifact?.kind !== presentation.presentationKind) return false;
  if (!SOURCE_KINDS[presentation.primaryArtifact?.source]?.includes(presentation.primaryArtifact.kind)) return false;
  const modules = Array.isArray(presentation.supportingModules) ? presentation.supportingModules : null;
  if (!modules || modules.length > 3) return false;
  if (new Set(modules.map((module) => module.kind)).size !== modules.length) return false;
  if (modules.some((module) => !SOURCE_KINDS[module.source]?.includes(module.kind))) return false;
  const refinement = presentation.refinement;
  if (!refinement || typeof refinement.isRefinement !== 'boolean' || !Array.isArray(refinement.changes)) return false;
  if (refinement.changes.some((change) => typeof change !== 'string' || !/^[a-z0-9_]{1,64}$/.test(change))) return false;
  const changedDayNumbers = refinement.changedDayNumbers;
  if (changedDayNumbers != null && (
    !Array.isArray(changedDayNumbers)
    || changedDayNumbers.some((dayNumber) => !Number.isInteger(dayNumber) || dayNumber <= 0)
    || new Set(changedDayNumbers).size !== changedDayNumbers.length
  )) return false;
  if (refinement.isRefinement !== (
    refinement.changes.length > 0 || (changedDayNumbers?.length || 0) > 0
  )) return false;
  const ending = presentation.ending;
  if (!ending || !Array.isArray(ending.followups) || ending.followups.length > 3) return false;
  if (![null, 'string'].includes(ending.caveat === null ? null : typeof ending.caveat)) return false;
  if (![null, 'string'].includes(ending.beforeYouGo === null ? null : typeof ending.beforeYouGo)) return false;
  if (ending.followups.some((item) => typeof item !== 'string' || !item.trim() || item.length > 120)) return false;
  return true;
}

export function inferLegacyPresentation(response) {
  const kind = inferTrailiePresentationKind({
    ...response,
    intent: response.intent,
  });
  const source = kind === 'itinerary'
    ? 'canonicalPlan'
    : kind === 'comparison' || kind === 'plain_answer'
      ? 'content'
      : kind === 'route_plan'
        ? 'travelLogistics.transport.routeLegs'
        : kind === 'flight_planning'
          ? 'travelLogistics.transport.airports'
          : 'content';
  return {
    schemaVersion: 1,
    presentationKind: kind,
    refinement: response.refinement?.isRefinement
      ? {
        isRefinement: true,
        changes: (response.refinement.changes || []).filter(Boolean),
        ...(Array.isArray(response.refinement.changedDayNumbers)
          ? { changedDayNumbers: response.refinement.changedDayNumbers }
          : {}),
      }
      : { isRefinement: false, changes: [], changedDayNumbers: [] },
    primaryArtifact: { kind, source },
    supportingModules: [],
    prosePolicy: 'full',
    ending: { caveat: null, beforeYouGo: null, followups: [] },
    legacyInferred: true,
  };
}

function buildResponseModel({
  content = '',
  canonicalPlan = null,
  travelLogistics = null,
  responseArtifacts = null,
  intent = null,
  presentation = null,
  parkImages = [],
  hasLiveData = false,
  hasWebSearch = false,
  parkNames = [],
  lifecycle = {},
  presentationKind = null,
  refinement = null,
  identity = {},
} = {}) {
  const planAvailable = hasPlan(canonicalPlan);
  const showDayByDay = shouldShowDayByDayPlan(intent, refinement);
  const normalizedParkNames = [
    ...new Set([
      ...(Array.isArray(parkNames) ? parkNames : []),
      canonicalPlan?.parkName,
    ].filter(Boolean)),
  ];

  const ownershipProbe = {
    canonicalPlan,
    parkName: canonicalPlan?.parkName || identity.parkName || null,
    parkCode: canonicalPlan?.parkCode || identity.parkCode || null,
    parkNames: normalizedParkNames,
    sources: { parkNames: normalizedParkNames },
  };
  const ownedLogistics = travelLogisticsBelongsToTurn(travelLogistics, ownershipProbe)
    ? travelLogistics
    : null;
  const planHash = identity.itineraryHash || canonicalPlan?.itineraryHash || null;
  const published = publishDerivedSurfaces({
    planHash,
    travelLogistics: ownedLogistics,
  });

  const model = {
    content: String(content || ''),
    canonicalPlan: planAvailable ? canonicalPlan : null,
    travelLogistics: published.travelLogistics,
    derivedPublication: {
      planHash: published.planHash,
      travelLogisticsStatus: published.travelLogisticsStatus,
    },
    responseArtifacts: responseArtifacts || null,
    intent: intent && typeof intent === 'object' ? intent : null,
    presentation: null,
    parkImages: Array.isArray(parkImages) ? parkImages : [],
    sources: {
      hasLiveData: Boolean(hasLiveData),
      hasWebSearch: Boolean(hasWebSearch),
      parkNames: normalizedParkNames,
    },
    lifecycle: {
      showProse: lifecycle.showProse ?? Boolean(content),
      showPlan: lifecycle.showPlan ?? (planAvailable && showDayByDay),
      isStreaming: Boolean(lifecycle.isStreaming),
      isFinalizing: Boolean(lifecycle.isFinalizing),
      pendingLabel: lifecycle.pendingLabel || null,
    },
    responseId: identity.responseId || null,
    responseVersion: identity.responseVersion ?? null,
    responseRevision: identity.responseRevision ?? null,
    itineraryHash: identity.itineraryHash || canonicalPlan?.itineraryHash || null,
  };

  const legacyInput = { ...model, presentationKind, refinement };
  model.presentation = validateTrailiePresentation(presentation)
    ? presentation
    : inferLegacyPresentation(legacyInput);
  model.presentationKind = model.presentation.presentationKind;
  model.refinement = model.presentation.refinement?.isRefinement
    ? model.presentation.refinement
    : null;
  if (lifecycle.showPlan == null) {
    model.lifecycle.showPlan = planAvailable && (
      showDayByDay || model.presentation.presentationKind === 'itinerary'
    );
  }
  return model;
}

export function toLiveTrailieResponseModel({ message = {}, lifecycle = {}, presentationKind = null, refinement = null } = {}) {
  return buildResponseModel({
    content: message.content,
    canonicalPlan: message.itineraryPlan || message.canonicalPlan || null,
    travelLogistics: message.travelLogistics,
    responseArtifacts: message.responseArtifacts,
    intent: message.intent,
    presentation: message.presentation,
    parkImages: message.parkImages,
    hasLiveData: message.hasLiveData,
    hasWebSearch: message.hasWebSearch,
    parkNames: message.parkNames?.length ? message.parkNames : message.parkName ? [message.parkName] : [],
    lifecycle: {
      ...lifecycle,
      isStreaming: lifecycle.isStreaming ?? message.isStreaming,
      isFinalizing: lifecycle.isFinalizing ?? message.isFinalizing,
    },
    presentationKind: presentationKind || message.presentationKind,
    refinement: refinement || message.refinement,
    identity: message,
  });
}

export function toDemoTrailieResponseModel({ turn = {}, lifecycle = {} } = {}) {
  return buildResponseModel({
    content: turn.content ?? turn.prose ?? '',
    canonicalPlan: turn.canonicalPlan || turn.plan || null,
    travelLogistics: turn.travelLogistics,
    responseArtifacts: turn.responseArtifacts,
    intent: turn.intent,
    presentation: turn.presentation,
    parkImages: turn.parkImages,
    hasLiveData: turn.liveData?.nps,
    hasWebSearch: turn.liveData?.web,
    parkNames: turn.parkNames || (turn.parkName ? [turn.parkName] : []),
    lifecycle,
    presentationKind: turn.presentationKind,
    refinement: turn.refinement,
    identity: turn,
  });
}

export function toRestoredTrailieResponseModel(args = {}) {
  return toLiveTrailieResponseModel(args);
}

export function attachCanonicalPlanToConversation(conversation = [], plan = null) {
  const hydrated = conversation.map((message) => {
    if (message?.role !== 'assistant') return message;
    const ownPlan = message.canonicalPlan || message.itineraryPlan || null;
    if (hasPlan(ownPlan)) {
      return {
        ...message,
        itineraryPlan: message.itineraryPlan || ownPlan,
        canonicalPlan: message.canonicalPlan || ownPlan,
        hasItinerary: true,
      };
    }
    return message;
  });
  if (!hasPlan(plan)) return hydrated;
  const assistants = hydrated
    .map((message, index) => ({ message, index }))
    .filter(({ message }) => message?.role === 'assistant');
  if (!assistants.length) return hydrated;

  const hasIdentity = Boolean(plan.responseId || plan.itineraryHash);
  const owner = assistants.find(({ message }) => {
    if (hasPlan(message.itineraryPlan || message.canonicalPlan)
      && message.responseId && plan.responseId
      && message.responseId !== plan.responseId) {
      return false;
    }
    const identityMatch = (plan.responseId && message.responseId === plan.responseId)
      || (plan.itineraryHash && message.itineraryHash === plan.itineraryHash);
    if (!identityMatch) return false;
    if (plan.responseVersion != null && message.responseVersion != null
      && plan.responseVersion !== message.responseVersion) return false;
    if (plan.responseRevision != null && message.responseRevision != null
      && plan.responseRevision !== message.responseRevision) return false;
    return true;
  }) || (hasIdentity ? null : assistants[assistants.length - 1]);
  if (!owner) return hydrated;

  return hydrated.map((message, index) => index === owner.index ? {
    ...message,
    itineraryPlan: message.itineraryPlan || plan,
    canonicalPlan: message.canonicalPlan || plan,
    itineraryHash: message.itineraryHash || plan.itineraryHash || null,
    hasItinerary: true,
    parkName: message.parkName || plan.parkName || null,
  } : message);
}
