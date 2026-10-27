const express = require('express');
const router = express.Router();
const { trailieTurnTelemetryScope } = require('../services/trailieTurnLedger');
router.use(trailieTurnTelemetryScope);
// Primary Trailie (TRAILIE_RUNTIME unset or model_first) terminates matched
// chat/stream/plan-itinerary requests in modelFirstTrailie. Only an explicit
// TRAILIE_RUNTIME=legacy selection falls through to the rollback handlers
// below. Production defaults to model_first — it does not fall through.
// Voice, providers, session status, and other non-chat routes in this file
// remain live for the current product.
router.use(require('./modelFirstTrailie').createModelFirstRouter());
const { protect, optionalAuth } = require('../middleware/auth');
const { trackTokenUsage, getTokenUsage } = require('../middleware/tokenLimits');
const { extractUserCity, shouldAppendAnonymousWebSearchUpsell, isTravelRelated } = require('../services/factsService');
const { CANONICAL_FACT_STATUS } = require('../utils/canonicalFacts');
const {
  isItineraryPlanningQuery: hasItineraryIntentFromPlanner,
} = require('../services/trailieFetchPlanner');
const {
  resolveActiveTripContext,
  applyPrimaryDestinationToMetadata,
  finalizeActiveTripContextForClient,
} = require('../services/activeTripContextService');
const {
  executeParkSearch,
  formatRankedParksDiscoveryBlock,
  formatIntentGuideParksBlock,
  formatVoiceSearchResult,
  DISCOVERY_RESPONSE_FORMAT_BLOCK,
  DISCOVERY_REFINEMENT_CLOSE_BLOCK,
  DISCOVERY_REFINEMENT_FOLLOWUP_BLOCK,
} = require('../services/parkSearchService');
const { summarizePrimaryIntents } = require('../catalog/queryTraitIntent');
const {
  shouldInjectParkDiscovery,
  isHeadToHeadCompareQuery,
  isDiscoveryRefinementReply,
  buildDiscoverySearchQuery,
  isSpecificItineraryRequest,
  isItineraryCommitRequest,
  hasActivePlanDestination,
  shouldRequestItineraryJson,
  shouldShowDayByDayPlanCta,
} = require('../utils/discoveryQuery');
const { isItineraryRefinementFollowUp } = require('../services/trailieFetchPlanner');
const { activePlanConstraintRefinement } = require('../utils/refinementScope');
const { stripAnyItineraryJsonArtifacts } = require('../utils/extractItineraryJSON');
const { isCompletedSemanticTerminal } = require('../utils/trailieV2TerminalOutcome');
const { persistCommittedTripMutation } = require('../services/tripMutationCommit');
const {
  assessItineraryReadiness,
  formatItineraryGatheringBlock,
  formatDayByDayIntakeBlock,
} = require('../utils/itineraryReadiness');
const { shouldAttachParkImages } = require('../utils/parkImagePolicy');
const { buildDrivingTimeContext, enrichItineraryDrivingTimes } = require('../services/drivingTimesContextService');
const { executePlanItineraryRequest } = require('../services/fastItineraryPlannerService');
const { hasSemanticTrailieEntryContext, mergeTrailieEntryContext, normalizeTrailieEntryContext, shouldStartFreshGuestEntry } = require('../utils/trailieEntryContext');

const STREAM_POST_PROCESS_OPTIONS = {
  enableConflictRetry: true,
  enableRegeneration: false,
  enableItineraryFallbackExtraction: true,
  /** Cap Google Distance Matrix enrichment so `done` is not blocked for many legs */
  maxDrivingEnrichMs: 2500,
};

const { isGenericClosureAlert } = require('../utils/npsAlertUtils');
const { needsNpsRoadConditionsBlock } = require('../services/npsParkConditionsService');
const {
  formatTrailverseLinksBlock,
  formatTrailverseVerifyFooter,
  formatNoLiveDataPromptInstruction,
} = require('../utils/trailverseParkLinks');

/** Prefer parks from the user's message; response/footer text must not override (e.g. permit footers). */
function resolveDisplayParkMetadata(validatedContent, resolvedMetadata, parkNamesFromUser, options = {}) {
  const { openEndedDiscovery = false } = options;

  if (parkNamesFromUser?.length > 0) {
    const parksForImages =
      resolvedMetadata.parksForDisplay?.length > 0
        ? resolvedMetadata.parksForDisplay
        : parkNamesFromUser.map((name) => ({
            parkName: name,
            parkCode: resolvedMetadata.parkCode,
            lat: resolvedMetadata.lat,
            lon: resolvedMetadata.lon,
          }));
    return {
      parkName: parkNamesFromUser[0],
      parkNames: parkNamesFromUser,
      parksForImages,
    };
  }

  if (openEndedDiscovery) {
    return {
      parkName: null,
      parkNames: [],
      parksForImages: [],
    };
  }

  const responseParks = extractAllParksFromMessage(validatedContent || '');
  if (responseParks.length > 0) {
    return {
      parkName: responseParks[0].parkName,
      parkNames: responseParks.map((p) => p.parkName),
      parksForImages: responseParks,
    };
  }
  return {
    parkName: resolvedMetadata.parkName || null,
    parkNames: [],
    parksForImages: [],
  };
}

function toPrimaryFromExtracted(park) {
  if (!park) return null;
  return {
    name: park.parkName,
    parkCode: park.parkCode || null,
    type: park.parkCode ? 'nps' : 'unknown',
    lat: park.lat ?? null,
    lon: park.lon ?? null,
    source: 'user_message',
    confidence: park.parkCode ? 'high' : 'medium',
  };
}

function buildClientActiveTripContext({
  activeTripContext,
  assistantContent,
  resolvedMetadata,
  openEndedDiscovery,
  hasItinerary = false,
}) {
  return finalizeActiveTripContextForClient({
    activeTripContext,
    assistantContent,
    resolvedMetadata,
    openEndedDiscovery,
    hasItinerary,
  });
}

async function finalizeParkImagesAndMetadata({
  validatedContent,
  resolvedMetadata,
  parkNamesFromUser,
  parkImages,
  alreadyShownImages,
  attachParkImages = false,
  openEndedDiscovery = false,
  logPrefix,
}) {
  const display = resolveDisplayParkMetadata(validatedContent, resolvedMetadata, parkNamesFromUser, {
    openEndedDiscovery,
  });

  if (!attachParkImages || alreadyShownImages || !validatedContent) {
    return {
      parkName: display.parkName,
      parkNames: display.parkNames,
      parkImages: [],
    };
  }

  let images = parkImages || [];
  if (images.length === 0 && display.parksForImages.length > 0) {
    images = await fetchMultiParkImages(display.parksForImages, `${logPrefix} Response`);
  }

  return {
    parkName: display.parkName,
    parkNames: display.parkNames,
    parkImages: images,
  };
}

const { formatFeeFreeBlock } = require('../services/feeFreeDaysService');
const { extractParkFromMessage, extractAllParksFromMessage } = require('../utils/parkExtractor');
const { stripSkipOnlyParkSentences } = require('../utils/parkSkipContext');
const { unwrapMislinkedParkMarkdown } = require('../utils/parkMarkdownLinks');
const { getAIAnalytics, getLearningInsights } = require('../controllers/aiAnalyticsController');
const AnonymousSession = require('../models/AnonymousSession');
const Favorite = require('../models/Favorite');
const VisitedPark = require('../models/VisitedPark');
const {
  isValidGuestSessionId,
  resolveAnonymousRequestIdentity,
} = require('../utils/anonymousIdGenerator');
const { latestCanonicalPlanFromMessages } = require('../utils/guestConversationPlan');
const { rememberConversationPlan } = require('../utils/conversationPlanContinuity');
const { projectGuestConversationForStatus } = require('../utils/anonymousSessionStatusMessages');
// Stage 14.8A.2 — guest quota is coupled to COMPLETION, not arrival. Both
// anonymous handlers admit exactly one pending logical turn, and only an
// atomic terminal completion grows the guest's completed-turn count.
const {
  GUEST_ROUTE_CODES,
  GUEST_TURN_FAILURE_CODES,
  classifyGuestTurnFailure,
  openGuestTurn,
} = require('../services/guestTurnScope');
const { readGuestQuota, releaseStalePendingTurns } = require('../services/anonymousTurnLedger');
const {
  buildAnonymousConversionMessage,
  buildGuestChatPublicUrl,
} = require('../utils/guestChatUrl');
const { extractItineraryJSON, validateItineraryFeasibility } = require('../utils/extractItineraryJSON');
const { extractItineraryFromResponse } = require('../utils/claudeResponseParser');
const {
  CLAUDE_FALLBACK_MODELS,
  CLAUDE_EXTRACTOR_MODEL,
  CLAUDE_PRIMARY_MODEL,
  OPENAI_PRIMARY_MODEL,
  OPENAI_FALLBACK_MODELS,
} = require('../config/aiModels');
// Stage 14.7I §2/§3 — the single Claude model resolution + pre-dispatch guard.
const { resolveProviderModel } = require('../config/resolveProviderModel');
function formatClaudeModelLabel(model = CLAUDE_PRIMARY_MODEL) {
  if (/sonnet-5/i.test(model)) return 'Claude Sonnet 5';
  if (/sonnet-4-6/i.test(model)) return 'Claude Sonnet 4.6';
  return model;
}

function getTrailieProviders() {
  if (!process.env.OPENAI_API_KEY) return [];
  return [{
    id: 'openai',
    name: 'Trailie',
    model: 'GPT-5.6',
    description: 'Live NPS data, constraint-aware trip planning, and insider park picks',
    available: true,
  }];
}

const {
  autoRouteProvider,
  resolveResponseMode,
} = require('../utils/trailieResponseMode');
// Stage 9 — reviewer execution is OFF the request path. The route no longer
// imports the model-calling review pipeline; it only schedules a durable,
// sampled shadow review that a separate worker runs later.
const { getFinalResponseRejectionReason } = require('../utils/finalResponseGuards');
const { normalizeCoordinates, COORDINATE_SOURCE } = require('../utils/coordinateValidation');
const { stripAlignmentMarkers } = require('../utils/proseAlignmentMarkers');
const { getTrailieReviewConfig } = require('../config/trailieReviewConfig');
const {
  classifyReviewEligibility,
  shouldSampleTrailieReview,
} = require('../utils/trailieReviewSampler');
const { buildTrailieReviewSnapshot } = require('../utils/trailieReviewSnapshot');
const { enqueueReviewJob, ENQUEUE_RESULT } = require('../services/trailieReviewQueue');
const { enrichItineraryParkIdentity } = require('../utils/itineraryParkIdentity');
const { buildCanonicalTrailieResponse } = require('../utils/canonicalResponse');
const { createTurnResponseIdentity, readPriorResponseVersion } = require('../utils/responseIdentity');
const {
  createEarlyEventEmitter,
  buildRevisionOneOutbound,
  buildRevisionTwoOutbound,
  buildMismatchSafeTerminal,
  assertItineraryUnchanged,
} = require('../utils/earlyRevisionEvents');
const { stripItineraryArtifacts } = require('../utils/itineraryArtifacts');
const {
  callClaudeWithFallback,
  formatCorrectionNotice,
  buildPlanDocument,
  buildAuditTrail,
} = require('../utils/trailiePipelineUtils');
const { parseConstraints, preflightCheck, buildConstraintBlock, validateItineraryConstraints, detectHypothetical, detectConflicts, detectIntent } = require('../utils/constraintEngine');
const { resolveOperationalConstraints, formatOperationalConstraintBlock } = require('../utils/trailieOperationalConstraints');
const { resolveDestinationDisplayName } = require('../utils/resolvedDestinationDisplay');
const { correctItinerary, computeConfidence, scoreItinerary } = require('../utils/itineraryCorrector');
const { logAIRequest, extractParksMentioned } = require('../utils/aiLogger');
const { TRAILIE_VOICE_INSTRUCTIONS } = require('../prompts');
const { buildItineraryOutputInstruction } = require('../prompts/itineraryOutputInstruction');
// Stage 11 — itinerary generation config (early-event gating on auth stream).
const { getItineraryGenerationConfig } = require('../config/itineraryGenerationConfig');
const {
  setSseHeaders,
  writeSseEvent,
  attachClientDisconnectAbort,
} = require('../utils/sseStream');
// WP10B — transport/client compatibility layer. The route emits canonical
// concepts; the adapter serializes them for the connection's dialect.
const { resolveTrailieTransportDialect } = require('../utils/trailieTransportDialect');
const {
  createTrailieTransportAdapter,
  routeEarlyEventToTransport,
} = require('../utils/trailieTransportAdapter');
// One Trailie execution path; availability compatibility stays at this boundary.
const { isTrailieRuntimeEnabled } = require('../config/trailieRuntime');
const { buildGenericLiveGatePreflight } = require('../eval/trailie/genericLiveGatePreflight');
const {
  createTrailieStreamEventBinder,
  runTrailieFromPreparedContext,
  summarizeTrailieTelemetry,
} = require('../services/trailieRouteBridge');
const crypto = require('crypto');
const claudeService = require('../services/claudeService');
const openaiService = require('../services/openaiService');
const {
  assertLiveProviderAllowed,
  isLiveProviderDenied,
} = require('../config/providerTestPolicy');
const { getNpsService } = require('../services/npsService');
const { pickPrimaryEntranceFee } = require('../utils/entranceFeeUtils');

// Initialize AI clients
let anthropic = null;
let openai = null;

try {
  if (process.env.ANTHROPIC_API_KEY) {
    const Anthropic = require('@anthropic-ai/sdk');
    const synthetic = Anthropic.__trailieSyntheticProvider === true;
    if (!isLiveProviderDenied() || synthetic) {
      assertLiveProviderAllowed({ provider: 'claude', phase: 'constructor', synthetic });
      anthropic = new Anthropic({
        apiKey: process.env.ANTHROPIC_API_KEY,
      });
    }
  }
} catch (error) {
  console.warn('Claude SDK not available:', error.message);
}

try {
  if (process.env.OPENAI_API_KEY && !isLiveProviderDenied()) {
    assertLiveProviderAllowed({ provider: 'openai', phase: 'constructor' });
    const OpenAI = require('openai');
    openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }
} catch (error) {
  console.warn('OpenAI SDK not available:', error.message);
}

// Helper: fetch relevant blog posts for park context
async function fetchBlogContext(parkNames) {
  try {
    const BlogPost = require('../models/BlogPost');
    const searchQuery = parkNames.join(' ');
    const posts = await BlogPost.find(
      { status: 'published', $text: { $search: searchQuery } },
      { title: 1, excerpt: 1, slug: 1, score: { $meta: 'textScore' } }
    )
      .sort({ score: { $meta: 'textScore' } })
      .limit(3)
      .lean();

    if (!posts.length) return null;

    let block = '\n\n--- TRAILVERSE BLOG KNOWLEDGE ---';
    block += '\nThe following excerpts are from published TrailVerse blog posts. Use this information to enrich your answers.';
    block += '\nDo NOT link to, mention, or reference these blog posts in your response. Users can find them on the site. Just use the knowledge.\n';
    for (const post of posts) {
      block += `\n• "${post.title}" — ${post.excerpt}`;
    }
    return block;
  } catch (err) {
    console.error('[BlogContext] Error fetching blog posts:', err.message);
    return null;
  }
}

function mergeParkImagePool(...lists) {
  const seen = new Set();
  const out = [];
  for (const list of lists) {
    for (const img of list || []) {
      const url = img?.url;
      if (!url || seen.has(url)) continue;
      seen.add(url);
      out.push(img);
    }
  }
  return out;
}

function scoreParkImageForChat(img) {
  const haystack = `${img?.title || ''} ${img?.altText || ''} ${img?.caption || ''}`.toLowerCase();
  const url = String(img?.url || '').toLowerCase();

  // Hard skips: maps/diagrams/charts/scans/archival that look "random" in a hero grid.
  const skipPatterns = [
    /\bmap\b/,
    /\btopo(?:graphic)?\b/,
    /\bgeolog(?:y|ic|ical)\b/,
    /\bchart\b/,
    /\bdiagram\b/,
    /\bcross[-\s]?section\b/,
    /\blegend\b/,
    /\bplate\b/,
    /\bquadrangle\b/,
    /\busgs\b/,
    /\bscan(?:ned)?\b/,
    /\barchiv(?:al|e)\b/,
    /\bhistoric(?:al)?\b/,
    /\bblack\s*(?:&|and)\s*white\b/,
    /\bphoto\s*\\d+\\b/,
  ];
  if (skipPatterns.some((re) => re.test(haystack))) return -1000;
  if (/\b(pdf|tif|tiff)\b/.test(url)) return -1000;
  // NPS gallery asset pages are HTML endpoints — they 404 in <img> tags.
  if (/\/npgallery\/getasset\//i.test(url) && !/\.(jpe?g|png|webp|gif|avif)(\?|$)/i.test(url)) {
    return -1000;
  }

  // Prefer "wow" scenery keywords when present.
  let score = 0;
  const wowBoost = [
    /\bsunrise\b/,
    /\bsunset\b/,
    /\bgolden hour\b/,
    /\bmountain\b/,
    /\bpeak\b/,
    /\bglacier\b/,
    /\blake\b/,
    /\briver\b/,
    /\bwaterfall\b/,
    /\bcanyon\b/,
    /\boverlook\b/,
    /\bview\b/,
    /\bwildlife\b/,
    /\bbison\b/,
    /\belk\b/,
    /\bbear\b/,
    /\bmoose\b/,
  ];
  for (const re of wowBoost) {
    if (re.test(haystack)) score += 6;
  }

  // Mild preference for descriptive titles vs empty/boilerplate.
  if ((img?.title || '').trim().length >= 8) score += 2;
  if ((img?.altText || '').trim().length >= 8) score += 1;

  // Very small nudge for jpeg/webp/png (common photos) without assuming host.
  if (/\.(jpe?g|png|webp)(\?|$)/.test(url)) score += 1;

  return score;
}

function selectParkImagesForChat(pool, need) {
  const ranked = (pool || [])
    .map((img, idx) => ({ img, idx, score: scoreParkImageForChat(img) }))
    .filter((x) => x.score > -999) // remove hard skips
    .sort((a, b) => b.score - a.score || a.idx - b.idx)
    .map((x) => x.img);

  // Fallback: if we filtered too aggressively, fall back to original order.
  const fallbackPool = (pool || []).slice(0, need);
  const chosen = ranked.slice(0, need);
  return chosen.length >= Math.min(need, 2) ? chosen : fallbackPool;
}

/**
 * Collect up to `need` images for one park — same sources as the park Photos tab.
 * Gallery API usually has 50+ assets; the /parks?fields=images record often has only 3–7.
 */
async function collectParkImagesForChat(parkCode, need) {
  const [gallery, parkRecord] = await Promise.all([
    getNpsService().getParkGalleryPhotos(parkCode),
    getNpsService().getParkImages(parkCode),
  ]);
  const pool = mergeParkImagePool(gallery, parkRecord);
  return selectParkImagesForChat(pool, need);
}

// Helper: fetch images for multiple parks with smart distribution (target 4 total)
// 1 park → 4 images, 2 parks → 2 each, 3 parks → 2+1+1, 4+ parks → 1 each
/**
 * Stage 8 — build the canonical response identity + the exact plan document the
 * FRONTEND will persist. The server owns content/hashes; the browser submits
 * this verbatim (it must not rebuild content or re-derive itineraryData). The
 * server no longer writes trip.plan itself — this removes the F-PERSIST-1 race.
 *
 * responseVersion is a per-trip monotonic counter: the client echoes the
 * currently-stored plan version as metadata.priorResponseVersion so each new
 * turn / regeneration increments it and the controller guard can reject stale
 * or conflicting writes.
 */
async function buildCanonicalOutbound({
  processed,
  response,
  rawStreamContent,
  req,
  resolvedMetadata,
  auditTrail,
  preparedContext = null,
  constraints = null,
  // Stage 14.1 §2 — the identity minted once at TURN ADMISSION. When supplied, no
  // second identity is minted here; the same responseId serves revision 1,
  // revision 2, and terminal structured-failure responses. Omitted (legacy call) →
  // the pre-Stage-14 behavior of minting at envelope construction.
  responseIdentity = null,
}) {
  const destinationDisplay = resolveDestinationDisplayName({
    resolvedMetadata,
    allExtractedParks: preparedContext?.allExtractedParks || [],
    activeTripContext: preparedContext?.activeTripContext || null,
  });
  const priorVersion = Number(req.body?.metadata?.priorResponseVersion) || 0;
  const envelope = buildCanonicalTrailieResponse({
    responseId: responseIdentity ? responseIdentity.responseId : undefined,
    responseVersion: responseIdentity ? responseIdentity.responseVersion : priorVersion + 1,
    processedContent: processed.cleanContent,
    rawStreamContent: rawStreamContent || processed.cleanContent,
    itineraryData: processed.itineraryData || null,
    planScore: processed.planScore || null,
    corrections: processed.correctionsApplied || [],
    feasibilityIssues: processed.feasibilityIssues || [],
    provider: response.provider,
    model: response.model,
    reviewMeta: processed.reviewMeta || null,
  });

  // Stage 10 — the canonical response is IMMUTABLE after construction. Review
  // scheduling is computed as SEPARATE outbound metadata (reviewScheduling) and
  // is never written back into the envelope, plan, or hashes. This guarantees
  // canonical content/plan/identity are byte-identical regardless of whether
  // enqueue is disabled, succeeds, or fails.
  const reviewScheduling = await scheduleShadowReview({
    envelope,
    response,
    preparedContext,
    constraints,
    resolvedMetadata,
  });

  const identity = {
    responseId: envelope.responseId,
    responseVersion: envelope.responseVersion,
    contentHash: envelope.contentHash,
    itineraryHash: envelope.itineraryHash,
  };

  const canonicalPlan = processed.itineraryData
    ? buildPlanDocument({
        itineraryData: processed.itineraryData,
        parkName: destinationDisplay || resolvedMetadata.parkName || req.body.metadata?.parkName,
        parkCode: req.body.metadata?.parkCode || resolvedMetadata.parkCode,
        // The stable, content-independent review marker — never the dynamic
        // queue status. Identical across every enqueue outcome.
        reviewMeta: envelope.reviewMeta,
        auditTrail,
        identity,
        feasibilityIssues: processed.feasibilityIssues || [],
      })
    : null;

  return { envelope, identity, canonicalPlan, reviewScheduling };
}

/**
 * Stage 9/10 — the ONLY request-path touchpoint with the review system. Samples
 * deterministically on the canonical responseId and (when enabled + sampled)
 * builds the immutable snapshot from the EXACT evidence fetched during
 * generation, then enqueues one durable job with a strict, bounded timeout.
 *
 * PURE with respect to the canonical response: it reads the envelope but never
 * mutates it. It never waits for a reviewer/model call, never falls back to
 * inline review, and never throws to the caller — any failure resolves to a
 * queue status while the user response proceeds unchanged.
 *
 * @returns {Promise<Object>} reviewScheduling — separate outbound metadata
 *   (never part of the content identity). Excludes the internal job id.
 */
async function scheduleShadowReview({
  envelope,
  response,
  preparedContext = null,
  constraints = null,
  resolvedMetadata = {},
}) {
  const config = getTrailieReviewConfig();
  const startedAt = Date.now();

  const scheduling = {
    reviewerMode: 'shadow',
    reviewExecution: 'async',
    repaired: false,
    patchesApplied: 0,
    reviewQueueStatus: 'disabled',
    reviewSampleRate: 0,
    reviewSampleBucket: null,
    reviewEnqueueDurationMs: 0,
  };

  const eligibility = classifyReviewEligibility({
    provider: response?.provider,
    model: response?.model,
    content: envelope.content,
    isConversionMessage: response?.isConversionMessage === true,
  });

  const decision = shouldSampleTrailieReview({
    responseId: envelope.responseId,
    sampleRate: config.sampleRate,
    eligible: eligibility.eligible,
    reason: eligibility.reason,
  });

  // Aggregate-safe sampling provenance only — never user-identifying data.
  scheduling.reviewSampleRate = decision.sampleRate;
  scheduling.reviewSampleBucket = decision.bucket;

  if (!config.enqueueEnabled) {
    scheduling.reviewQueueStatus = 'disabled';
    return scheduling;
  }
  if (!decision.sampled) {
    scheduling.reviewQueueStatus = 'not_sampled';
    return scheduling;
  }

  let snapshot;
  try {
    snapshot = buildTrailieReviewSnapshot({
      envelope,
      canonicalFactBundle: preparedContext?.canonicalFactBundle || { facts: [] },
      canonicalFactStatus: preparedContext?.canonicalFactStatus || null,
      constraints,
      resolvedMetadata: resolvedMetadata || {},
    });
  } catch (err) {
    console.warn('[AI] Shadow-review snapshot build failed:', err.message);
    scheduling.reviewQueueStatus = 'enqueue_failed';
    scheduling.reviewEnqueueDurationMs = Date.now() - startedAt;
    return scheduling;
  }

  const result = await enqueueReviewJob({
    snapshot,
    reviewerVersion: config.reviewerVersion,
    sampleRate: decision.sampleRate,
    sampleBucket: decision.bucket,
    maxAttempts: config.jobMaxAttempts,
    timeoutMs: config.enqueueTimeoutMs,
  });

  scheduling.reviewEnqueueDurationMs = Date.now() - startedAt;

  // reviewJobId is INTERNAL (admin/telemetry only) — logged, never returned in
  // the public scheduling payload.
  if (result.jobId) {
    console.log(
      `[AI] Shadow review scheduled: status=${result.status} job=${result.jobId} response=${envelope.responseId}`
    );
  }

  scheduling.reviewQueueStatus =
    result.status === ENQUEUE_RESULT.QUEUED || result.status === ENQUEUE_RESULT.DUPLICATE
      ? 'queued'
      : 'enqueue_failed';

  return scheduling;
}

/**
 * Stage 10 (F-ACC-2) — every coordinate from the fallback extractor is a model
 * estimate, so it is never trusted. This nulls lat/lon on each stop and marks
 * provenance unknown. Coordinates only reappear later via trusted enrichment
 * (resolved metadata / geocoder / stored records), never from the extractor.
 */
function stripUntrustedExtractedCoordinates(itineraryData) {
  if (!itineraryData?.days) return itineraryData;
  for (const day of itineraryData.days) {
    for (const stop of day.stops || []) {
      const norm = normalizeCoordinates({
        latitude: stop.latitude,
        longitude: stop.longitude,
        source: 'model_estimate',
      });
      stop.latitude = norm.latitude; // always null for an estimate
      stop.longitude = norm.longitude;
      stop.coordinateSource = COORDINATE_SOURCE.UNKNOWN;
    }
  }
  return itineraryData;
}

async function fetchMultiParkImages(parks, logPrefix = '[AI]') {
  if (!parks || parks.length === 0) return [];

  const total = 4;
  const parkCount = parks.length;
  const distribution = [];

  if (parkCount === 1) {
    distribution.push(total);
  } else if (parkCount === 2) {
    distribution.push(2, 2);
  } else if (parkCount === 3) {
    distribution.push(2, 1, 1);
  } else {
    for (let i = 0; i < Math.min(parkCount, total); i++) {
      distribution.push(1);
    }
  }

  const allImages = [];
  const parksToFetch = parks.slice(0, distribution.length);

  await Promise.all(parksToFetch.map(async (park, idx) => {
    const count = distribution[idx];
    try {
      const pool = await collectParkImagesForChat(park.parkCode, count);
      if (pool.length > 0) {
        const selected = pool.map((img) => ({
          url: img.url,
          altText: img.altText || img.title,
          title: img.title,
          parkCode: park.parkCode,
          parkName: park.parkName,
        }));
        allImages.push({ idx, images: selected });
        if (selected.length < count) {
          console.warn(
            `${logPrefix} Only ${selected.length}/${count} images for ${park.parkCode} (NPS pool short)`
          );
        }
      }
    } catch (err) {
      console.error(`${logPrefix} Image fetch error for ${park.parkCode}:`, err.message);
    }
  }));

  allImages.sort((a, b) => a.idx - b.idx);
  const result = allImages.flatMap((item) => item.images);
  console.log(`${logPrefix} Multi-park images: ${result.length} total for ${parksToFetch.map((p) => p.parkCode).join(', ')}`);
  return result;
}

const PERSONALIZATION_MODE_RULES = `
--- PERSONALIZATION MODE (My Recommendations) ---
The user opened My Recommendations. Follow these rules:

FIRST RESPONSE (only when this is their first message in this thread):
- Under ~90 words
- Optional first-name greeting once — skip if the question is already specific
- One line that you'll use their saved trips and favorites for ideas. Do not claim live booking or current availability.
- At most ONE history detail if natural — never count trips or inventory parks
- End with exactly ONE clarifying question (length, region, vibe, or season)
- Do NOT list destinations yet

AFTER they reply:
- Recommend 2–3 destinations they have not visited, with brief why-each
- Reference past trips only when it strengthens the pick
--- END PERSONALIZATION MODE ---
`;

const HEAD_TO_HEAD_COMPARE_BLOCK = `
--- HEAD-TO-HEAD COMPARE ---
The user named specific parks to compare. Use LIVE TRAILVERSE DATA for those parks only.
- First sentence MUST pick a winner (see DECISION AUTHORITY rules).
- Do NOT introduce other parks from catalog search or training data.
- Keep under 350 words. No ranked shortlists.
--- END HEAD-TO-HEAD COMPARE ---
`;

const SINGLE_PARK_PLAN_BLOCK = `
--- SINGLE-PARK PLANNING ---
The user already chose one destination. Do NOT open with "Recommendation: [park name]" — that label is for compare/choose questions only.
Open with one natural Trailie sentence (see PLANNING OPENERS & LOGISTICS), then ## At a glance (drive time, base, fees, permits, heat/crowds) before day-by-day.
Never open with "you've already given me enough to build this" or label bullets "Live-data note" / "Fitness fit" / "Trip length".
--- END SINGLE-PARK PLANNING ---
`;

// Helper: auto-route provider — Claude default for all turn types
function resolveProvider(bodyProvider, messages) {
  if (bodyProvider && bodyProvider !== 'auto') {
    return bodyProvider;
  }
  return autoRouteProvider(messages);
}

/**
 * Ranked catalog search for open-ended / compare questions (hybrid RAG — owned corpus).
 * @returns {Promise<boolean>} whether a block was appended
 */
async function appendRankedDiscoveryToPrompt({
  enhancedSystemPrompt,
  discoveryQuery,
  namedParkCount,
  isAnonymous,
  httpReq,
  logPrefix,
  allowRefinement = false,
  originCity = null,
}) {
  const injectDiscovery =
    shouldInjectParkDiscovery(discoveryQuery, { namedParkCount }) || allowRefinement;
  if (!injectDiscovery) {
    return { appended: false, prompt: enhancedSystemPrompt };
  }

  let prompt = enhancedSystemPrompt;
  try {
    const searchQuery = (discoveryQuery || '').trim().slice(0, 200);
    const { parks, count } = await executeParkSearch({
      q: searchQuery,
      limit: 5,
      req: httpReq,
      source: isAnonymous ? 'trailie_chat_anon' : 'trailie_chat',
      originCity,
    });
    if (count >= 3) {
      const primaryIntents = summarizePrimaryIntents(searchQuery);
      const block = formatRankedParksDiscoveryBlock(
        parks,
        primaryIntents,
        searchQuery,
        originCity
      );
      if (block) {
        prompt += block;
        console.log(`${logPrefix} Ranked discovery search injected:`, {
          query: searchQuery.slice(0, 60),
          count,
          namedParkCount,
          originCity: originCity?.name || null,
          intents: primaryIntents.map((i) => `${i.label}:${i.weight}`),
          top: parks.slice(0, 3).map((p) => p.fullName || p.name),
        });
        return { appended: true, prompt };
      }
    }
  } catch (discoveryErr) {
    console.error(`${logPrefix} Discovery search error:`, discoveryErr.message);
  }

  return { appended: false, prompt };
}

/** Auto-search on vibe-guide sessions when the client has not yet sent ranked picks. */
async function appendIntentGuideDiscoveryToPrompt({
  enhancedSystemPrompt,
  intentGuide,
  clientContext,
  isAnonymous,
  httpReq,
  logPrefix,
  originCity = null,
}) {
  if (!intentGuide?.searchQuery) {
    return { appended: false, prompt: enhancedSystemPrompt };
  }
  if (typeof clientContext === 'string' && clientContext.includes('INTENT GUIDE RANKED PICKS')) {
    return { appended: false, prompt: enhancedSystemPrompt };
  }

  let prompt = enhancedSystemPrompt;
  try {
    const searchQuery = intentGuide.searchQuery.trim().slice(0, 200);
    const pinned = Array.isArray(intentGuide.featuredParkCodes)
      ? intentGuide.featuredParkCodes.join(',')
      : '';
    const { parks, count } = await executeParkSearch({
      q: searchQuery,
      limit: 24,
      pinned: pinned || undefined,
      req: httpReq,
      source: isAnonymous ? 'trailie_chat_anon' : 'trailie_chat',
      originCity,
    });
    if (parks.length >= 1) {
      const block = formatIntentGuideParksBlock(parks, {
        guideTitle: intentGuide.title,
        searchQuery,
      });
      if (block) {
        prompt += block;
        console.log(`${logPrefix} Intent guide ranked parks injected:`, {
          path: intentGuide.path,
          query: searchQuery.slice(0, 60),
          count,
        });
        return { appended: true, prompt };
      }
    }
  } catch (err) {
    console.error(`${logPrefix} Intent guide discovery error:`, err.message);
  }

  return { appended: false, prompt: enhancedSystemPrompt };
}

// Helper: parse request body and prepare messages, facts, and system prompt
async function prepareChatContext(body, logPrefix = '[AI]', options = {}) {
  const {
    isAnonymous = false,
    isTrustedMcp = false,
    req: httpReq = null,
    // Server-persisted canonical plan for this conversation (guest sessions
    // store it on their assistant messages). Server-owned only — never read
    // from client-supplied body/metadata.
    persistedConversationPlan = null,
  } = options;
  const skipWebSearchForGuest = isAnonymous && !isTrustedMcp;

  let {
    messages = [],
    provider = 'auto',
    model,
    temperature = 0.4,
    top_p = 0.9,
    maxTokens = 8000,
    systemPrompt,
    metadata = {} // { parkCode, parkName, lat, lon, userId }
  } = body;

  const skipUserContext = metadata.skipUserContext === true;

  if (!messages || !Array.isArray(messages)) {
    throw Object.assign(new Error('Messages array is required'), { statusCode: 400 });
  }

  const originalMessages = messages;

  let savedTripPlan = null;
  const tripId = metadata.tripId || body.tripId || body.conversationId;
  if (tripId) {
    try {
      const TripPlan = require('../models/TripPlan');
      savedTripPlan = await TripPlan.findById(tripId)
        .select('formData parkCode parkName plan conversation planningState entryContext')
        .lean();
    } catch (tripLoadErr) {
      console.warn(`${logPrefix} Could not load TripPlan ${tripId}:`, tripLoadErr.message);
    }
  }

  // WP-TU Phase 4 Task 10 — bounded metadata for the traveler's OTHER saved
  // plans, fetched here (before classification exists) so Task 9's pure
  // `resolveTargetTripId` can be called later, in trailieV2ExecutionService.js,
  // once the single authoritative `intent` is available. Guests have no
  // concept of multiple saved plans (AnonymousSession is single-session), so
  // this is always empty for them.
  let candidatePlans = [];
  if (!isAnonymous && httpReq?.user?._id) {
    const { fetchCandidatePlans } = require('../utils/candidatePlanDiscovery');
    candidatePlans = await fetchCandidatePlans({
      userId: httpReq.user._id,
      excludeTripId: tripId || null,
      logPrefix,
    });
  }

  const entryContext = normalizeTrailieEntryContext(savedTripPlan?.entryContext || metadata.entryContext).context;
  const entryDestination = entryContext.requestedDestinations[0] || null;
  const entryState = mergeTrailieEntryContext({ entryContext });
  const entryPreferenceForm = {
    ...(entryState.preferences?.interests?.length ? { interests: entryState.preferences.interests } : {}),
    ...(entryState.preferences?.fitnessLevel ? { fitnessLevel: entryState.preferences.fitnessLevel } : {}),
    ...(entryState.preferences?.budgetPreference ? { budget: entryState.preferences.budgetPreference } : {}),
    ...(entryState.preferences?.origin ? { origin: entryState.preferences.origin } : {}),
  };
  metadata = {
    ...metadata,
    entryContext,
    formData: {
      ...(entryContext.formData || {}),
      ...entryPreferenceForm,
      ...(metadata.formData || {}),
      ...(savedTripPlan?.formData || {}),
    },
    parkCode: savedTripPlan?.parkCode || metadata.parkCode || entryDestination?.parkCode || null,
    parkName: savedTripPlan?.parkName || metadata.parkName || entryDestination?.name || null,
    lat: metadata.lat ?? entryDestination?.lat,
    lon: metadata.lon ?? entryDestination?.lon,
    activeTripContext: metadata.activeTripContext || entryContext.activeTripContext || null,
  };

  // Auto-route provider if not explicitly set
  const explicitProvider = provider && provider !== 'auto' ? provider : null;
  if (!explicitProvider) {
    provider = autoRouteProvider(messages);
    console.log(`${logPrefix} Auto-routed to provider: ${provider}`);
  } else {
    provider = explicitProvider;
  }

  /**
   * Stage 14.7I §2 — resolve the provider model ONCE, here, for every handler.
   *
   * The client does not send `model`. Before this, each downstream call site
   * compensated separately: the prose path used `model || CLAUDE_FALLBACK_MODELS[0]`
   * and the tool-first path used `model` unchanged. Phase A therefore reached
   * the Anthropic SDK with `undefined` and was rejected with
   * `400 "model: Field required"`, silently degrading the route to prose-only.
   *
   * Resolving in `prepareChatContext` means all four handlers (/chat,
   * /chat-stream and both anonymous variants) and both generation branches read
   * the same value, so the two expressions can never drift apart again.
   *
   * This runs AFTER auto-routing, not before. Real clients send `provider: 'auto'`,
   * which resolved down the Claude branch and produced `provider=openai` paired
   * with `model=claude-sonnet-5` once routing ran. Nothing dispatched that pair —
   * v2 re-resolves through its own router and the legacy call sites are guarded
   * by `provider === 'claude'` — but a contradictory pair should never exist to
   * be read in the first place.
   */
  const modelResolution = resolveProviderModel({ requestedModel: model, provider });
  model = modelResolution.ok ? modelResolution.model : null;

  const responseMode = resolveResponseMode(messages, metadata);
  console.log(`${logPrefix} Response mode: ${responseMode}`);

  // Smart context management — trim long conversations with structured summary
  const MAX_CONTEXT_MESSAGES = 20;
  if (messages.length > MAX_CONTEXT_MESSAGES) {
    const systemMsg = messages.find(m => m.role === 'system');
    const recentMessages = messages.filter(m => m.role !== 'system').slice(-15);
    const olderMessages = messages.filter(m => m.role !== 'system').slice(0, -15);

    // Extract key decisions from USER messages only — including assistant
    // messages causes a self-reinforcing hallucination loop where the model's
    // own suggestions (e.g., "for 1 person", "budget $200/day") get extracted
    // as user-stated facts and fed back as grounded context on later turns.
    const olderUserText = olderMessages.filter(m => m.role === 'user').map(m => m.content).join(' ');
    const summaryParts = ['[CONVERSATION CONTEXT — extracted from earlier messages]'];

    // Extract park name
    const parkMatch = olderUserText.match(/(?:going to|visiting|trip to|plan for|heading to|explore)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*(?:\s+National\s+Park)?)/);
    if (parkMatch) summaryParts.push(`Park: ${parkMatch[1]}`);

    // Extract dates
    const dateMatch = olderUserText.match(/(?:from|between|starting|arriving|dates?:?\s*)(\w+ \d{1,2}(?:\s*[-–to]+\s*\w+ \d{1,2})?(?:,?\s*\d{4})?)/i);
    if (dateMatch) summaryParts.push(`Dates: ${dateMatch[1]}`);

    // Extract group size
    const groupMatch = olderUserText.match(/(\d+)\s*(?:people|person|adults?|of us|travelers?|in (?:our|the) group)/i);
    if (groupMatch) summaryParts.push(`Group size: ${groupMatch[1]}`);

    // Extract budget
    const budgetMatch = olderUserText.match(/(?:budget|spend|spending|afford)\s*(?:is|of|around|about)?\s*\$?([\d,]+(?:\s*[-–to]+\s*\$?[\d,]+)?)/i);
    if (budgetMatch) summaryParts.push(`Budget: $${budgetMatch[1]}`);

    // Extract interests/activities
    const interestPatterns = /(hiking|camping|photography|wildlife|stargazing|fishing|kayaking|rock climbing|backpacking|scenic drives?|waterfalls?|sunrise|sunset|family.friendly|kid.friendly|accessible|easy trails?|moderate|challenging|strenuous)/gi;
    const interests = [...new Set((olderUserText.match(interestPatterns) || []).map(i => i.toLowerCase()))];
    if (interests.length > 0) summaryParts.push(`Interests: ${interests.slice(0, 8).join(', ')}`);

    // Extract fitness/difficulty preference
    const fitnessMatch = olderUserText.match(/(?:fitness|difficulty|experience|skill)\s*(?:level|is)?\s*:?\s*(beginner|easy|moderate|advanced|experienced|hard|strenuous)/i);
    if (fitnessMatch) summaryParts.push(`Fitness level: ${fitnessMatch[1]}`);

    // Extract accommodation preference
    const accomMatch = olderUserText.match(/(camping|tent|rv|car camping|backcountry|lodge|hotel|cabin|glamping|airbnb)/i);
    if (accomMatch) summaryParts.push(`Accommodation: ${accomMatch[1]}`);

    // Capture what was suggested and accepted/rejected
    const aiMessages = olderMessages.filter(m => m.role === 'assistant').map(m => m.content);
    const userMessages = olderMessages.filter(m => m.role === 'user').map(m => m.content);
    const rejections = userMessages.filter(m => /(skip|don't|no|remove|instead|change|replace|not interested|too)/i.test(m));
    if (rejections.length > 0) {
      summaryParts.push(`User adjustments: ${rejections.slice(-3).map(r => r.substring(0, 80)).join('; ')}`);
    }

    summaryParts.push(`[${olderMessages.length} earlier messages summarized above — ${recentMessages.length} recent messages follow]`);

    messages = [
      ...(systemMsg ? [systemMsg] : []),
      { role: 'system', content: summaryParts.join('\n') },
      ...recentMessages
    ];
  }

  // Filter out system messages from the messages array (Claude API doesn't allow them)
  const filteredMessages = messages.filter(m => m.role !== 'system');

  const conversationUserText = filteredMessages
    .filter((m) => m.role === 'user')
    .map((m) => m.content)
    .filter(Boolean)
    .join('\n');

  // Extract the last user message for fact fetching
  const lastUserMessage = [...filteredMessages].reverse().find(m => m.role === 'user')?.content || '';

  // Auto-extract parks and resolve multi-turn active destination memory
  let resolvedMetadata = { ...metadata };
  // `existingCanonicalPlan` is server-authored ONLY — a saved TripPlan, the
  // guest session's persisted plan, or the authenticated conversational-plan
  // store (all set below). A client-supplied plan blob must never become the
  // trusted refinement target.
  delete resolvedMetadata.existingCanonicalPlan;
  const explicitMessageParks = lastUserMessage ? extractAllParksFromMessage(lastUserMessage) : [];
  const entryDestinationText = [
    ...(entryContext.comparisonTargets || []),
    ...(entryContext.requestedDestinations || []),
  ].map((item) => item.name || item.parkName || item.parkCode).filter(Boolean).join(' and ');
  const entryParks = entryDestinationText ? extractAllParksFromMessage(entryDestinationText) : [];
  // Current explicit destination wins. Typed entry destinations only fill an
  // otherwise destination-free turn; saved TripPlan state remains authoritative
  // through the server-owned merge above.
  const initialMessageParks = explicitMessageParks.length ? explicitMessageParks : entryParks;

  const discoveryRefinement = isDiscoveryRefinementReply(filteredMessages);
  const discoverySearchQuery = buildDiscoverySearchQuery(filteredMessages);
  const storedTripContext = metadata.activeTripContext || null;
  const refinementFollowUp = isItineraryRefinementFollowUp(lastUserMessage);
  if (savedTripPlan?.plan?.days?.length) {
    resolvedMetadata.existingCanonicalPlan = savedTripPlan.plan;
  } else if (persistedConversationPlan?.days?.length) {
    // Guest continuation: the session's latest accepted plan IS the active
    // plan. Without this, "make day 2 more relaxed" classifies as a brand-new
    // itinerary request and the whole trip is regenerated — the refinement
    // machinery downstream is generic and engages purely on plan presence.
    resolvedMetadata.existingCanonicalPlan = persistedConversationPlan;
  } else if (metadata.planningState?.draftPlan?.days?.length) {
    // Draft skeletons record intended day count only. They are NOT an accepted
    // itinerary and must not enable day patches or "redo day N" mutations.
    resolvedMetadata.draftPlan = metadata.planningState.draftPlan;
    resolvedMetadata.intendedDayCount = metadata.planningState.draftPlan.days.length;
  } else if (!isAnonymous && httpReq?.user?._id) {
    // Authenticated-unsaved continuation: recall the server-stored active
    // conversational plan — but only when the echoed transcript proves this
    // is the same conversation (a new chat has no assistant history, so
    // nothing lifts). Plan content is always server-authored; a loaded
    // TripPlan above always wins.
    try {
      const { recallConversationPlan } = require('../utils/conversationPlanContinuity');
      const recalled = await recallConversationPlan({
        userId: httpReq.user._id,
        messages: filteredMessages,
      });
      if (recalled) resolvedMetadata.existingCanonicalPlan = recalled;
    } catch (recallErr) {
      console.warn(`${logPrefix} conversation-plan recall failed:`, recallErr.message);
    }
  }
  const itineraryCommitTurn = isItineraryCommitRequest(lastUserMessage);
  const hasLockedOrStoredDestination =
    hasActivePlanDestination({ activeTripContext: storedTripContext }) ||
    !!storedTripContext?.lockedPlanDestination;

  let openEndedDiscovery =
    shouldInjectParkDiscovery(lastUserMessage, {
      namedParkCount: initialMessageParks.length,
    }) || discoveryRefinement;

  // A loaded canonical plan plus a recognized edit request is never discovery.
  // This precedence must not depend on the browser echoing activeTripContext:
  // the saved trip is already the authoritative target of the refinement.
  const activePlan = savedTripPlan?.plan?.days?.length
    ? savedTripPlan.plan
    : (persistedConversationPlan?.days?.length ? persistedConversationPlan : null);
  const constraintRefinement = activePlanConstraintRefinement(lastUserMessage, activePlan);
  if ((refinementFollowUp || constraintRefinement) && activePlan) {
    openEndedDiscovery = false;
  }

  if (
    (refinementFollowUp || itineraryCommitTurn || hasLockedOrStoredDestination) &&
    (storedTripContext?.lockedPlanDestination ||
      storedTripContext?.primaryDestination ||
      storedTripContext?.recommendedOption)
  ) {
    openEndedDiscovery = false;
  }

  const {
    activeTripContext,
    allExtractedParks: contextParks,
    inheritedDestination,
  } = resolveActiveTripContext({
    lastUserMessage,
    conversationUserText,
    filteredMessages,
    storedContext: metadata.activeTripContext || null,
    openEndedDiscovery,
    authoritativeDestination: constraintRefinement ? {
      name: savedTripPlan?.parkName || savedTripPlan?.planningState?.destination?.name || resolvedMetadata.parkName || null,
      parkCode: savedTripPlan?.parkCode || savedTripPlan?.planningState?.destination?.parkCode || resolvedMetadata.parkCode || null,
    } : null,
  });

  let allExtractedParks = contextParks.length > 0 ? contextParks : initialMessageParks;

  if (allExtractedParks.length > 0) {
    resolvedMetadata = applyPrimaryDestinationToMetadata(
      resolvedMetadata,
      activeTripContext.primaryDestination || toPrimaryFromExtracted(allExtractedParks[0])
    );
    resolvedMetadata.parkCode = allExtractedParks[0].parkCode || resolvedMetadata.parkCode;
    resolvedMetadata.parkName = resolvedMetadata.parkName || allExtractedParks[0].parkName;
    resolvedMetadata.lat = resolvedMetadata.lat || allExtractedParks[0].lat;
    resolvedMetadata.lon = resolvedMetadata.lon || allExtractedParks[0].lon;
    console.log(
      `${logPrefix} Parks resolved: ${allExtractedParks.map((p) => `${p.parkName} (${p.parkCode})`).join(', ')}` +
        (inheritedDestination ? ' [inherited]' : '')
    );
  } else if (activeTripContext.primaryDestination) {
    resolvedMetadata = applyPrimaryDestinationToMetadata(
      resolvedMetadata,
      activeTripContext.primaryDestination
    );
    allExtractedParks = [{
      parkCode: activeTripContext.primaryDestination.parkCode,
      parkName: activeTripContext.primaryDestination.name,
      lat: activeTripContext.primaryDestination.lat,
      lon: activeTripContext.primaryDestination.lon,
    }].filter((p) => p.parkCode || p.parkName);
    console.log(
      `${logPrefix} Active destination inherited: ${activeTripContext.primaryDestination.name} (${activeTripContext.resolutionSource})`
    );
  } else if (resolvedMetadata.parkCode && !openEndedDiscovery) {
    allExtractedParks = [{
      parkCode: resolvedMetadata.parkCode,
      parkName: resolvedMetadata.parkName || '',
      lat: resolvedMetadata.lat,
      lon: resolvedMetadata.lon,
    }];
  } else if (openEndedDiscovery && !hasLockedOrStoredDestination && !refinementFollowUp && !constraintRefinement) {
    resolvedMetadata.parkCode = null;
    resolvedMetadata.parkName = null;
    resolvedMetadata.lat = resolvedMetadata.lat || null;
    resolvedMetadata.lon = resolvedMetadata.lon || null;
    console.log(
      `${logPrefix} Open-ended discovery${discoveryRefinement ? ' (refinement follow-up)' : ''} — cleared session park lock`
    );
  }

  resolvedMetadata.activeTripContext = activeTripContext;

  // Store all park names for frontend display (user message — not assistant/footer text)
  const parkNames = allExtractedParks.map(p => p.parkName).filter(Boolean);
  resolvedMetadata.parksForDisplay = allExtractedParks;

  // Pass #5 — durable planningState from saved trip (or client metadata echo).
  // Must load BEFORE place geocoding so active-trip region/coords bias lodging
  // and other place mentions on plain-answer turns (not only itinerary builds).
  // When present, constraint parsing uses last user message only so older
  // transcript cannot resurrect cleared budgets / removed interests.
  let persistedPlanningState = null;
  if (savedTripPlan?.planningState) {
    const {
      normalizePersistedPlanningState,
    } = require('../utils/planningState');
    const n = normalizePersistedPlanningState(savedTripPlan.planningState);
    if (n.ok) persistedPlanningState = n.state;
  }
  if (!persistedPlanningState && resolvedMetadata.planningState) {
    const {
      normalizePersistedPlanningState,
    } = require('../utils/planningState');
    const n = normalizePersistedPlanningState(resolvedMetadata.planningState);
    if (n.ok) persistedPlanningState = n.state;
  }
  if (persistedPlanningState) {
    resolvedMetadata.planningState = persistedPlanningState;
    // Restored sessions may keep parkCode only on planningState while session
    // parkName is a generic label — seed destination identity before geocode.
    if (!resolvedMetadata.parkCode && persistedPlanningState.destination?.parkCode) {
      resolvedMetadata.parkCode = persistedPlanningState.destination.parkCode;
    }
    if (!resolvedMetadata.parkName && persistedPlanningState.destination?.parkName) {
      resolvedMetadata.parkName = persistedPlanningState.destination.parkName;
    }
    if (resolvedMetadata.lat == null || resolvedMetadata.lon == null) {
      const scopeDest = (persistedPlanningState.tripScope?.destinations || [])
        .find((d) => d && (d.latitude != null || d.lat != null));
      if (scopeDest) {
        resolvedMetadata.lat = resolvedMetadata.lat ?? scopeDest.latitude ?? scopeDest.lat ?? null;
        resolvedMetadata.lon = resolvedMetadata.lon ?? scopeDest.longitude ?? scopeDest.lon ?? null;
      }
    }
  }

  const {
    resolvePlaceFromMessage,
    buildActivePlaceResolutionContext,
    buildGeocodeBiasFromTripContext,
  } = require('../services/geocodePlaceService');
  const activePlaceTripContext = buildActivePlaceResolutionContext({
    activeTripContext,
    planningState: persistedPlanningState || resolvedMetadata.planningState || null,
    resolvedMetadata,
    primaryDestination: activeTripContext?.primaryDestination || null,
  });
  const activePlaceBias = buildGeocodeBiasFromTripContext(activePlaceTripContext || {
    activeTripContext,
    planningState: persistedPlanningState,
    resolvedMetadata,
  });
  const lodgingFact = require('../utils/travelerFactTransition').extractLodgingFact(lastUserMessage || '', persistedPlanningState || {});
  const lodgingBaseTurn = Boolean(lodgingFact);

  // Geocode non-NPS destinations before itinerary readiness (Valley of Fire, etc.).
  // Lodging-base mentions inside an active trip must NOT replace the destination.
  if (
    (!resolvedMetadata.lat || !resolvedMetadata.lon)
    && !resolvedMetadata.parkCode
    && !(lodgingBaseTurn && activePlaceTripContext)
  ) {
    try {
      const place = await resolvePlaceFromMessage(lastUserMessage || conversationUserText, {
        tripContext: activePlaceTripContext,
        bias: activePlaceBias,
      });
      if (place?.lat != null && place?.lon != null && place.resolutionStatus !== 'provider_failure'
        && place.resolutionStatus !== 'context_mismatch'
        && place.resolutionStatus !== 'unresolved') {
        resolvedMetadata.lat = place.lat;
        resolvedMetadata.lon = place.lon;
        resolvedMetadata.resolvedPlaceName = place.name;
        if (!resolvedMetadata.parkName) {
          resolvedMetadata.parkName = place.name;
        }
        console.log(
          `${logPrefix} Geocoded place from message: ${place.name} (${place.lat}, ${place.lon}) via ${place.source}`
        );
      }
    } catch (geoErr) {
      console.warn(`${logPrefix} Place geocode error:`, geoErr.message);
    }
  } else if (lodgingBaseTurn && activePlaceTripContext) {
    // Resolve lodging base with active-trip context; keep destination intact.
    try {
      const lodgingPlace = await resolvePlaceFromMessage(`Visit ${lodgingFact.place}`, {
        tripContext: activePlaceTripContext,
        bias: activePlaceBias,
        placeQuery: lodgingFact.place,
      });
      resolvedMetadata.lodgingFactResolution = { baseTown: lodgingFact.place, place: lodgingPlace };
      resolvedMetadata.lodgingPlaceResolution = lodgingPlace?.telemetry || {
        resolutionStatus: lodgingPlace?.resolutionStatus || 'unresolved',
      };
      if (lodgingPlace?.name) {
        console.log(
          `${logPrefix} Lodging place resolution: ${lodgingPlace.name || 'unresolved'} (${lodgingPlace.selectionReason || lodgingPlace.resolutionStatus})`
        );
      }
    } catch (geoErr) {
      console.warn(`${logPrefix} Lodging place geocode error:`, geoErr.message);
    }
  }

  const constraintParseText = persistedPlanningState
    ? (lastUserMessage || '')
    : (conversationUserText || lastUserMessage);

  const constraints = parseConstraints(resolvedMetadata, constraintParseText);
  const operationalDestination =
    resolvedMetadata.parkName || resolvedMetadata.resolvedPlaceName ||
    activeTripContext?.primaryDestination?.name || allExtractedParks[0]?.parkName || '';
  constraints.operational = resolveOperationalConstraints({
    destination: operationalDestination,
    constraints,
    userText: conversationUserText || lastUserMessage,
  });
  const assumeItineraryDefaults =
    skipUserContext ||
    itineraryCommitTurn ||
    hasActivePlanDestination(resolvedMetadata);
  const itineraryReadiness = assessItineraryReadiness({
    constraints,
    metadata: resolvedMetadata,
    allExtractedParks,
    conversationUserText,
    skipUserContext,
    assumeDefaults: assumeItineraryDefaults,
  });

  // Detect state park queries (not NPS — no parkCode will exist)
  const isStateParkQuery = !resolvedMetadata.parkCode && /state\s+park/i.test(lastUserMessage);

  // Extract user city early for coordinate fallback + driving times
  let userCity = extractUserCity(lastUserMessage);
  if (!userCity && discoverySearchQuery) {
    userCity = extractUserCity(discoverySearchQuery);
  }
  if (!userCity && Array.isArray(filteredMessages)) {
    for (let i = filteredMessages.length - 1; i >= 0; i -= 1) {
      const msg = filteredMessages[i];
      if (msg?.role === 'user' && msg.content) {
        userCity = extractUserCity(msg.content);
        if (userCity) break;
      }
    }
  }

  // Travel & Stay v1 — wire departure city/hub airport into planningState so
  // logistics cards can show St. Louis/STL (and refinement MCI) without requiring
  // the golden fixture's injected transportation block.
  if (userCity && constraints?.planningState) {
    const { applyDepartureContextToPlanningState } = require('../utils/planningState');
    constraints.planningState = applyDepartureContextToPlanningState(
      constraints.planningState,
      userCity,
      lastUserMessage || conversationUserText || ''
    );
  }

  // City coordinate fallback for weather when no park coordinates exist
  if (!resolvedMetadata.lat || !resolvedMetadata.lon) {
    if (userCity) {
      resolvedMetadata.lat = resolvedMetadata.lat || userCity.lat;
      resolvedMetadata.lon = resolvedMetadata.lon || userCity.lon;
      if (isStateParkQuery) {
        console.log(`${logPrefix} State park query — using city coords for weather: ${userCity.name} (${userCity.lat}, ${userCity.lon})`);
      }
    }
  }

  if (
    (!resolvedMetadata.lat || !resolvedMetadata.lon)
    && !resolvedMetadata.parkCode
    && !resolvedMetadata.resolvedPlaceName
    && !(lodgingBaseTurn && activePlaceTripContext)
  ) {
    try {
      const place = await resolvePlaceFromMessage(lastUserMessage, {
        tripContext: activePlaceTripContext,
        bias: activePlaceBias,
      });
      if (place?.lat != null && place?.lon != null
        && place.resolutionStatus !== 'provider_failure'
        && place.resolutionStatus !== 'context_mismatch'
        && place.resolutionStatus !== 'unresolved') {
        resolvedMetadata.lat = place.lat;
        resolvedMetadata.lon = place.lon;
        resolvedMetadata.resolvedPlaceName = place.name;
        if (!resolvedMetadata.parkName) {
          resolvedMetadata.parkName = place.name;
        }
        console.log(
          `${logPrefix} Geocoded place from message: ${place.name} (${place.lat}, ${place.lon}) via ${place.source}`
        );
      }
    } catch (geoErr) {
      console.warn(`${logPrefix} Place geocode error:`, geoErr.message);
    }
  }

  // Fetch relevant facts based on user message and resolved metadata
  let weatherFacts = null;
  let npsFacts = null;
  let webSearchFacts = null;
  let astroFacts = null;
  let feeFreeFacts = null;
  let webSearchUnavailable = false;
  let factsMeta = null;
  // Canonical evidence threaded to the shadow reviewer. Defaults are an explicit
  // "bundle failed to thread" so a null never silently becomes an empty bundle.
  let canonicalFactBundle = null;
  let canonicalFactStatus = null;
  // Stage 10 (F-DATA-2) — explicit weather coverage across the itinerary's parks.
  let weatherCoverage = null;

  // WP12 Phase 4 — product-chat prep is permanently the shared v2 path.
  // Legacy facts/fetch, giant prompts, and buildTrailieContext are deleted.
  const noParkDetected = !resolvedMetadata.parkCode;
  const augmentedMessages = filteredMessages;
  const lastMsg = lastUserMessage;
  const preflightResult = preflightCheck(constraints, resolvedMetadata.parkCode);
  const hypothetical = detectHypothetical(lastMsg);
  const conflicts = detectConflicts(constraints, lastMsg, { skipUserContext });
  const intent = detectIntent(lastMsg, constraints);
  const userRequestedItinerary =
    (
      (refinementFollowUp && Boolean(savedTripPlan?.plan?.days?.length)) ||
      shouldRequestItineraryJson({
        userMessage: lastUserMessage,
        openEndedDiscovery,
        metadata: resolvedMetadata,
        constraints,
        allExtractedParks,
        conversationUserText,
      })
    )
    // Material sufficiency: never force a structured itinerary when readiness
    // says clarification is still required (HTTP path must match offline gate).
    && !(itineraryReadiness?.clarificationNeeded === true && itineraryReadiness?.ready === false);
  const alreadyShownImages = messages.some((m) =>
    m.role === 'assistant' && m.content?.includes('(Photos shown to user:')
  );
  const attachParkImages = false;
  const parkImages = [];
  const candidateParksBlock = false;
  const fetchPlan = null;
  const trailieContext = null;
  const enhancedSystemPrompt = '';
  console.log(`${logPrefix}[Trailie] prepared canonical context`);
  return {
    provider,
    responseMode,
    model,
    temperature,
    top_p,
    maxTokens,
    enhancedSystemPrompt,
    augmentedMessages,
    metadata,
    npsFacts,
    weatherFacts,
    webSearchFacts,
    astroFacts,
    feeFreeFacts,
    webSearchUnavailable,
    canonicalFactBundle,
    canonicalFactStatus,
    weatherCoverage,
    userCity,
    candidateParksBlock,
    resolvedMetadata,
    parkNames,
    allExtractedParks,
    noParkDetected,
    constraints,
    planningState: constraints?.planningState || persistedPlanningState || null,
    preflightResult,
    hypothetical,
    conflicts,
    intent,
    evidencePlannerShadowInput: null,
    promptV2ShadowInput: null,
    parkImages,
    alreadyShownImages,
    attachParkImages,
    openEndedDiscovery,
    discoveryRefinement,
    lastMsg,
    trailieContext,
    userRequestedItinerary,
    itineraryReadiness,
    activeTripContext,
    savedTripPlan,
    storedTripContext,
    entryContext,
    fetchPlan,
    skipUserContext,
    // WP-TU Phase 4 Task 10 — the trip currently loaded/active for this turn
    // (mirrors `tripId` above), and the traveler's other saved plans as
    // bounded candidate metadata. Neither is a target decision — see
    // candidatePlanDiscovery.js and targetTripResolver.js.
    activeTripId: tripId || null,
    candidatePlans,
    // WP-TU Phase 4 Task 10B — the owner these candidates/this trip were
    // scoped under, so a later single-document hydration fetch (a DIFFERENT
    // trip than `tripId`, resolved by Task 9's targetTripResolver) can apply
    // the SAME ownership check `fetchCandidatePlans` already applies to its
    // list query. Null for guests (candidatePlans is always [] for them too).
    userId: (!isAnonymous && httpReq?.user?._id) ? String(httpReq.user._id) : null,
  };
}

function appendUserContextToPrompt(enhancedSystemPrompt, userContext, personalizedRecommendations = false) {
  if (!userContext) {
    return personalizedRecommendations
      ? enhancedSystemPrompt + PERSONALIZATION_MODE_RULES
      : enhancedSystemPrompt;
  }
  let prompt = enhancedSystemPrompt + userContext;
  if (personalizedRecommendations) {
    prompt += PERSONALIZATION_MODE_RULES;
  } else {
    prompt += `\n\nGENERAL CHAT MODE (NOT "My Recommendations"):
- Answer the user's actual question first
- Do NOT open with "Hey {name}" or profile callouts on generic discovery questions
- Do NOT inventory their past parks, quote trip counts, or open with "two questions before I suggest anything"
- Do NOT say "your profile says", "since you love", or "you've already been to" unless they asked for personalized picks
- Only reference favorites or visit history when directly relevant to what they asked`;
  }
  return prompt;
}
// Uses explicit Known/Unknown framing to prevent the model from
// hallucinating ungrounded user attributes (e.g., "solo traveler").
async function buildUserContext(user) {
  if (!user || !user.id) return '';

  try {
    const firstName = user.firstName || (user.name ? user.name.split(' ')[0] : null);
    if (!firstName) return '';

    const [favorites, visitedParks] = await Promise.all([
      Favorite.find({ user: user.id }).sort({ createdAt: -1 }).limit(10).select('parkName visitStatus rating').lean(),
      VisitedPark.find({ user: user.id }).sort({ visitDate: -1 }).limit(10).select('parkName visitDate rating').lean()
    ]);

    const parts = [`\n\n--- USER CONTEXT ---`];
    parts.push(`Known facts about this user (from their profile and confirmed history):`);
    parts.push(`- Name: ${firstName}`);

    if (favorites.length > 0) {
      const favNames = favorites.map(f => f.parkName);
      parts.push(`- Favorite parks: ${favNames.join(', ')}`);
    }

    if (visitedParks.length > 0) {
      const visitedEntries = visitedParks.map(v => {
        if (v.visitDate) {
          const date = new Date(v.visitDate);
          const month = date.toLocaleString('en-US', { month: 'short' });
          const year = date.getFullYear();
          return `${v.parkName} (${month} ${year})`;
        }
        return v.parkName;
      });
      parts.push(`- Visited parks: ${visitedEntries.join(', ')}`);
    }

    parts.push(``);
    parts.push(`Unknown (DO NOT ASSUME OR INFER):`);
    parts.push(`- Group size and composition (solo, couple, family, group)`);
    parts.push(`- Travel style or pace preference`);
    parts.push(`- Budget`);
    parts.push(`- Fitness level`);
    parts.push(`- Home location`);
    parts.push(``);
    parts.push(`If your recommendation depends on an unknown attribute, ask one clarifying question instead of assuming.`);
    parts.push(`NEVER say "your profile says...", "based on your travel style...", "since you love...", or "as a solo traveler..." for any unknown attribute.`);
    parts.push(`Only reference Known facts listed above when directly relevant — not on every reply.`);
    parts.push(`Do NOT open with a first-name greeting on generic discovery or factual questions.`);
    parts.push(`--- END USER CONTEXT ---`);

    return parts.join('\n');
  } catch (err) {
    console.error('[AI] Error building user context:', err.message);
    return '';
  }
}

// Helper: fuzzy-match an alert line against the AI response
function alertMentioned(alertText, responseLower) {
  const keywords = alertText.toLowerCase().split(/\s+/).filter(w => w.length >= 3 && !['the', 'and', 'for', 'are', 'has', 'been', 'this', 'that', 'with', 'from', 'may', 'can', 'will', 'not'].includes(w));
  const matchThreshold = Math.min(2, keywords.length);
  const matchCount = keywords.filter(kw => responseLower.includes(kw)).length;
  if (matchCount >= matchThreshold) return true;

  const alertLower = alertText.toLowerCase();
  if (/fire restriction|stage\s*\d/i.test(alertLower)) {
    if (/\bfire\b/.test(responseLower) && /\brestrict/.test(responseLower)) return true;
    if (/stage\s*[12]/.test(responseLower)) return true;
  }
  if (/cyanobacteria|toxic/i.test(alertLower)) {
    if (/cyanobacteria|toxic|narrows.*(closed|off|skip)/i.test(responseLower)) return true;
  }
  return false;
}

function isCompareOrChooseQuery(userMessage = '') {
  if (!userMessage) return false;
  return (
    /\b(compare|vs\.?|versus|choose between|which should|which is better|pick between|better for)\b/i.test(userMessage) ||
    /\b\w[\w\s]{0,40}\s+vs\.?\s+\w/i.test(userMessage)
  );
}

function isPermitPlanningQuery(userMessage = '') {
  if (!userMessage) return false;
  return /\b(permit|reservation|timed entry|lottery|recreation\.gov|angels landing|north cascades|wilderness permit)\b/i.test(userMessage);
}

/** User asked about one trail/activity permit — don't footnote unrelated park permits. */
function getUserPermitFocusTerms(userMessage = '') {
  if (!userMessage) return [];
  const lower = userMessage.toLowerCase();
  const terms = [];
  if (/\bnarrows\b/.test(lower)) {
    terms.push('narrows');
    if (/top[- ]?down/.test(lower)) terms.push('north creek', 'chamberlain', 'through');
  }
  if (/angels landing/.test(lower)) terms.push('angels landing');
  if (/\bsubway\b/.test(lower) && /zion|north creek/i.test(lower)) terms.push('subway', 'left fork');
  if (/mystery canyon/.test(lower)) terms.push('mystery canyon');
  if (/half dome/.test(lower)) terms.push('half dome');
  if (/wilderness permit|backcountry permit/.test(lower)) terms.push('wilderness', 'backcountry');
  return [...new Set(terms)];
}

function permitLineMatchesUserFocus(line, focusTerms) {
  if (!focusTerms.length) return true;
  const lower = String(line).toLowerCase();
  return focusTerms.some((t) => lower.includes(t));
}

function isSpecificPermitOnlyQuery(userMessage = '') {
  if (!isPermitPlanningQuery(userMessage)) return false;
  return (
    getUserPermitFocusTerms(userMessage).length > 0 &&
    !isTrailStatusQuery(userMessage) &&
    !isCompareOrChooseQuery(userMessage)
  );
}

/** Day-by-day trip plans — skip Recreation.gov permit inventory footers unless user asked about permits. */
function isItineraryPlanningQuery(userMessage = '') {
  if (!userMessage || isPermitPlanningQuery(userMessage)) return false;
  return hasItineraryIntentFromPlanner(userMessage);
}

/** Permits that should not appear in generic trip-plan footers (niche programs, not park entry). */
function isObscurePermitForFooter(nameOrLine = '') {
  const s = String(nameOrLine).toLowerCase();
  return (
    /snowmobile|guided.*access program|corridor vehicle|slough creek|day-use ticket/i.test(s) ||
    (/timed entry/i.test(s) && /corridor|junction|tower/i.test(s))
  );
}

function sanitizePermitLineForFooter(line) {
  return String(line)
    .replace(/\s*\[STATUS UNKNOWN[^\]]*\]/gi, '')
    .replace(/\s*\[(?:Permit|Timed Entry)[^\]]*\]/gi, '')
    .trim();
}

/** Open/closed status for a named trail — don't footnote unrelated lottery permits. */
function isTrailStatusQuery(userMessage = '') {
  if (!userMessage) return false;
  return (
    /\b(is|are|was|still)\b.*\b(open|closed|accessible)\b/i.test(userMessage) ||
    /\b(open|closed|status)\b.*\b(trail|narrows|angel|hike|route)\b/i.test(userMessage) ||
    /\b(narrows|angels landing|subway|mystery canyon)\b.*\b(open|closed)\b/i.test(userMessage)
  );
}

/** Parking, shuttles, drive time, entrances — not permit-planning questions. */
function isLogisticsOrAccessQuery(userMessage = '') {
  if (!userMessage) return false;
  const logistics = /\b(parking|park at|shuttle|drive|driving|how long|hours? to|mileage|entrance station|visitor center hours|gateway town|from\s+\w+\s+to)\b/i.test(
    userMessage
  );
  const trailOrPermit = /\b(hike|hiking|trail|permit|lottery|backcountry trek|angels landing)\b/i.test(userMessage);
  return logistics && !trailOrPermit;
}

/** Campground / where to camp — skip unrelated lottery permit footnotes. */
function isCampingStayQuery(userMessage = '') {
  if (!userMessage) return false;
  return (
    /\b(campgrounds?|camping|rv sites?|where to camp|front-country)\b/i.test(userMessage) &&
    !isPermitPlanningQuery(userMessage)
  );
}

/** Weather, smoke, wildfire, air quality — user asked for conditions, not permit inventory. */
function isConditionsQuery(userMessage = '') {
  if (!userMessage) return false;
  return /\b(weather|forecast|alert|closure|wildfire|smoke|air quality|aqi|fire season|current conditions)\b/i.test(
    userMessage
  );
}

/** Ranger programs / events — skip wildlife-only caution footnotes unless trails asked. */
function isEventsQuery(userMessage = '') {
  if (!userMessage) return false;
  const events = /\b(event|ranger[- ]?led|guided walk|programs? happening|things to do.*program)\b/i.test(userMessage);
  const trails = /\b(hike|hiking|trail|backcountry|wildlife safety|bear|bison)\b/i.test(userMessage);
  return events && !trails;
}

/** Wildlife viewing / safety distance — not a permit lottery question. */
function isWildlifeSafetyQuery(userMessage = '') {
  if (!userMessage) return false;
  return (
    /\b(wildlife|bison|elk|bear|moose|safe distance|how close|animal)\b/i.test(userMessage) &&
    !isPermitPlanningQuery(userMessage)
  );
}

function normalizeAlertLine(text) {
  return String(text).toLowerCase().replace(/\s+/g, ' ').trim();
}

function dedupeAlertLines(items) {
  const seen = new Set();
  const out = [];
  for (const item of items) {
    const key = normalizeAlertLine(item);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

function responseAlreadyCoversSafety(responseLower, userMessage = '') {
  const signals = [
    /\bheads-up\b/,
    /\bwarning\b/,
    /\bcyanobacteria\b/,
    /\bnarrows\b/,
    /\bfire restriction|\bstage\s*[12]\b|\bfire restrictions\b/,
    /\bclosed\b/,
    /\bparking\b/,
    /\barrive before\b/,
    /\bshuttle\b/,
    /\brestrict/i,
    /\balert/i,
    /\bpermit/i,
    /\bcaution/i,
    /\boff the table\b/,
    /\blogistic/i,
  ];
  let hits = 0;
  for (const re of signals) {
    if (re.test(responseLower)) hits += 1;
  }
  if (hits >= 2) return true;
  if (isCompareOrChooseQuery(userMessage) && hits >= 1) return true;
  return false;
}

function extractAllNPSSectionItems(npsFacts, sectionHeader) {
  if (!npsFacts) return [];
  const parts = npsFacts.split(sectionHeader);
  if (parts.length < 2) return [];
  const items = [];
  for (let i = 1; i < parts.length; i += 1) {
    const block = parts[i].split('\n\n')[0] || '';
    block
      .split('\n')
      .map((l) => l.replace(/^- /, '').trim())
      .filter(Boolean)
      .forEach((line) => items.push(line));
  }
  return items;
}

// Helper: extract lines from a labeled NPS section
function extractNPSSection(npsFacts, sectionPattern) {
  const match = npsFacts.match(sectionPattern);
  if (!match) return [];
  return match[1].split('\n').map(l => l.replace(/^- /, '').trim()).filter(Boolean);
}

/** Lodging/dining questions — skip wildlife-only safety footnotes unless the user asked about trails/wildlife. */
function isLodgingDiningQuery(userMessage = '') {
  if (!userMessage) return false;
  const lodgingDining = /(restaurant|food|eat|dining|hotel|lodge|lodging|stay|accommodation|where to sleep|gateway|meal|breakfast|dinner|lunch|bar|pub|glamp|where to eat|places to eat|places to stay|cafeteria)/i.test(userMessage);
  const safetyOrTrails = /(hike|hiking|trail|wildlife|bear|elk|moose|bison|backcountry|camping|campground|safe distance|dangerous)/i.test(userMessage);
  return lodgingDining && !safetyOrTrails;
}

const WEB_SEARCH_UPSELL_MARKER = 'Want live prices and ratings?';

function buildWebSearchUpsellSuffix(variant = 'local') {
  const detailByVariant = {
    local: 'Sign up free to unlock live web search for hotels, restaurants, and current road conditions.',
    road: 'Sign up free to unlock live road conditions, closures, and travel alerts.',
    trail: 'Sign up free to unlock live trail condition reports and recent hiker trip reports.',
    conditions: 'Sign up free to unlock live wildfire, smoke, and air quality updates for your route.',
  };
  const detail = detailByVariant[variant] || detailByVariant.local;
  return `\n\n---\n\n🔍 **${WEB_SEARCH_UPSELL_MARKER}** ${detail}`;
}

/** Remove in-body disclaimers when we append the web-search signup footer (anonymous). */
function stripRedundantLiveDataDisclaimers(content) {
  if (!content) return content;
  return content
    .replace(/\n*One heads-up:\s*I don't have live[^.\n]*\.[^\n]*/gi, '')
    .replace(/\n*I don't have live (restaurant|hotel|lodging|dining|hour)[^.\n]*\.[^\n]*/gi, '')
    .replace(/\n*verify (hours|open hours) at nps\.gov or Google before you go[^\n]*/gi, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// Helper: post-response validation — checks if AI addressed critical NPS constraints
function validateCriticalAlerts(responseContent, npsFacts, userMessage = '', parksForLinks = []) {
  if (!npsFacts || !responseContent) return null;

  const responseLower = responseContent.toLowerCase();
  const warnings = [];
  const lodgingDiningOnly = isLodgingDiningQuery(userMessage);
  const skipCautionFooter =
    lodgingDiningOnly || isEventsQuery(userMessage) || isLogisticsOrAccessQuery(userMessage);
  const skipClosureFooter = skipCautionFooter;

  const safetyAlreadyCovered = responseAlreadyCoversSafety(responseLower, userMessage);
  const compareQuery = isCompareOrChooseQuery(userMessage);
  const skipPermitFooter =
    !isPermitPlanningQuery(userMessage) &&
    (compareQuery ||
      isItineraryPlanningQuery(userMessage) ||
      isTrailStatusQuery(userMessage) ||
      isLogisticsOrAccessQuery(userMessage) ||
      isCampingStayQuery(userMessage) ||
      isConditionsQuery(userMessage) ||
      isWildlifeSafetyQuery(userMessage) ||
      isEventsQuery(userMessage));

  // 1. Active closures — skip for lodging/logistics/events; drop generic NPS section titles
  if (!skipClosureFooter) {
    const closures = dedupeAlertLines(extractAllNPSSectionItems(npsFacts, '⚠️ ACTIVE CLOSURES:'))
      .filter((c) => !isGenericClosureAlert(c));
    const missedClosures = closures.filter((c) => !alertMentioned(c, responseLower));
    if (missedClosures.length > 0) {
      warnings.push({ label: 'Active closures', items: missedClosures });
    }
  }

  // 2. Cautions — skip if reply already gave multiple safety callouts (avoid redundant footer)
  if (!skipCautionFooter && !safetyAlreadyCovered) {
    const cautions = dedupeAlertLines(extractAllNPSSectionItems(npsFacts, 'Cautions:'));
    const missedCautions = cautions.filter(c => !alertMentioned(c, responseLower));
    if (missedCautions.length > 0) {
      warnings.push({ label: 'Safety cautions', items: missedCautions });
    }
  }

  // 3. Permits & reservations — skip on compare/choose unless user asked about permits
  const permitMatch =
    !lodgingDiningOnly && !skipPermitFooter && npsFacts.match(/Permits & Reservations[^:]*:\n([\s\S]*?)(?:\n\n|$)/);
  if (permitMatch) {
    const permitLines = permitMatch[1]
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.startsWith('-'))
      .map((l) => l.replace(/^- /, '').trim())
      .filter(Boolean);
    // Extract permit names (text before the type bracket or URL)
    const permits = permitLines.map(line => {
      const nameMatch = line.match(/^([^[\]:]+?)(?:\s*\[|\s*:)/);
      return nameMatch ? nameMatch[1].trim() : line.split(':')[0].trim();
    }).filter(Boolean);

    let missedPermits = permits.filter(name => !alertMentioned(name, responseLower));
    if (/no\s+(vehicle\s+)?entrance\s+reservation|reservations?\s+not\s+required|no\s+timed[- ]?entry/i.test(responseLower)) {
      missedPermits = missedPermits.filter((name) => !/timed entry|day-use/i.test(name));
    }
    missedPermits = missedPermits.filter((name) => !isObscurePermitForFooter(name));

    const permitFocus = getUserPermitFocusTerms(userMessage);
    if (permitFocus.length > 0) {
      missedPermits = missedPermits.filter((name) => permitLineMatchesUserFocus(name, permitFocus));
    }

    if (missedPermits.length > 0) {
      const seenPermitKeys = new Set();
      const missedWithContext = missedPermits
        .map((name) => {
          const original = permitLines.find((l) => l.toLowerCase().includes(name.toLowerCase()));
          return sanitizePermitLineForFooter(original || name);
        })
        .filter((line) => {
          const key = line.toLowerCase().replace(/\s+/g, ' ').trim();
          if (seenPermitKeys.has(key)) return false;
          seenPermitKeys.add(key);
          return true;
        });
      if (missedWithContext.length > 0) {
        warnings.push({ label: 'Permits/reservations to double-check', items: missedWithContext });
      }
    } else if (permits.length > 0) {
      // Permits were mentioned, but check for vague/generic references
      const hasSpecificPermit = permits.some(name => {
        const nameWords = name.toLowerCase().split(/\s+/).filter(w => w.length >= 3);
        return nameWords.some(w => responseLower.includes(w));
      });
      const onlyGeneric = !hasSpecificPermit && /permit|reservation/i.test(responseContent);
      if (onlyGeneric) {
        warnings.push({ label: 'Permits mentioned generically (specify which permits)', items: permitLines.slice(0, 3) });
      }
    }
  }

  if (warnings.length === 0) return null;

  // Build warning block
  let result = '\n\n---\n📍 **Important — the following were not addressed above:**';
  for (const w of warnings) {
    result += `\n**${w.label}:**`;
    result += w.items.map(item => `\n- ${item}`).join('');
  }
  result += formatTrailverseVerifyFooter(parksForLinks);
  return result;
}

/**
 * Shared post-AI pipeline: conflict retry, itinerary extract/correct, alerts, optional anon web upsell.
 */
async function processAssistantResponse({
  response,
  lastMsg,
  npsFacts,
  weatherFacts,
  webSearchFacts,
  astroFacts,
  feeFreeFacts,
  noParkDetected,
  constraints,
  conflicts,
  hypothetical,
  provider,
  model,
  maxTokens,
  temperature,
  top_p,
  enhancedSystemPrompt,
  augmentedMessages,
  req,
  parksForLinks = [],
  trailieContext = null,
  responseMode = 'buddy',
  options = {},
}) {
  const {
    enableConflictRetry = true,
    enableRegeneration = true,
    enableItineraryFallbackExtraction = true,
    appendAnonymousWebUpsell = false,
    isTrustedMcp = false,
    userRequestedItinerary = false,
    logPrefix = '[AI]',
  } = options;

  let correctionsApplied = [];
  let contentChangedByValidation = false;
  let reviewMeta = {
    reviewerRan: false,
    reviewerModel: null,
    reviewerPassed: true,
    reviewerSeverity: 'none',
    reviewerIssueTypes: [],
    repaired: false,
  };

  // Stage 11 — tool-first fast path. The itinerary was already generated,
  // finalized, and FROZEN in Phase A; `response.content` is Phase B prose about
  // that exact plan. We do NOT re-extract, re-correct, re-enrich, or run inline
  // JSON extraction — we only strip stray artifacts and attach the frozen plan.
  if (options.preFinalized) {
    const pf = options.preFinalized;
    // Stage 12 — defense in depth: alignment markers must never reach canonical
    // content/hash (the seam already strips them from the selected prose).
    let finalContent = stripAlignmentMarkers(unwrapMislinkedParkMarkdown(response.content || ''));
    const rej = getFinalResponseRejectionReason(finalContent, finalContent);
    if (rej) console.warn(`${logPrefix} Final-response guard flagged (tool-first): ${rej}`);

    reviewMeta = {
      reviewerMode: 'shadow',
      reviewExecution: 'async',
      repaired: false,
      patchesApplied: 0,
    };

    if (pf.correctionsApplied?.length > 0) {
      finalContent += formatCorrectionNotice(pf.correctionsApplied);
    }
    // Final safety pass — never leak raw itinerary JSON markers.
    response.content = stripItineraryArtifacts(finalContent).content;

    return {
      cleanContent: response.content,
      itineraryData: pf.itineraryData || null, // FROZEN — never mutated here
      confidence: pf.confidence || { level: 'high', score: 1.0 },
      planScore: pf.planScore || null,
      constraintIssues: [],
      feasibilityIssues: pf.feasibilityIssues || [],
      correctionsApplied: pf.correctionsApplied || [],
      contentChangedByValidation: !!pf.contentChangedByValidation,
      reviewMeta,
    };
  }

  const hasConflicts = conflicts?.length > 0;

  if (enableConflictRetry && hasConflicts && !req._hasConflictRetried) {
    const hasOptions =
      /\*\*\s*option\s*[ab12]/i.test(response.content) ||
      /\boption\s*[ab12]\s*[:\-—]/i.test(response.content);
    if (!hasOptions) {
      req._hasConflictRetried = true;
      console.log(`${logPrefix} Conflict compliance failed — regenerating with option A/B requirement.`);
      const conflictRetryPrompt =
        enhancedSystemPrompt +
        `\n\n--- CONFLICT COMPLIANCE FAILURE ---\nYour previous response MERGED contradictory constraints into a single plan. This is WRONG.\nYou MUST present EXACTLY TWO clearly labeled options: **Option A** and **Option B**.\nDo NOT blend them. Present them as separate, complete plans.\n--- END FAILURE NOTICE ---`;

      try {
        let retryContent;
        if (provider === 'claude' && anthropic) {
          const retryResult = await anthropic.messages.create({
            model, // Stage 14.7I §2 — pre-resolved by prepareChatContext
            max_tokens: maxTokens,
            system: conflictRetryPrompt,
            messages: augmentedMessages,
          });
          retryContent = retryResult.content[0].text;
        } else if (provider === 'openai' && openai) {
          const openaiMsgs = augmentedMessages.map((m) => ({ role: m.role, content: m.content }));
          const retryResult = await openai.chat.completions.create({
            model: model || OPENAI_PRIMARY_MODEL,
            messages: [{ role: 'system', content: conflictRetryPrompt }, ...openaiMsgs],
            max_completion_tokens: maxTokens,
            temperature,
          });
          retryContent = retryResult.choices[0].message.content;
        }
        if (retryContent && /\*\*\s*option\s*[ab12]/i.test(retryContent)) {
          response.content = retryContent;
          console.log(`${logPrefix} Conflict retry succeeded — options presented`);
        }
      } catch (retryErr) {
        console.error(`${logPrefix} Conflict retry failed:`, retryErr.message);
      }
    }
  }

  // Stage 11 — in tool_first mode, a structured-generation FAILURE falls back to
  // prose-only. We must NOT recover an itinerary by inline-parsing that prose.
  const disableInlineItineraryExtraction = options.disableInlineItineraryExtraction === true;

  let { cleanContent, itineraryData } = disableInlineItineraryExtraction
    ? { cleanContent: stripItineraryArtifacts(response.content || '').content, itineraryData: null }
    : extractItineraryFromResponse({
        content: response.content,
        toolItinerary: response.toolItinerary || null,
      });

  if (itineraryData && response.toolItinerary) {
    console.log(`${logPrefix} Itinerary extracted via create_itinerary tool`);
  }

  if (itineraryData && !userRequestedItinerary) {
    console.log(`${logPrefix} Itinerary JSON discarded — user did not request a day-by-day plan`);
    itineraryData = null;
  }

  cleanContent = unwrapMislinkedParkMarkdown(cleanContent);

  const isDiscoveryResponse = enhancedSystemPrompt.includes('TRAILVERSE PARK CANDIDATES');
  if (isDiscoveryResponse) {
    cleanContent = stripSkipOnlyParkSentences(cleanContent);
  }

  if (
    userRequestedItinerary &&
    enableItineraryFallbackExtraction &&
    !disableInlineItineraryExtraction &&
    !itineraryData &&
    /\b(plan|itinerary|trip)\b/i.test(lastMsg) &&
    /day\s*[1-9]|day\s*one|day\s*two|morning.*afternoon|## .*day\b/i.test(cleanContent)
  ) {
    try {
      console.log(`${logPrefix} Planning response missing JSON block — running fallback extraction`);
      // Stage 10 (F-ACC-2) — the extractor must NOT invent coordinates. It
      // omits lat/lon entirely; any coordinate it emits anyway is treated as an
      // untrusted model estimate and discarded by normalizeCoordinates below.
      const extractionPrompt = `Extract the structured itinerary from this trip plan text. Return ONLY a valid JSON object (no markdown, no explanation) in this format:
{"days":[{"id":"day-1","dayNumber":1,"label":"Day 1 — label","stops":[{"id":"s1-1","order":0,"type":"trail|landmark|campground|visitor_center|restaurant|lodging|custom","name":"Stop Name","note":"brief note","startTime":"08:00","duration":60,"difficulty":"easy|moderate|strenuous","why":"why this stop fits","drivingTimeFromPreviousMin":0}]}]}

Do NOT include latitude or longitude — omit those fields entirely. Never guess or estimate coordinates. Include duration in minutes and difficulty for trails. Here is the plan text:

${cleanContent.substring(0, 6000)}`;

      const claudeService = require('../services/claudeService');
      const extractedJSON = await claudeService.chat(
        [{ role: 'user', content: extractionPrompt }],
        'You are a JSON extraction tool. Return only valid JSON, no markdown or explanation. Never fabricate coordinates.',
        { model: CLAUDE_EXTRACTOR_MODEL, temperature: 0.1 }
      );
      const jsonMatch = extractedJSON.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        if (parsed.days && Array.isArray(parsed.days) && parsed.days.length > 0) {
          // Any coordinate the extractor emitted is a model estimate — strip it.
          itineraryData = stripUntrustedExtractedCoordinates(parsed);
          console.log(
            `${logPrefix} Fallback extraction successful: ${parsed.days.length} days`
          );
        }
      }
    } catch (extractErr) {
      console.log(`${logPrefix} Fallback extraction failed:`, extractErr.message);
    }
  }

  if (noParkDetected && itineraryData) {
    const allowNonNpsItinerary = webSearchFacts || isTravelRelated(lastMsg);
    if (!allowNonNpsItinerary) {
      console.log(`${logPrefix} Itinerary stripped — no park or travel destination detected`);
      itineraryData = null;
    }
  }

  const isConflictResponse = hasConflicts && /\*\*\s*option\s*[ab12]/i.test(cleanContent);
  let constraintIssues =
    itineraryData && !isConflictResponse
      ? validateItineraryConstraints(itineraryData, constraints)
      : [];
  let feasibilityIssues = itineraryData ? validateItineraryFeasibility(itineraryData) : [];

  let correctionSummary = '';
  let confidence = { level: 'high', score: 1.0 };
  let needsRegeneration = false;
  let allGaps = [];

  if (itineraryData && constraintIssues.length > 0) {
    let currentItinerary = itineraryData;
    let allCorrections = [];
    let totalRemoved = 0;
    const originalCount = itineraryData.days.reduce(
      (sum, d) => sum + (d.stops?.length || 0),
      0
    );

    for (let pass = 1; pass <= 2; pass++) {
      const issues =
        pass === 1 ? constraintIssues : validateItineraryConstraints(currentItinerary, constraints);
      if (issues.length === 0) break;

      const result = correctItinerary(currentItinerary, constraints, issues, npsFacts, {
        isHypothetical: hypothetical?.isHypothetical || false,
        pass,
      });

      currentItinerary = result.correctedItinerary;
      allCorrections.push(...result.corrections);
      totalRemoved += result.removedCount;
      if (result.gaps) allGaps.push(...result.gaps);

      if (result.tooAggressive && pass === 1) {
        needsRegeneration = true;
        break;
      }
    }

    itineraryData = currentItinerary;
    confidence = computeConfidence(allCorrections, totalRemoved, originalCount);
    correctionsApplied = allCorrections;
    contentChangedByValidation = allCorrections.length > 0 || needsRegeneration;

    if (allCorrections.length > 0) {
      correctionSummary = `\n\n---\n📍 **Adjusted to fit your constraints:**\n${allCorrections.map((c) => `- ${c}`).join('\n')}`;
      console.log(`${logPrefix} Corrections applied:`, allCorrections);
    }
    // Stage 10 (F-QUAL-1) — feasibility warnings are NOT duplicated into prose
    // here. They are re-computed on the FINAL corrected itinerary below and
    // surfaced once, as structured `feasibilityIssues`, in the done payload.
  }

  if (enableRegeneration && needsRegeneration && !req._hasRegenerated) {
    req._hasRegenerated = true;
    const constraintFailures = constraintIssues.map((i) => i.details).join('; ');
    let regenPrompt =
      enhancedSystemPrompt +
      `\n\n--- REGENERATION NOTICE ---\nYour previous plan violated these constraints: ${constraintFailures}\nThis is your SECOND attempt. Follow the USER CONSTRAINTS block EXACTLY.\n`;
    if (allGaps.length > 0) {
      regenPrompt += `\nSPECIFIC REPLACEMENTS NEEDED:\n`;
      for (const gap of allGaps) {
        regenPrompt += `- Day ${gap.dayIndex + 1}: "${gap.removedName}" removed (${gap.reason}). Replace with a constraint-compliant activity${gap.nearLat ? ` near [${gap.nearLat}, ${gap.nearLon}]` : ''}.\n`;
      }
    }
    regenPrompt += `--- END NOTICE ---`;

    try {
      console.log(`${logPrefix} Regenerating — correction was too aggressive`);
      let regenResponse;
      if (provider === 'claude' && anthropic) {
        const regenResult = await anthropic.messages.create({
          model, // Stage 14.7I §2 — pre-resolved by prepareChatContext
          max_tokens: maxTokens,
          temperature,
          system: regenPrompt,
          messages: augmentedMessages,
        });
        regenResponse = regenResult.content[0].text;
      } else if (provider === 'openai' && openai) {
        const openaiMessages = augmentedMessages.map((m) => ({ role: m.role, content: m.content }));
        const regenResult = await openai.chat.completions.create({
          model: model || OPENAI_PRIMARY_MODEL,
          messages: [{ role: 'system', content: regenPrompt }, ...openaiMessages],
          max_completion_tokens: maxTokens,
          temperature,
        });
        regenResponse = regenResult.choices[0].message.content;
      }

      if (regenResponse) {
        const regen = extractItineraryFromResponse({ content: regenResponse });
        if (regen.itineraryData) {
          const regenIssues = validateItineraryConstraints(regen.itineraryData, constraints);
          if (regenIssues.length < constraintIssues.length) {
            cleanContent = regen.cleanContent;
            itineraryData = regen.itineraryData;
            correctionSummary = '';
            correctionsApplied = [];
            contentChangedByValidation = true;
            confidence = { level: 'medium', score: 0.7 };
            constraintIssues = regenIssues;
            feasibilityIssues = validateItineraryFeasibility(itineraryData);
            console.log(`${logPrefix} Regeneration succeeded — cleaner plan`);
          }
        }
      }
    } catch (regenErr) {
      console.error(`${logPrefix} Regeneration failed:`, regenErr.message);
    }
  }

  if (itineraryData) {
    const maxDrivingEnrichMs = options.maxDrivingEnrichMs;
    if (maxDrivingEnrichMs && maxDrivingEnrichMs > 0) {
      itineraryData = await Promise.race([
        enrichItineraryDrivingTimes(itineraryData, logPrefix),
        new Promise((resolve) => setTimeout(() => resolve(itineraryData), maxDrivingEnrichMs)),
      ]);
    } else {
      itineraryData = await enrichItineraryDrivingTimes(itineraryData, logPrefix);
    }
    feasibilityIssues = validateItineraryFeasibility(itineraryData);
  }

  const planScore = itineraryData ? scoreItinerary(itineraryData, constraints) : null;

  // Deterministic park identity for section scope — metadata only, never rendering.
  if (itineraryData) {
    const enriched = enrichItineraryParkIdentity({
      itineraryData,
      resolvedMetadata: options.resolvedMetadata || {},
      allExtractedParks: parksForLinks,
    });
    itineraryData = enriched.itineraryData;
  }

  // Stage 9 — reviewer/model execution is OFF the critical path. The itinerary
  // is immutable from here on: it has already been constraint-corrected,
  // enriched, validated, and scored. We keep ONLY deterministic protections in
  // the request path; the model-based shadow review runs later in a durable
  // worker (scheduled by scheduleShadowReview after the canonical envelope
  // exists) and can never alter this response, itinerary, or hashes.
  let finalContent = cleanContent;
  const frozenItinerary = itineraryData;

  // Deterministic final-response guard — never calls a model. Rejects an empty
  // answer or a leaked hand-off placeholder. On rejection we keep the original
  // cleaned content: we never ship empty, but we also never fabricate.
  const finalRejection = getFinalResponseRejectionReason(cleanContent, finalContent);
  if (finalRejection) {
    console.warn(`${logPrefix} Final-response guard flagged: ${finalRejection}`);
  }

  // Stage 10 — the canonical response carries a STABLE, content-independent
  // review marker only. It never includes the dynamic queue status, which is
  // computed later as separate outbound metadata (reviewScheduling) so the
  // canonical response/plan/hashes are identical across every enqueue outcome.
  reviewMeta = {
    reviewerMode: 'shadow',
    reviewExecution: 'async',
    repaired: false,
    patchesApplied: 0,
  };

  // Defense in depth: nothing above may mutate the validated itinerary.
  if (itineraryData !== frozenItinerary) {
    console.error(`${logPrefix} itineraryData changed post-validation — restoring validated plan`);
    itineraryData = frozenItinerary;
  }

  // Append visible correction notice so prose matches saved itinerary
  if (correctionsApplied.length > 0) {
    finalContent += formatCorrectionNotice(correctionsApplied);
  }

  const webSearchUpsell =
    appendAnonymousWebUpsell && !isTrustedMcp
      ? shouldAppendAnonymousWebSearchUpsell(lastMsg)
      : { append: false };

  if (webSearchUpsell.append) {
    finalContent = stripRedundantLiveDataDisclaimers(finalContent);
    response.content = finalContent + buildWebSearchUpsellSuffix(webSearchUpsell.variant);
  } else {
    response.content = finalContent;
  }

  // Final safety pass — never leak raw itinerary JSON markers to the user.
  // Stage 8: use the ISOMORPHIC stripper so the shipped content is byte-for-byte
  // what the browser's stripper produces (F-STREAM-1 parity).
  response.content = stripItineraryArtifacts(response.content).content;

  return {
    cleanContent: response.content,
    itineraryData,
    confidence,
    planScore,
    constraintIssues,
    feasibilityIssues,
    correctionsApplied,
    contentChangedByValidation,
    reviewMeta,
  };
}

/**
 * Single orchestration seam shared by every chat route (/chat, /chat-stream,
 * and both anonymous variants). It ALWAYS sources the canonical fact evidence
 * from the prepared context, so no individual route can forget to plumb the
 * bundle/status into the reviewer. This is the exact plumbing Stage 6A fixed;
 * routing all variants through here makes that regression structurally
 * impossible and gives the route-contract tests a real production seam.
 *
 * @param {Object} params
 * @param {Object} params.preparedContext - the object returned by prepareChatContext
 * @param {Object} params.processorArgs - everything the route passes to processAssistantResponse
 */
async function processPreparedTrailieResponse({ preparedContext, processorArgs }) {
  return processAssistantResponse({
    ...processorArgs,
    options: {
      ...(processorArgs.options || {}),
      // Canonical evidence is injected here — never by the individual routes —
      // straight from the prepared context that fetched it.
      canonicalFactBundle: preparedContext.canonicalFactBundle,
      canonicalFactStatus: preparedContext.canonicalFactStatus,
    },
  });
}

/**
 * Recover the monotonic response counter from the authenticated saved trip.
 * A prose-only prior turn gives the browser no currentPlan, so it otherwise
 * echoes zero even though the conversation already contains version one.
 */
async function hydrateStoredPriorResponseVersion(body, logPrefix) {
  const metadata = body?.metadata || {};
  const tripId = metadata.tripId || body?.tripId || body?.conversationId;
  if (!tripId || metadata.skipUserContext === true) return;

  try {
    const TripPlan = require('../models/TripPlan');
    const stored = await TripPlan.findById(tripId)
      .select('plan.responseVersion conversation.responseVersion')
      .lean();
    const versions = [stored?.plan?.responseVersion]
      .concat((stored?.conversation || []).map((message) => message?.responseVersion))
      .map(Number)
      .filter((version) => Number.isFinite(version) && version > 0);
    const storedPrior = versions.length ? Math.max(...versions) : 0;
    body.metadata = {
      ...metadata,
      priorResponseVersion: Math.max(readPriorResponseVersion(body), storedPrior),
    };
  } catch (err) {
    console.warn(`${logPrefix} Could not recover stored response version for ${tripId}:`, err.message);
  }
}

function latestUserText(messages) {
  const last = [...(messages || [])].reverse().find((message) => message?.role === 'user');
  return typeof last?.content === 'string' ? last.content : '';
}

function planningStateWithTravelerJob(preparedContext, result) {
  return require('../utils/planningState').finalizePlanningStateForTurn(
    preparedContext?.planningState || preparedContext?.constraints?.planningState || null, result);
}

function finalizeTrailieNonCompleteResponse({ transport, v2Result, terminalPayload, preparedContext = null }) {
  transport.responseFinalized({
    ...terminalPayload,
    travelLogistics: v2Result.travelLogistics ?? null,
    responseArtifacts: v2Result.responseArtifacts ?? null,
    intent: v2Result.intent ?? null,
    presentation: v2Result.presentation ?? null,
    planningState: terminalPayload.planningState
      ?? planningStateWithTravelerJob(preparedContext, v2Result)
      ?? null,
    // WP-TU Phase 3 Task 7B — additive only, same field as the complete-status
    // call sites; kept consistent here for non-complete terminals too.
    activeTripPresentation: v2Result.activeTripPresentation ?? null,
    // WP-TU Phase 4 Task 10 — same additive-field pattern as
    // activeTripPresentation (Task 7B) immediately above.
    targetTripId: v2Result.targetTripId ?? null,
  });
}

// Chat endpoint — no token limit for logged-in users, trackTokenUsage kept for analytics
router.get('/live-gate-preflight', protect, (req, res) => {
  if (String(process.env.NODE_ENV || '').toLowerCase() === 'production') {
    return res.status(404).json({ error: 'Not found' });
  }
  const preflight = buildGenericLiveGatePreflight({
    env: process.env,
    authenticated: Boolean(req.user),
  });
  return res.status(preflight.ready ? 200 : 503).json({ data: preflight });
});

router.post('/chat', protect, trackTokenUsage, async (req, res) => {
  const requestStartTime = Date.now();
  // Phase 6B.2 — same disconnect-cancellation seam the streaming routes use
  // (sseStream.js's attachClientDisconnectAbort), extended to the
  // non-stream routes: previously no signal was constructed here at all.
  const { signal, cleanup } = attachClientDisconnectAbort(req, res);
  try {
    console.log('[AI] Chat request received:', {
      provider: req.body.provider,
      messageCount: req.body.messages?.length,
      hasMetadata: !!req.body.metadata,
      metadata: req.body.metadata
    });

    await hydrateStoredPriorResponseVersion(req.body, '[AI]');

    // Stage 14.1 §2 — ONE identity per logical turn, minted at admission (before
    // Phase A). Both revisions and any terminal failure response reuse it.
    const responseIdentity = createTurnResponseIdentity({
      priorResponseVersion: readPriorResponseVersion(req.body),
    });

    // WP10C — non-stream terminal transport. Terminal mode emits no intermediate
    // events and exactly one HTTP body: legacy `{ data: … }` is preserved verbatim;
    // the v2 terminal shape appears only when a client explicitly negotiates it.
    const transport = createTrailieTransportAdapter({
      dialect: resolveTrailieTransportDialect(req),
      mode: 'terminal',
      emit: (body) => res.json(body),
    });

    const preparedContext = await prepareChatContext(req.body, '[AI]', { req });
    let { provider, responseMode, model, temperature, top_p, maxTokens, enhancedSystemPrompt, augmentedMessages, npsFacts, weatherFacts, webSearchFacts, astroFacts, feeFreeFacts, webSearchUnavailable, userCity, candidateParksBlock, resolvedMetadata, parkNames, allExtractedParks, noParkDetected, constraints, preflightResult, hypothetical, conflicts, intent, parkImages, alreadyShownImages, attachParkImages, openEndedDiscovery, discoveryRefinement, lastMsg, trailieContext, userRequestedItinerary, activeTripContext } = preparedContext;

    // Stage 14.7I §2 — `model` is already resolved by prepareChatContext, for
    // every handler and both generation branches. Nothing to default here.

    // Pre-flight BLOCKER — stop before calling AI
    if (preflightResult.blockers.length > 0) {
      const blockerMsg = preflightResult.blockers.map(b => `- ${b}`).join('\n');
      transport.responseFinalized({ content: `📍 **Can't plan this trip yet:**\n${blockerMsg}\n\nAdjust your dates or destination and try again.`, provider: 'system' });
      return;
    }

    // WP11B-1 — flag-gated integrated Trailie v2 runtime. Auth/identity/context
    // above stay exactly as legacy; only generation + terminal emission change.
    // Persistence remains client-driven (single writer) via the canonical
    // responseId/version — no server-side plan write here, same as legacy.
    // Canonical Trailie; availability gating applies only at the deployment boundary.
    if (!isTrailieRuntimeEnabled()) {
      return res.status(503).json({
        success: false,
        error: 'Trailie AI runtime unavailable',
        code: 'trailie_runtime_disabled',
      });
    }

    await persistCommittedTripMutation({
      message: latestUserText(req.body.messages),
      preparedContext,
    });
    const { result: v2Result, content: v2Content } = await runTrailieFromPreparedContext({
      preparedContext,
      messages: req.body.messages,
      // WP-TU Phase 4 Task 10E — the ONE identity this turn already has;
      // never a second mint downstream.
      responseId: responseIdentity.responseId,
      signal,
    });
    const v2Telemetry = summarizeTrailieTelemetry(v2Result);
    console.log('[AI][Trailie]', JSON.stringify(v2Telemetry));
    // Same continuity write as the streaming handler (non-stream fallback path).
    if (v2Result.status === 'complete' && v2Result.canonicalPlan && req.user?._id) {
      rememberConversationPlan({
        userId: req.user._id,
        responseId: responseIdentity.responseId,
        content: v2Content,
        canonicalPlan: v2Result.canonicalPlan,
      }).catch((err) => console.warn('[AI] conversation-plan remember failed:', err.message));
    }
    transport.responseFinalized({
      content: v2Content,
      provider: 'openai',
      model: v2Telemetry.model || null,
      responseId: responseIdentity.responseId,
      responseVersion: responseIdentity.responseVersion,
      hasItinerary: !!v2Result.canonicalPlan,
      itinerary: v2Result.canonicalPlan || null,
      itineraryData: v2Result.canonicalPlan || null,
      itineraryHash: v2Result.itineraryHash || null,
      travelLogistics: v2Result.travelLogistics ?? null,
      responseArtifacts: v2Result.responseArtifacts ?? null,
      planningState: planningStateWithTravelerJob(preparedContext, v2Result),
      intent: v2Result.intent ?? null,
      presentation: v2Result.presentation ?? null,
      // WP-TU Phase 3 Task 7B — additive only, alongside the legacy
      // `planningState`/`activeTripContext` fields above (which are stale
      // pre-Task-7-correction, see `planningStateWithTravelerJob`). This is
      // the FINAL, already-gated (preserve/set) destination for this turn.
      activeTripPresentation: v2Result.activeTripPresentation ?? null,
      // WP-TU Phase 4 Task 10 — same additive-field pattern as
      // activeTripPresentation (Task 7B) immediately above.
      targetTripId: v2Result.targetTripId ?? null,
      // WP-TU Phase 4 Task 10D — additive only, alongside (never replacing)
      // `canonicalPlan` above (which stays whatever the active trip's own
      // turn produced — null on a cross-plan turn). Authenticated call
      // sites only: guest sessions never reach candidate-plan discovery, so
      // `v2Result.targetPlanMutation` is always null for them and this field
      // is deliberately NOT threaded through the guest call sites.
      targetPlanMutation: v2Result.targetPlanMutation ?? null,
      trailieV2: v2Telemetry,
    });
    return;
  } catch (error) {
    // Structured error logging
    logAIRequest({
      endpoint: 'chat',
      userId: req.user?.id || null,
      provider: req.body.provider || 'unknown',
      model: req.body.model || null,
      durationMs: Date.now() - requestStartTime,
      error: error.message,
    });

    // Log detailed error information
    console.error('AI API Error:', {
      message: error.message,
      status: error.status,
      statusCode: error.statusCode,
      type: error.type,
      code: error.code,
      response: error.response?.data,
      provider: req.body.provider || 'unknown',
      userId: req.user?.id || 'anonymous'
    });

    // Check if it's a model-related error
    if (error.message && (error.message.includes('model') || error.message.includes('not found') || error.message.includes('not_found'))) {
      return res.status(400).json({
        error: 'Invalid or unavailable model',
        details: error.message,
        suggestion: 'Try using the /api/ai/test-models endpoint to see available models'
      });
    }

    // Check if it's an authentication error
    if (error.status === 401 || error.statusCode === 401 || error.message.includes('authentication') || error.message.includes('Invalid API key')) {
      return res.status(401).json({
        error: 'API key authentication failed',
        details: error.message || 'Please check your API key configuration',
        suggestion: 'Verify your API keys are correctly set in environment variables'
      });
    }

    // Check if it's a rate limit error
    if (error.status === 429 || error.statusCode === 429 || error.message.includes('rate limit')) {
      return res.status(429).json({
        error: 'Rate limit exceeded',
        details: error.message,
        suggestion: 'Please wait a moment before trying again'
      });
    }

    res.status(500).json({
      error: 'Failed to get AI response',
      details: error.message || 'Unknown error occurred',
      errorType: error.type || 'unknown',
      suggestion: 'Please try again in a moment or switch providers'
    });
  } finally {
    cleanup();
  }
});

// Streaming chat endpoint — SSE for authenticated users
router.post('/chat-stream', protect, trackTokenUsage, async (req, res) => {
  const requestStartTime = Date.now();
  try {
    console.log('[AI] Stream chat request received:', {
      provider: req.body.provider,
      messageCount: req.body.messages?.length,
      hasMetadata: !!req.body.metadata,
    });

    await hydrateStoredPriorResponseVersion(req.body, '[AI Stream]');

    // Stage 14.1 §2 — ONE identity per logical turn, minted at admission (before
    // Phase A). Both revisions and any terminal failure response reuse it.
    const responseIdentity = createTurnResponseIdentity({
      priorResponseVersion: readPriorResponseVersion(req.body),
    });

    const { signal, cleanup } = attachClientDisconnectAbort(req, res);
    try {
      setSseHeaders(res);

      // ── WP10B — resolve the wire dialect once and build ONE transport adapter as
      // the single serialization sink for this connection. Fails closed to legacy,
      // so every existing client is unaffected until it opts into v2.
      const dialect = resolveTrailieTransportDialect(req);
      const transport = createTrailieTransportAdapter({
        dialect,
        mode: 'stream',
        emit: (payload) => writeSseEvent(res, payload),
      });

      // ── Stage 14.2/14.2A — early revision events (authenticated streaming ONLY) ──
      // The early-event machinery keeps its flag/tool-first GENERATION gating and its
      // once/timing bookkeeping; the transport adapter decides whether each canonical
      // event is serialized for this dialect (v2) or suppressed (legacy terminal-only).
      const genConfig = getItineraryGenerationConfig();
      const earlyEvents = createEarlyEventEmitter({
        emit: (payload) => routeEarlyEventToTransport(transport, payload),
        enabled: genConfig.earlyItineraryEvents && genConfig.isToolFirst,
      });
      // §5 — if the connection is already gone, abort BEFORE Phase A: zero provider calls.
      if (signal?.aborted || res.writableEnded) { cleanup(); return; }

      let revisionOne = null;
      let revisionOneSnapshot = null;

      // §5 — `response_started` at TURN ADMISSION (v2), or the initial `thinking`
      // carrying the destination display metadata (legacy). ONE canonical call; the
      // adapter renders it for the dialect.
      transport.responseStarted({
        responseId: responseIdentity.responseId,
        requiresStructuredItinerary: null, // resolved later; itinerary_ready is authoritative
        display: { parkName: req.body.metadata?.parkName || null, parkNames: [] },
      });

      const preparedContext = await prepareChatContext(req.body, '[AI Stream]', { req });
      let {
        provider,
        responseMode,
        model,
        temperature,
        top_p,
        maxTokens,
        enhancedSystemPrompt,
        augmentedMessages,
        npsFacts,
        weatherFacts,
        webSearchFacts,
        astroFacts,
        feeFreeFacts,
        resolvedMetadata,
        parkNames,
        allExtractedParks,
        noParkDetected,
        constraints,
        preflightResult,
        hypothetical,
        conflicts,
        intent,
        parkImages,
        alreadyShownImages,
        attachParkImages,
        openEndedDiscovery,
        discoveryRefinement,
        lastMsg,
        trailieContext,
        userRequestedItinerary,
        activeTripContext,
      } = preparedContext;

      if (preflightResult.blockers.length > 0) {
        const blockerMsg = preflightResult.blockers.map((b) => `- ${b}`).join('\n');
        transport.responseFinalized({
          content: `📍 **Can't plan this trip yet:**\n${blockerMsg}\n\nAdjust your dates or destination and try again.`,
          provider: 'system',
        });
        res.end();
        return;
      }
      // Canonical Trailie; availability gating applies only at the deployment boundary.
      if (!isTrailieRuntimeEnabled()) {
        transport.error({
          code: 'trailie_runtime_disabled',
          message: 'Trailie AI runtime unavailable',
        });
        res.end();
        return;
      }

      const v2Binder = createTrailieStreamEventBinder({
        transport,
        responseIdentity,
        parkName: resolvedMetadata.parkName || null,
        parkCode: resolvedMetadata.parkCode || null,
        provider: 'openai',
        getDisplay: () => ({
          parkName: resolvedMetadata.parkName || null,
          parkNames: parkNames || [],
          parkImages: [],
        }),
      });
      await persistCommittedTripMutation({
        message: latestUserText(req.body.messages),
        preparedContext,
      });
      const { result: v2Result, content: v2Content } = await runTrailieFromPreparedContext({
        preparedContext,
        messages: req.body.messages,
        signal,
        emitCanonicalEvent: v2Binder.emitCanonicalEvent,
        // WP-TU Phase 4 Task 10E — the ONE identity this turn already has;
        // never a second mint downstream.
        responseId: responseIdentity.responseId,
      });
      const v2Telemetry = summarizeTrailieTelemetry(v2Result);
      console.log('[AI Stream][Trailie]', JSON.stringify(v2Telemetry));
      // Plan continuity for authenticated-unsaved conversations: remember the
      // accepted server-authored plan so the NEXT turn can refine instead of
      // regenerating, whether or not the traveler ever presses Save.
      if (v2Result.status === 'complete' && v2Result.canonicalPlan && req.user?._id) {
        rememberConversationPlan({
          userId: req.user._id,
          responseId: responseIdentity.responseId,
          content: v2Content,
          canonicalPlan: v2Result.canonicalPlan,
        }).catch((err) => console.warn('[AI Stream] conversation-plan remember failed:', err.message));
      }
      v2Binder.ensureDisplayContent(v2Content);
      const streamed = v2Binder.getStreamedContent();
      const contentUnchanged = streamed.length > 0 && streamed === v2Content;
      if (contentUnchanged) transport.contentStreamEnded();
      transport.responseFinalized({
        contentUnchanged,
        content: v2Content,
        responseId: responseIdentity.responseId,
        responseVersion: responseIdentity.responseVersion,
        provider: 'openai',
        model: v2Telemetry.model || null,
        hasItinerary: !!v2Result.canonicalPlan,
        itinerary: v2Result.canonicalPlan || null,
        itineraryData: v2Result.canonicalPlan || null,
        canonicalPlan: v2Result.canonicalPlan || null,
        itineraryHash: v2Result.itineraryHash || null,
        travelLogistics: v2Result.travelLogistics ?? null,
        responseArtifacts: v2Result.responseArtifacts ?? null,
        planningState: planningStateWithTravelerJob(preparedContext, v2Result),
        intent: v2Result.intent ?? null,
        presentation: v2Result.presentation ?? null,
        // WP-TU Phase 3 Task 7B — additive only; see the non-stream /chat call site.
        activeTripPresentation: v2Result.activeTripPresentation ?? null,
        // WP-TU Phase 4 Task 10 — same additive-field pattern as
        // activeTripPresentation (Task 7B) immediately above.
        targetTripId: v2Result.targetTripId ?? null,
        // WP-TU Phase 4 Task 10D — see the non-stream /chat call site; guest
        // paths deliberately excluded (never populated for them).
        targetPlanMutation: v2Result.targetPlanMutation ?? null,
        trailieV2: v2Telemetry,
        parkName: resolvedMetadata.parkName || null,
        parkNames: parkNames || [],
      });
      res.end();
      return;
    } finally {
      cleanup();
    }
  } catch (error) {
    if (res.headersSent) {
      res.write(`data: ${JSON.stringify({ type: 'error', message: error.message })}\n\n`);
      return res.end();
    }
    console.error('[AI Stream] Setup error:', error.message);
    if (error.statusCode === 400) {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: 'Failed to start AI stream', details: error.message });
  }
});


/**
 * Stage 14.8A.2 §11 — bounded refusal payload for a guest turn that was never
 * admitted, so the browser can always clear its optimistic pending state.
 *
 * Exhaustion keeps the existing conversion UX. Every other refusal is a short
 * code. Nothing here exposes provider credentials, raw provider errors, stack
 * traces, or internal session identifiers.
 */
function respondGuestTurnRefused(res, { refusal, anonymousId, lastUserMessageContent }) {
  if (refusal.code === GUEST_ROUTE_CODES.EXHAUSTED) {
    const guestChatUrl = buildGuestChatPublicUrl(anonymousId);
    const conversionContent = buildAnonymousConversionMessage({
      anonymousId,
      lastUserMessageContent,
    });

    return res.json({
      data: {
        content: conversionContent,
        provider: 'system',
        model: 'conversion',
        isConversionMessage: true,
        anonymousId,
        messageCount: refusal.completedGuestTurns,
        canSendMore: false,
        remainingAllowance: 0,
        guestChatUrl,
      },
    });
  }

  const status = refusal.code === GUEST_ROUTE_CODES.IN_PROGRESS ? 409 : 410;
  return res.status(status).json({
    error: refusal.code,
    anonymousId,
    messageCount: refusal.completedGuestTurns,
    canSendMore: refusal.canSendMore,
    remainingAllowance: refusal.remainingAllowance,
  });
}

// Anonymous streaming chat — SSE for guests (five COMPLETED turns, Stage 14.8A.2)
router.post('/chat-anonymous-stream', async (req, res) => {
  let anonymousId;
  let guestTurn = null;
  const requestStartTime = Date.now();
  try {
    console.log('[AI] Anonymous stream request received:', {
      provider: req.body.provider,
      messageCount: req.body.messages?.length,
      hasClientAnonymousId: !!req.body.anonymousId,
    });

    let {
      messages = [],
      provider = 'auto',
      model,
      temperature = 0.4,
      top_p = 0.9,
      maxTokens = 8000,
      systemPrompt,
      metadata = {},
      anonymousId: clientAnonymousId,
      clientTurnId,
    } = req.body;

    if (!provider || provider === 'auto') {
      provider = autoRouteProvider(messages);
      console.log(`[AI] Anonymous stream auto-routed to provider: ${provider}`);
    }

    // Session authority is the bounded V2 bearer ID only. IP, UA, and header
    // fingerprint remain operational metadata and never select guest state.
    const requestIdentity = resolveAnonymousRequestIdentity(req, clientAnonymousId);
    anonymousId = requestIdentity.anonymousId;
    const { ipAddress, userAgent, browserFingerprint } = requestIdentity;

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'Messages array is required' });
    }

    const sessionData = {
      ipAddress,
      userAgent,
      browserFingerprint,
      parkName: metadata.parkName || 'General Planning',
      parkCode: metadata.parkCode,
      formData: metadata.formData || {},
      entryContext: hasSemanticTrailieEntryContext(metadata.entryContext)
        ? normalizeTrailieEntryContext(metadata.entryContext).context
        : undefined,
    };

    const { selectGuestConversation, validateConversationId } = require('../utils/guestConversationScope');
    const conversationId = validateConversationId(metadata.guestConversationId);
    const guestSession = await AnonymousSession.findOrCreateSession(anonymousId, sessionData);
    if (conversationId && guestSession.conversationConversions?.[conversationId]) {
      return res.status(409).json({ error: 'This conversation has already been saved. Open your saved trip to continue.' });
    }
    const session = conversationId ? {
      ...guestSession.toObject(), ...selectGuestConversation(guestSession, conversationId),
      entryContext: null, formData: metadata.formData || {}, parkName: metadata.parkName,
    } : guestSession;
    const incomingEntryContext = normalizeTrailieEntryContext(metadata.entryContext).context;
    const freshGuestEntry = !conversationId && shouldStartFreshGuestEntry({ incoming: incomingEntryContext, persisted: session.entryContext });
    if (freshGuestEntry) {
      // Keep the authoritative turn ledger (quota) but start a clean semantic
      // conversation so an unrelated destination/plan cannot cross a CTA.
      session.messages = [];
      session.messageCount = 0;
      session.planningState = undefined;
    }
    if (hasSemanticTrailieEntryContext(incomingEntryContext)) {
      session.entryContext = incomingEntryContext;
      metadata.entryContext = incomingEntryContext;
      if (!conversationId) await session.save();
    } else if (session.entryContext) {
      metadata.entryContext = session.entryContext;
    }
    if (!freshGuestEntry && session.planningState && !metadata.planningState) {
      metadata.planningState = session.planningState;
    }

    const lastUserMessage = messages[messages.length - 1];

    // Stage 14.8A.2 §5 — atomic admission. This creates exactly ONE pending
    // logical turn and consumes ZERO quota; the user message is held on the
    // turn record, not appended to completed history. The allowance, the
    // one-pending-turn rule, and clientTurnId de-duplication are verified in a
    // single conditional update, so two tabs cannot both be admitted and the
    // sixth attempt is blocked BEFORE any provider reservation, construction,
    // dispatch, or external network access.
    guestTurn = await openGuestTurn({
      anonymousId: session.anonymousId,
      clientTurnId,
      userMessage: {
        role: 'user',
        content: lastUserMessage?.role === 'user' ? lastUserMessage.content : '',
        ...(conversationId ? { conversationId } : {}),
      },
      trusted: !!req.isTrustedMcp,
    });

    if (!guestTurn.admitted) {
      return respondGuestTurnRefused(res, {
        refusal: guestTurn.refusal,
        anonymousId: session.anonymousId,
        lastUserMessageContent: lastUserMessage?.content || '',
      });
    }

    const { signal, cleanup } = attachClientDisconnectAbort(req, res);
    try {
      setSseHeaders(res);

      // ── WP10D — resolve the wire dialect once and build ONE stream-mode transport
      // adapter as the single serialization sink for this guest connection. Fails
      // closed to legacy, so every existing anonymous client is unaffected until it
      // opts into v2. Anonymous gains NO authenticated revision/persistence or typed
      // early events — this replaces transport ownership only, not the guest lifecycle.
      const dialect = resolveTrailieTransportDialect(req);
      const transport = createTrailieTransportAdapter({
        dialect,
        mode: 'stream',
        emit: (payload) => writeSseEvent(res, payload),
      });

      // Guest turns still mint a response identity so v2 itinerary_ready can
      // publish a Stage-14 revision-1 envelope the client can validate/reveal.
      const responseIdentity = createTurnResponseIdentity({
        priorResponseVersion: readPriorResponseVersion({ metadata }),
      });

      // The initial `thinking` carrying the destination display metadata (legacy),
      // or `response_started` at admission (v2). ONE canonical call; the adapter
      // renders it for the dialect.
      transport.responseStarted({
        responseId: responseIdentity.responseId,
        display: { parkName: metadata.parkName || null, parkNames: [] },
      });

      const ctx = await prepareChatContext(
        { messages, provider, model, temperature, top_p, maxTokens, systemPrompt, metadata },
        '[AI Anon Stream]',
        {
          isAnonymous: true,
          isTrustedMcp: !!req.isTrustedMcp,
          req,
          // Read AFTER the fresh-entry reset above, so a plan from a previous
          // guest conversation can never leak across a CTA entry.
          persistedConversationPlan: latestCanonicalPlanFromMessages(session.messages),
        }
      );

      let {
        provider: ctxProvider,
        responseMode: anonResponseMode,
        model: ctxModel,
        temperature: ctxTemperature,
        top_p: ctxTopP,
        maxTokens: ctxMaxTokens,
        enhancedSystemPrompt,
        augmentedMessages,
        npsFacts,
        weatherFacts,
        webSearchFacts,
        astroFacts,
        feeFreeFacts,
        userCity: anonUserCity,
        candidateParksBlock: anonCandidateParksBlock,
        resolvedMetadata,
        parkNames: anonParkNames,
        noParkDetected: anonNoParkDetected,
        constraints: anonConstraints,
        preflightResult: anonPreflightResult,
        hypothetical: anonHypothetical,
        conflicts: anonConflicts,
        intent: anonIntent,
        parkImages,
        alreadyShownImages: anonAlreadyShownImages,
        attachParkImages: anonAttachParkImages,
        openEndedDiscovery: anonOpenEndedDiscovery,
        discoveryRefinement: anonDiscoveryRefinement,
        allExtractedParks,
        lastMsg,
        trailieContext: anonTrailieContext,
        userRequestedItinerary: anonUserRequestedItinerary,
        activeTripContext: anonActiveTripContext,
      } = ctx;

      provider = ctxProvider;
      if (ctxModel) model = ctxModel;
      temperature = ctxTemperature;
      top_p = ctxTopP;
      maxTokens = ctxMaxTokens;

      if (anonPreflightResult.blockers.length > 0) {
        // Stage 14.8A.2 §7 — a preflight blocker is an input rejection, not a
        // completed logical turn: no provider ran and no assistant response was
        // generated. The reservation is released so the guest can immediately
        // correct the request, and quota is unchanged.
        const blockerMsg = anonPreflightResult.blockers.map((b) => `- ${b}`).join('\n');
        await guestTurn.fail(GUEST_TURN_FAILURE_CODES.PREFLIGHT_BLOCKED);
        const quota = await readGuestQuota(session.anonymousId);
        transport.responseFinalized({
          content: `📍 **Can't plan this trip yet:**\n${blockerMsg}\n\nAdjust your dates or destination and try again.`,
          provider: 'system',
          anonymousId: session.anonymousId,
          messageCount: quota.completedGuestTurns,
          canSendMore: quota.remainingAllowance > 0,
          remainingAllowance: quota.remainingAllowance,
        });
        res.end();
        return;
      }

      // Canonical Trailie; availability gating applies only at the deployment boundary.
      if (!isTrailieRuntimeEnabled()) {
        await guestTurn.fail(GUEST_TURN_FAILURE_CODES.BACKEND_EXCEPTION);
        transport.error({
          code: 'trailie_runtime_disabled',
          message: 'Trailie AI runtime unavailable',
        });
        res.end();
        return;
      }

      const v2Binder = createTrailieStreamEventBinder({
        transport,
        responseIdentity,
        parkName: resolvedMetadata.parkName || null,
        parkCode: resolvedMetadata.parkCode || null,
        provider: 'openai',
        getDisplay: () => ({
          parkName: resolvedMetadata.parkName || null,
          parkNames: anonParkNames || [],
          parkImages: [],
        }),
      });
      await persistCommittedTripMutation({
        message: latestUserText(messages),
        preparedContext: ctx,
        session: conversationId ? null : session,
      });
      const { result: v2Result, content: v2Content } = await runTrailieFromPreparedContext({
        preparedContext: ctx,
        messages,
        signal,
        emitCanonicalEvent: v2Binder.emitCanonicalEvent,
      });
      const v2Telemetry = summarizeTrailieTelemetry(v2Result);
      console.log('[AI Anon Stream][Trailie]', JSON.stringify(v2Telemetry));
      v2Binder.ensureDisplayContent(v2Content);

      if (signal?.aborted) {
        await guestTurn.fail(GUEST_TURN_FAILURE_CODES.CLIENT_DISCONNECTED);
        res.end();
        return;
      }

      // Phase 9C.1D.5B.2 — an intentional semantic terminal (named experience
      // unavailable, drive-cap infeasible, evidence incomplete, unresolved plan
      // target) is a completed ANSWER, not a provider failure: it takes the
      // normal atomic completion below so it persists and restores on reload.
      const semanticTerminal = v2Result.status !== 'complete' && isCompletedSemanticTerminal(v2Result, v2Content);
      if (v2Result.status !== 'complete' && !semanticTerminal) {
        await guestTurn.fail(GUEST_TURN_FAILURE_CODES.PROVIDER_FAILURE);
        const quota = await readGuestQuota(session.anonymousId);
        const streamedFail = v2Binder.getStreamedContent();
        const failUnchanged = streamedFail.length > 0 && streamedFail === v2Content;
        if (failUnchanged) transport.contentStreamEnded();
        finalizeTrailieNonCompleteResponse({
          transport,
          v2Result,
          terminalPayload: {
            contentUnchanged: failUnchanged,
            content: v2Content,
            provider: 'trailie-v2',
            anonymousId: session.anonymousId,
            messageCount: quota.completedGuestTurns,
            canSendMore: quota.remainingAllowance > 0,
            remainingAllowance: quota.remainingAllowance,
            trailieV2: v2Telemetry,
            planningState: planningStateWithTravelerJob(ctx, v2Result),
          },
        });
        res.end();
        return;
      }

      // A semantic terminal dispatched no model: record it as the runtime's own answer.
      const v2Provider = semanticTerminal ? 'trailie-v2' : 'openai';
      const v2Model = semanticTerminal ? null : (v2Telemetry.model || null);
      const v2Completion = await guestTurn.complete({
        role: 'assistant',
        content: v2Content,
        provider: v2Provider,
        model: v2Model,
        responseTime: Date.now() - requestStartTime,
        travelLogistics: v2Result.travelLogistics ?? null,
        canonicalPlan: v2Result.canonicalPlan || null,
        responseArtifacts: v2Result.responseArtifacts ?? null,
        intent: v2Result.intent ?? null,
        presentation: v2Result.presentation ?? null,
        // WP-TU Phase 3 Task 8B — persist the same additive field Task 7B
        // already put on the live response, so it survives a cold reload.
        activeTripPresentation: v2Result.activeTripPresentation ?? null,
        // WP-TU Phase 4 Task 10 — same additive-field pattern as
        // activeTripPresentation (Task 7B) immediately above.
        targetTripId: v2Result.targetTripId ?? null,
        itineraryHash: v2Result.itineraryHash || null,
        responseId: responseIdentity.responseId,
        responseVersion: responseIdentity.responseVersion,
        parkName: resolvedMetadata.parkName || null,
        parkNames: anonParkNames || [],
      }, {
        planningState: planningStateWithTravelerJob(ctx, v2Result),
      });
      const streamed = v2Binder.getStreamedContent();
      const contentUnchanged = streamed.length > 0 && streamed === v2Content;
      if (contentUnchanged) transport.contentStreamEnded();
      transport.responseFinalized({
        contentUnchanged,
        content: v2Content,
        responseId: responseIdentity.responseId,
        responseVersion: responseIdentity.responseVersion,
        provider: v2Provider,
        model: v2Model,
        anonymousId: session.anonymousId,
        messageCount: v2Completion.completedGuestTurns,
        canSendMore: v2Completion.remainingAllowance > 0,
        remainingAllowance: v2Completion.remainingAllowance,
        hasItinerary: !!v2Result.canonicalPlan,
        itinerary: v2Result.canonicalPlan || null,
        itineraryData: v2Result.canonicalPlan || null,
        canonicalPlan: v2Result.canonicalPlan || null,
        itineraryHash: v2Result.itineraryHash || null,
        travelLogistics: v2Result.travelLogistics ?? null,
        responseArtifacts: v2Result.responseArtifacts ?? null,
        planningState: planningStateWithTravelerJob(ctx, v2Result),
        // WP-TU Phase 3 Task 7B — additive only; see the non-stream /chat call site.
        activeTripPresentation: v2Result.activeTripPresentation ?? null,
        // WP-TU Phase 4 Task 10 — same additive-field pattern as
        // activeTripPresentation (Task 7B) immediately above.
        targetTripId: v2Result.targetTripId ?? null,
        intent: v2Result.intent ?? null,
        presentation: v2Result.presentation ?? null,
        trailieV2: v2Telemetry,
        intent: v2Result.intent ?? null,
        presentation: v2Result.presentation ?? null,
        trailieV2: v2Telemetry,
        parkName: resolvedMetadata.parkName || null,
        parkNames: anonParkNames || [],
      });
      res.end();
      return;
    } finally {
      cleanup();
    }
  } catch (error) {
    // Stage 14.8A.2 §7 — any exception after admission releases the pending
    // reservation without consuming quota.
    if (guestTurn?.admitted) {
      await guestTurn
        .fail(classifyGuestTurnFailure(error))
        .catch((err) => console.error('[AI Anon Stream] Turn release error:', err.message));
    }

    logAIRequest({
      endpoint: 'chat-anonymous-stream',
      userId: null,
      provider: req.body.provider || 'unknown',
      model: req.body.model || null,
      durationMs: Date.now() - requestStartTime,
      error: error.message,
    });

    if (res.headersSent) {
      res.write(`data: ${JSON.stringify({ type: 'error', code: GUEST_ROUTE_CODES.FAILED })}\n\n`);
      return res.end();
    }

    console.error('[AI Anon Stream] Error:', error.message);
    return res.status(500).json({ error: GUEST_ROUTE_CODES.FAILED });
  } finally {
    // Stage 14.8A.2 §7 — the safety net for every remaining exit. A no-op once
    // the turn completed or failed; otherwise the reservation is released so no
    // pending turn can outlive its request and block the guest.
    if (guestTurn?.admitted) {
      await guestTurn
        .settle(GUEST_TURN_FAILURE_CODES.BACKEND_EXCEPTION)
        .catch((err) => console.error('[AI Anon Stream] Turn settle error:', err.message));
    }
  }
});

// Anonymous chat endpoint (no auth required) — five COMPLETED turns (Stage 14.8A.2)
router.post('/chat-anonymous', async (req, res) => {
  let anonymousId; // Declared outside try so catch block can access it
  let guestTurn = null;
  const requestStartTime = Date.now();
  // Phase 6B.2 — same disconnect-cancellation seam the streaming routes use
  // (sseStream.js's attachClientDisconnectAbort), extended to the
  // non-stream routes: previously no signal was constructed here at all.
  const { signal, cleanup } = attachClientDisconnectAbort(req, res);
  try {
    console.log('[AI] Anonymous chat request received:', {
      provider: req.body.provider,
      messageCount: req.body.messages?.length,
      hasMetadata: !!req.body.metadata,
      metadata: req.body.metadata,
      hasClientAnonymousId: !!req.body.anonymousId
    });

    let {
      messages = [],
      provider = 'auto',
      model,
      temperature = 0.4,
      top_p = 0.9,
      maxTokens = 8000,
      systemPrompt,
      metadata = {}, // { parkCode, parkName, lat, lon }
      anonymousId: clientAnonymousId, // Use client-provided anonymousId if available
      clientTurnId
    } = req.body;

    // Auto-route provider if not explicitly set
    if (!provider || provider === 'auto') {
      provider = autoRouteProvider(messages);
      console.log(`[AI] Anonymous auto-routed to provider: ${provider}`);
    }

    const requestIdentity = resolveAnonymousRequestIdentity(req, clientAnonymousId);
    anonymousId = requestIdentity.anonymousId;
    const { ipAddress, userAgent, browserFingerprint } = requestIdentity;
    console.log(
      requestIdentity.acceptedClientId
        ? '[AI] Using valid client guest session ID'
        : '[AI] Minted new guest session ID'
    );

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'Messages array is required' });
    }

    // Find or create anonymous session
    const sessionData = {
      ipAddress,
      userAgent,
      browserFingerprint,
      parkName: metadata.parkName || 'General Planning',
      parkCode: metadata.parkCode,
      formData: metadata.formData || {},
      entryContext: hasSemanticTrailieEntryContext(metadata.entryContext)
        ? normalizeTrailieEntryContext(metadata.entryContext).context
        : undefined,
    };

    const { selectGuestConversation, validateConversationId } = require('../utils/guestConversationScope');
    const conversationId = validateConversationId(metadata.guestConversationId);
    const guestSession = await AnonymousSession.findOrCreateSession(anonymousId, sessionData);
    if (conversationId && guestSession.conversationConversions?.[conversationId]) {
      return res.status(409).json({ error: 'This conversation has already been saved. Open your saved trip to continue.' });
    }
    const session = conversationId ? {
      ...guestSession.toObject(), ...selectGuestConversation(guestSession, conversationId),
      entryContext: null, formData: metadata.formData || {}, parkName: metadata.parkName,
    } : guestSession;
    const incomingEntryContext = normalizeTrailieEntryContext(metadata.entryContext).context;
    const freshGuestEntry = !conversationId && shouldStartFreshGuestEntry({ incoming: incomingEntryContext, persisted: session.entryContext });
    if (freshGuestEntry) {
      session.messages = [];
      session.messageCount = 0;
      session.planningState = undefined;
    }
    if (hasSemanticTrailieEntryContext(incomingEntryContext)) {
      session.entryContext = incomingEntryContext;
      metadata.entryContext = incomingEntryContext;
      if (!conversationId) await session.save();
    } else if (session.entryContext) {
      metadata.entryContext = session.entryContext;
    }
    if (!freshGuestEntry && session.planningState && !metadata.planningState) {
      metadata.planningState = session.planningState;
    }

    const lastUserMessage = messages[messages.length - 1];

    // Stage 14.8A.2 §5 — atomic admission, identical contract to the streaming
    // route: exactly one pending logical turn, zero quota consumed, and the
    // sixth attempt blocked BEFORE any provider reservation, construction,
    // dispatch, or external network access.
    guestTurn = await openGuestTurn({
      anonymousId: session.anonymousId,
      clientTurnId,
      userMessage: {
        role: 'user',
        content: lastUserMessage?.role === 'user' ? lastUserMessage.content : '',
        ...(conversationId ? { conversationId } : {}),
      },
      trusted: !!req.isTrustedMcp,
    });

    if (!guestTurn.admitted) {
      return respondGuestTurnRefused(res, {
        refusal: guestTurn.refusal,
        anonymousId: session.anonymousId,
        lastUserMessageContent: lastUserMessage?.content || '',
      });
    }

    // WP10E — non-stream terminal transport for guests. Terminal mode emits no
    // intermediate events and exactly one HTTP body: legacy `{ data: … }` is
    // preserved verbatim; the v2 terminal shape appears only when a client
    // explicitly negotiates it. Anonymous gains NO authenticated revision/
    // persistence/recovery — this replaces the terminal serializer only. The
    // guest-refusal / provider-httpStatus / catch-block error paths are HTTP
    // request failures (WP10C boundary), NOT canonical terminals, so they stay
    // as raw status responses and never route through the adapter.
    const transport = createTrailieTransportAdapter({
      dialect: resolveTrailieTransportDialect(req),
      mode: 'terminal',
      emit: (body) => res.json(body),
    });

    const ctx = await prepareChatContext(
      { messages, provider, model, temperature, top_p, maxTokens, systemPrompt, metadata },
      '[AI Anon]',
      {
        isAnonymous: true,
        isTrustedMcp: !!req.isTrustedMcp,
        req,
        persistedConversationPlan: latestCanonicalPlanFromMessages(session.messages),
      }
    );

    let {
      provider: ctxProvider,
      responseMode: anonResponseMode,
      model: ctxModel,
      temperature: ctxTemperature,
      top_p: ctxTopP,
      maxTokens: ctxMaxTokens,
      enhancedSystemPrompt,
      augmentedMessages,
      npsFacts,
      weatherFacts,
      webSearchFacts,
      astroFacts,
      feeFreeFacts,
      userCity: anonUserCity,
      candidateParksBlock: anonCandidateParksBlock,
      resolvedMetadata,
      parkNames: anonParkNames,
      noParkDetected: anonNoParkDetected,
      constraints: anonConstraints,
      preflightResult: anonPreflightResult,
      hypothetical: anonHypothetical,
      conflicts: anonConflicts,
      intent: anonIntent,
      parkImages,
      alreadyShownImages: anonAlreadyShownImages,
      attachParkImages: anonAttachParkImages,
      openEndedDiscovery: anonOpenEndedDiscovery,
      discoveryRefinement: anonDiscoveryRefinement,
      allExtractedParks,
      lastMsg,
      trailieContext: anonTrailieContext,
      userRequestedItinerary: anonUserRequestedItinerary,
      activeTripContext: anonActiveTripContext,
    } = ctx;

    provider = ctxProvider;
    if (ctxModel) model = ctxModel;
    temperature = ctxTemperature;
    top_p = ctxTopP;
    maxTokens = ctxMaxTokens;

    if (anonPreflightResult.blockers.length > 0) {
      // Stage 14.8A.2 §7 — input rejection, not a completed logical turn.
      const blockerMsg = anonPreflightResult.blockers.map((b) => `- ${b}`).join('\n');
      await guestTurn.fail(GUEST_TURN_FAILURE_CODES.PREFLIGHT_BLOCKED);
      const quota = await readGuestQuota(session.anonymousId);
      transport.responseFinalized({
        content: `📍 **Can't plan this trip yet:**\n${blockerMsg}\n\nAdjust your dates or destination and try again.`,
        provider: 'system',
        anonymousId: session.anonymousId,
        messageCount: quota.completedGuestTurns,
        canSendMore: quota.remainingAllowance > 0,
        remainingAllowance: quota.remainingAllowance,
      });
      return;
    }

    // Canonical Trailie; availability gating applies only at the deployment boundary.
    if (!isTrailieRuntimeEnabled()) {
      await guestTurn.fail(GUEST_TURN_FAILURE_CODES.BACKEND_EXCEPTION);
      return res.status(503).json({
        success: false,
        error: 'Trailie AI runtime unavailable',
        code: 'trailie_runtime_disabled',
      });
    }

    await persistCommittedTripMutation({
      message: latestUserText(messages),
      preparedContext: ctx,
      session: conversationId ? null : session,
    });
    const { result: v2Result, content: v2Content } = await runTrailieFromPreparedContext({
      preparedContext: ctx,
      messages,
      signal,
    });
    const v2Telemetry = summarizeTrailieTelemetry(v2Result);
    console.log('[AI Anon][Trailie]', JSON.stringify(v2Telemetry));

    // Phase 9C.1D.5B.2 — an intentional semantic terminal (named experience
    // unavailable, drive-cap infeasible, evidence incomplete, unresolved plan
    // target) is a completed ANSWER, not a provider failure: it takes the
    // normal atomic completion below so it persists and restores on reload.
    const semanticTerminal = v2Result.status !== 'complete' && isCompletedSemanticTerminal(v2Result, v2Content);
    if (v2Result.status !== 'complete' && !semanticTerminal) {
      await guestTurn.fail(GUEST_TURN_FAILURE_CODES.PROVIDER_FAILURE);
      const quota = await readGuestQuota(session.anonymousId);
      finalizeTrailieNonCompleteResponse({
        transport,
        v2Result,
        terminalPayload: {
          content: v2Content,
          provider: 'trailie-v2',
          anonymousId: session.anonymousId,
          messageCount: quota.completedGuestTurns,
          canSendMore: quota.remainingAllowance > 0,
          remainingAllowance: quota.remainingAllowance,
          trailieV2: v2Telemetry,
          planningState: planningStateWithTravelerJob(ctx, v2Result),
        },
      });
      return;
    }

    // A semantic terminal dispatched no model: record it as the runtime's own answer.
    const v2Provider = semanticTerminal ? 'trailie-v2' : 'openai';
    const v2Model = semanticTerminal ? null : (v2Telemetry.model || null);
    const v2Completion = await guestTurn.complete({
      role: 'assistant',
      content: v2Content,
      provider: v2Provider,
      model: v2Model,
      responseTime: Date.now() - requestStartTime,
      travelLogistics: v2Result.travelLogistics ?? null,
      canonicalPlan: v2Result.canonicalPlan || null,
      responseArtifacts: v2Result.responseArtifacts ?? null,
      intent: v2Result.intent ?? null,
      presentation: v2Result.presentation ?? null,
      // WP-TU Phase 3 Task 8B — persist the same additive field Task 7B
      // already put on the live response, so it survives a cold reload.
      activeTripPresentation: v2Result.activeTripPresentation ?? null,
      // WP-TU Phase 4 Task 10 — same additive-field pattern as
      // activeTripPresentation (Task 7B) immediately above.
      targetTripId: v2Result.targetTripId ?? null,
      itineraryHash: v2Result.itineraryHash || null,
      parkName: resolvedMetadata.parkName || null,
      parkNames: anonParkNames || [],
    }, {
      planningState: planningStateWithTravelerJob(ctx, v2Result),
    });
    transport.responseFinalized({
      content: v2Content,
      provider: v2Provider,
      model: v2Model,
      anonymousId: session.anonymousId,
      messageCount: v2Completion.completedGuestTurns,
      canSendMore: v2Completion.remainingAllowance > 0,
      remainingAllowance: v2Completion.remainingAllowance,
      hasItinerary: !!v2Result.canonicalPlan,
      itinerary: v2Result.canonicalPlan || null,
      itineraryHash: v2Result.itineraryHash || null,
      travelLogistics: v2Result.travelLogistics ?? null,
      responseArtifacts: v2Result.responseArtifacts ?? null,
      planningState: planningStateWithTravelerJob(ctx, v2Result),
      // WP-TU Phase 3 Task 7B — additive only; see the non-stream /chat call site.
      activeTripPresentation: v2Result.activeTripPresentation ?? null,
      // WP-TU Phase 4 Task 10 — same additive-field pattern as
      // activeTripPresentation (Task 7B) immediately above.
      targetTripId: v2Result.targetTripId ?? null,
      intent: v2Result.intent ?? null,
      presentation: v2Result.presentation ?? null,
      trailieV2: v2Telemetry,
    });
    return;
  } catch (error) {
    // Stage 14.8A.2 §7 — release the pending reservation; quota is unchanged.
    if (guestTurn?.admitted) {
      await guestTurn
        .fail(classifyGuestTurnFailure(error))
        .catch((err) => console.error('[AI Anon] Turn release error:', err.message));
    }

    // Structured error logging
    logAIRequest({
      endpoint: 'chat-anonymous',
      userId: null,
      provider: req.body.provider || 'unknown',
      model: req.body.model || null,
      durationMs: Date.now() - requestStartTime,
      error: error.message,
    });

    // Detail stays server-side only. Stage 14.8A.2 §11 — the guest response
    // must never carry provider credentials, raw provider errors, stack traces,
    // or internal session identifiers.
    console.error('Anonymous AI API Error:', {
      message: error.message,
      status: error.status,
      statusCode: error.statusCode,
      type: error.type,
      code: error.code,
      provider: req.body.provider || 'unknown',
    });

    const failureCode = classifyGuestTurnFailure(error);
    const status =
      error.status === 429 || error.statusCode === 429 || /rate limit/i.test(error.message || '')
        ? 429
        : failureCode === GUEST_TURN_FAILURE_CODES.PROVIDER_CONFIGURATION
          ? 503
          : 500;

    res.status(status).json({
      error: GUEST_ROUTE_CODES.FAILED,
      failureCode,
      canSendMore: true,
    });
  } finally {
    // Stage 14.8A.2 §7 — safety net for every remaining exit path.
    if (guestTurn?.admitted) {
      await guestTurn
        .settle(GUEST_TURN_FAILURE_CODES.BACKEND_EXCEPTION)
        .catch((err) => console.error('[AI Anon] Turn settle error:', err.message));
    }
    cleanup();
  }
});

// Get anonymous session status
router.use(require('./guestHistoryRecovery'));

router.get('/session-status/:anonymousId', async (req, res) => {
  try {
    if (!isValidGuestSessionId(req.params.anonymousId)) {
      return res.status(404).json({
        error: 'Session not found',
        canSendMore: false,
        messageCount: 0
      });
    }

    const session = await AnonymousSession.findOne({
      anonymousId: req.params.anonymousId
    });

    if (!session) {
      return res.status(404).json({
        error: 'Session not found',
        canSendMore: false,
        messageCount: 0
      });
    }

    // Stage 14.8A.2 §8/§9 — a refresh is also the recovery point for a pending
    // turn whose process died: the stale reservation is released before the
    // status is reported, so the browser is never told a turn is still running
    // when nothing is executing. Completed turns are untouched.
    await releaseStalePendingTurns({ anonymousId: session.anonymousId });
    const quota = await readGuestQuota(session.anonymousId);

    // Completed history stays in `messages`. Retryable failed turns are
    // projected as truthful transcript only — never as accepted canonical state.
    const { selectGuestConversation, validateConversationId } = require('../utils/guestConversationScope');
    const conversationId = validateConversationId(req.query.conversationId);
    const scoped = selectGuestConversation(session, conversationId);
    const chatMessages = projectGuestConversationForStatus({
      messages: scoped.messages,
      turns: scoped.turns,
    });

    res.json({
      canSendMore: quota.remainingAllowance > 0,
      messageCount: quota.completedGuestTurns,
      completedGuestTurns: quota.completedGuestTurns,
      remainingAllowance: quota.remainingAllowance,
      hasPendingTurn: quota.hasPendingTurn,
      isConverted: conversationId ? !!session.conversationConversions?.[conversationId] : session.isConverted,
      lastActivity: session.lastActivity,
      parkName: conversationId ? null : session.parkName,
      parkCode: conversationId ? null : session.parkCode || null,
      formData: conversationId ? {} : session.formData || {},
      planningState: scoped.planningState || null,
      entryContext: conversationId ? null : session.entryContext || null,
      messages: chatMessages,
      authoritativeMessages: scoped.messages,
      historyHash: require('../utils/guestHistoryRecovery').historyHash(scoped.messages),
      guestChatUrl: buildGuestChatPublicUrl(session.anonymousId, conversationId),
    });
  } catch (error) {
    console.error('Error checking session status:', error);
    res.status(error.status || 500).json({
      error: 'Failed to check session status',
      canSendMore: false,
      messageCount: 0
    });
  }
});

// Get available providers (anonymous version)
router.get('/providers-anonymous', (req, res) => {
  const providers = getTrailieProviders();

  if (providers.length === 0) {
    return res.status(503).json({
      error: 'No AI providers configured',
      providers: []
    });
  }

  res.json({ providers });
});

// Get available providers (authenticated version)
router.get('/providers', protect, (req, res) => {
  const providers = getTrailieProviders();

  if (providers.length === 0) {
    return res.status(503).json({
      error: 'No AI providers configured',
      providers: []
    });
  }

  res.json({ providers });
});

// Test Claude models endpoint
router.get('/test-models', protect, async (req, res) => {
  if (!anthropic) {
    return res.status(503).json({ error: 'Claude not configured' });
  }

  const modelsToTest = CLAUDE_FALLBACK_MODELS;

  const results = [];

  for (const model of modelsToTest) {
    try {
      console.log(`Testing model: ${model}`);

      await anthropic.messages.create({
        model: model,
        max_tokens: 10,
        messages: [{ role: 'user', content: 'Hi' }]
      });

      results.push({ model, available: true, error: null });
      console.log(`✓ ${model} - Available`);

    } catch (error) {
      results.push({
        model,
        available: false,
        error: error.message,
        errorType: error.type || 'unknown'
      });
      console.log(`✗ ${model} - Not available: ${error.message}`);
    }
  }

  const availableModels = results.filter(r => r.available).map(r => r.model);
  const unavailableModels = results.filter(r => !r.available);

  res.json({
    results,
    summary: {
      total: results.length,
      available: availableModels.length,
      unavailable: unavailableModels.length,
      availableModels,
      unavailableModels: unavailableModels.map(r => ({ model: r.model, error: r.error }))
    }
  });
});

// Get token usage information
router.get('/token-usage', protect, getTokenUsage);

// AI Analytics routes
router.get('/analytics', protect, getAIAnalytics);
router.get('/learning-insights', protect, getLearningInsights);

// ============================================
// Voice: OpenAI Realtime API ephemeral session
// ============================================

const voiceSessionRateLimit = new Map(); // key → { count, resetAt }
const ANON_VOICE_FREE_SESSIONS = 3; // free voice sessions before requiring login

router.post('/realtime-session', optionalAuth, async (req, res) => {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return res.status(503).json({ error: 'Voice feature not configured' });
    }

    const isAuthenticated = !!req.user;
    console.log(`[Voice] Session request — authenticated: ${isAuthenticated}, user: ${req.user?.email || 'anonymous'}, ip: ${req.ip}`);

    // Anonymous users: allow ANON_VOICE_FREE_SESSIONS free sessions, then require login
    // Uses a separate long-lived counter (24h) distinct from the hourly rate limit
    if (!isAuthenticated) {
      const anonKey = `anon:${req.ip || req.connection?.remoteAddress || 'unknown'}`;
      const now = Date.now();
      let anonBucket = voiceSessionRateLimit.get(anonKey);
      if (!anonBucket || now > anonBucket.resetAt) {
        anonBucket = { count: 0, resetAt: now + 24 * 60 * 60 * 1000 }; // 24h window
        voiceSessionRateLimit.set(anonKey, anonBucket);
      }
      anonBucket.count++;
      if (anonBucket.count > ANON_VOICE_FREE_SESSIONS) {
        return res.status(401).json({
          error: 'Sign up for free to keep using Trailie Voice.',
          authRequired: true,
          sessionsUsed: anonBucket.count - 1,
          freeLimit: ANON_VOICE_FREE_SESSIONS,
        });
      }
    }

    // Rate limit: 10 sessions per hour per user (UID preferred, IP fallback)
    const rateLimitKey = req.user?.id || req.ip || req.connection?.remoteAddress || 'unknown';
    const now = Date.now();
    let bucket = voiceSessionRateLimit.get(rateLimitKey);
    if (!bucket || now > bucket.resetAt) {
      bucket = { count: 0, resetAt: now + 60 * 60 * 1000 };
      voiceSessionRateLimit.set(rateLimitKey, bucket);
    }
    bucket.count++;
    if (bucket.count > 10) {
      return res.status(429).json({
        error: 'Rate limit exceeded. Voice sessions are limited to 10 per hour.',
      });
    }

    // Clean up stale entries periodically (every 100 requests)
    if (Math.random() < 0.01) {
      for (const [key, b] of voiceSessionRateLimit) {
        if (now > b.resetAt) voiceSessionRateLimit.delete(key);
      }
    }

    // Build instructions — inject park context if provided
    const rawParkCode = req.body?.parkCode;
    const parkCode = typeof rawParkCode === 'string'
      ? rawParkCode.replace(/[^a-zA-Z0-9]/g, '').slice(0, 10)
      : null;
    let instructions = TRAILIE_VOICE_INSTRUCTIONS;

    // Pre-fetch park data so the model can answer instantly (no MCP round-trip)
    if (parkCode) {
      try {
        const enhancedParkService = require('../services/enhancedParkService');
        const [parkResult, alertsResult, weatherResult] = await Promise.allSettled([
          getNpsService().getParkByCode(parkCode),
          getNpsService().getParkAlerts(parkCode),
          getNpsService().getParkByCode(parkCode).then(p =>
            p?.latitude && p?.longitude ? enhancedParkService.getWeatherData(p) : null
          ),
        ]);

        const park = parkResult.status === 'fulfilled' ? parkResult.value : null;
        const alerts = alertsResult.status === 'fulfilled' ? alertsResult.value : [];
        const weather = weatherResult.status === 'fulfilled' ? weatherResult.value : null;

        if (park) {
          let dataBlock = `\n\n--- LIVE PARK DATA (pre-loaded — use directly, do NOT call get_park_details for this park) ---`;
          dataBlock += `\nPark: ${park.fullName} (${parkCode})`;
          dataBlock += `\nState: ${park.states || 'N/A'}`;
          if (park.description) dataBlock += `\nOverview: ${park.description}`;

          // Fees
          const fees = park.entranceFees || [];
          const mainFee = pickPrimaryEntranceFee(fees);
          if (mainFee) {
            dataBlock += `\nEntrance fee: $${mainFee.cost} — ${mainFee.title}`;
          }

          // Hours
          const hours = park.operatingHours || [];
          if (hours.length > 0) {
            const h = hours[0].standardHours || {};
            const today = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'][new Date().getDay()];
            dataBlock += `\nToday's hours: ${h[today] || 'Check park website'}`;
          }

          // Weather
          if (weather?.current) {
            const w = weather.current;
            dataBlock += `\nWeather right now: ${Math.round(w.tempF || w.temp)}°F, ${w.description || w.condition || 'N/A'}`;
            if (w.humidity) dataBlock += `, humidity ${w.humidity}%`;
          }
          if (weather?.forecast?.length > 0) {
            const next3 = weather.forecast.slice(0, 3).map(f =>
              `${f.date || f.day}: ${Math.round(f.highF || f.high)}°/${Math.round(f.lowF || f.low)}° ${f.description || f.condition || ''}`
            ).join(' | ');
            dataBlock += `\nForecast: ${next3}`;
          }

          // Alerts
          if (alerts.length > 0) {
            dataBlock += `\nActive alerts (${alerts.length}):`;
            alerts.slice(0, 5).forEach(a => {
              dataBlock += `\n  - [${a.category}] ${a.title}`;
            });
          } else {
            dataBlock += `\nNo active alerts.`;
          }

          // Activities
          const activities = (park.activities || []).slice(0, 10).map(a => a.name).join(', ');
          if (activities) dataBlock += `\nActivities: ${activities}`;

          dataBlock += `\n--- END LIVE DATA ---`;
          dataBlock += `\n\nThe user is viewing ${park.fullName}. Use the data above to answer questions about THIS park instantly. Only call tools if the user asks about a DIFFERENT park, wants search/comparison, or asks about events/programs.`;

          instructions += dataBlock;
        } else {
          instructions += `\n\nThe user is currently viewing the park with code "${parkCode}". Use get_park_details to fetch live data if they ask about it.`;
        }
      } catch (prefetchErr) {
        console.error('[Voice] Park pre-fetch failed (non-blocking):', prefetchErr.message);
        instructions += `\n\nThe user is currently viewing the park with code "${parkCode}". Use get_park_details to fetch live data if they ask about it.`;
      }
    }

    // Inject current date & season
    const today = new Date();
    const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    const month = today.getMonth(); // 0-11
    const season = month >= 2 && month <= 4 ? 'spring' : month >= 5 && month <= 7 ? 'summer' : month >= 8 && month <= 10 ? 'fall' : 'winter';
    instructions += `\n\nToday is ${months[month]} ${today.getDate()}, ${today.getFullYear()} (${season}). Use this for seasonal recommendations.`;

    // Inject nearby parks if user shared geolocation
    const userLat = parseFloat(req.body?.lat);
    const userLng = parseFloat(req.body?.lng);
    if (!isNaN(userLat) && !isNaN(userLng) && Math.abs(userLat) <= 90 && Math.abs(userLng) <= 180) {
      try {
        const allParks = await getNpsService().getAllParks();
        if (allParks && allParks.length > 0) {
          // Calculate distance (Haversine) and find nearest parks
          function haversine(lat1, lon1, lat2, lon2) {
            const R = 3959; // miles
            const dLat = (lat2 - lat1) * Math.PI / 180;
            const dLon = (lon2 - lon1) * Math.PI / 180;
            const a = Math.sin(dLat / 2) ** 2 +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon / 2) ** 2;
            return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
          }

          const parksWithDist = allParks
            .filter(p => p.latitude && p.longitude)
            .map(p => ({
              name: p.fullName,
              code: p.parkCode,
              dist: Math.round(haversine(userLat, userLng, parseFloat(p.latitude), parseFloat(p.longitude))),
            }))
            .sort((a, b) => a.dist - b.dist)
            .slice(0, 8);

          if (parksWithDist.length > 0) {
            let geoBlock = `\n\n--- USER LOCATION ---`;
            geoBlock += `\nThe user is near coordinates (${userLat.toFixed(2)}, ${userLng.toFixed(2)}).`;
            geoBlock += `\nNearest NPS sites:`;
            parksWithDist.forEach(p => {
              const driveEst = p.dist < 50 ? 'under 1 hr' : `~${Math.round(p.dist / 50)} hr drive`;
              geoBlock += `\n  - ${p.name} (${p.code}) — ${p.dist} mi (${driveEst})`;
            });
            geoBlock += `\n--- END LOCATION ---`;
            geoBlock += `\nWhen the user asks "near me", "close by", or "nearby", use this data. Don't ask where they are — you already know.`;
            instructions += geoBlock;
          }
        }
      } catch (geoErr) {
        console.error('[Voice] Geo park lookup failed (non-blocking):', geoErr.message);
      }
    }

    // On the last free anonymous session, tell Trailie to nudge the user to sign up
    if (!isAuthenticated) {
      const anonKey = `anon:${req.ip || req.connection?.remoteAddress || 'unknown'}`;
      const anonBucket = voiceSessionRateLimit.get(anonKey);
      if (anonBucket && anonBucket.count >= ANON_VOICE_FREE_SESSIONS) {
        instructions += `\n\nIMPORTANT — SIGN-UP NUDGE: This is the user's last free voice chat. After answering their FIRST question, naturally mention: "By the way, this is your last free voice chat — sign up at TrailVerse to keep talking. It's free." Keep it casual, one sentence, then continue helping. Do NOT lead with the nudge — answer their question first.`;
      }
    }

    // Request ephemeral token from OpenAI
    const fetch = require('node-fetch');
    const response = await fetch('https://api.openai.com/v1/realtime/client_secrets', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        session: {
          type: 'realtime',
          model: 'gpt-realtime',
          instructions,
          output_modalities: ['audio'],
          audio: {
            input: {
              turn_detection: {
                type: 'semantic_vad',
                interrupt_response: false,
                create_response: false,
              },
            },
            output: {
              voice: 'marin',
            },
          },
          tools: [
            {
              type: 'function',
              name: 'get_park_details',
              description: 'Get live details about a national park including weather, alerts, fees, hours, and activities. Use this when the user asks about a specific park.',
              parameters: {
                type: 'object',
                properties: {
                  park_code: { type: 'string', description: 'The NPS park code, e.g. "zion", "yell", "grca", "yose"' },
                },
                required: ['park_code'],
              },
            },
            {
              type: 'function',
              name: 'search_parks',
              description: 'Search for national parks by state, activity, or keyword. Use when the user asks for park recommendations or discovery.',
              parameters: {
                type: 'object',
                properties: {
                  state: { type: 'string', description: 'Two-letter state code to filter by, e.g. "CA", "UT", "CO"' },
                  activity: { type: 'string', description: 'Activity to filter by, e.g. "hiking", "camping", "stargazing"' },
                  query: { type: 'string', description: 'Search keyword or phrase' },
                },
              },
            },
            {
              type: 'function',
              name: 'compare_parks',
              description: 'Compare two national parks side by side (weather, fees, alerts, activities). Use when the user wants to choose between parks.',
              parameters: {
                type: 'object',
                properties: {
                  park_codes: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Array of 2 park codes to compare, e.g. ["zion", "grca"]',
                  },
                },
                required: ['park_codes'],
              },
            },
            {
              type: 'function',
              name: 'find_events',
              description: 'Find upcoming ranger programs, tours, and events at a national park. Use when the user asks about events, programs, or things happening at a park.',
              parameters: {
                type: 'object',
                properties: {
                  park_code: { type: 'string', description: 'The NPS park code, e.g. "grca", "yell", "zion"' },
                  date_start: { type: 'string', description: 'Start date in YYYY-MM-DD format. Defaults to today.' },
                  date_end: { type: 'string', description: 'End date in YYYY-MM-DD format. Defaults to 7 days from start.' },
                },
                required: ['park_code'],
              },
            },
          ],
        },
      }),
    });

    if (!response.ok) {
      const errBody = await response.text();
      console.error('[Voice] OpenAI session error:', response.status, errBody);
      return res.status(502).json({ error: 'Failed to create voice session' });
    }

    const sessionData = await response.json();
    console.log('[Voice] Session created successfully, keys:', Object.keys(sessionData));
    res.json(sessionData);
  } catch (err) {
    console.error('[Voice] Session creation error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Voice: execute function calls from the Realtime API
// ====================================================
router.post('/voice-tool', async (req, res) => {
  try {
    const { tool, args } = req.body;
    if (!tool || typeof tool !== 'string') {
      return res.status(400).json({ error: 'Missing tool name' });
    }

    const enhancedParkService = require('../services/enhancedParkService');

    switch (tool) {
      case 'get_park_details': {
        const parkCode = (args?.park_code || '').replace(/[^a-zA-Z0-9]/g, '').slice(0, 10).toLowerCase();
        if (!parkCode) return res.status(400).json({ error: 'Missing park_code' });

        const [parkResult, alertsResult, weatherResult] = await Promise.allSettled([
          getNpsService().getParkByCode(parkCode),
          getNpsService().getParkAlerts(parkCode),
          getNpsService().getParkByCode(parkCode).then(p =>
            p?.latitude && p?.longitude ? enhancedParkService.getWeatherData(p) : null
          ),
        ]);

        const park = parkResult.status === 'fulfilled' ? parkResult.value : null;
        const alerts = alertsResult.status === 'fulfilled' ? alertsResult.value : [];
        const weather = weatherResult.status === 'fulfilled' ? weatherResult.value : null;

        if (!park) return res.json({ result: `Could not find park with code "${parkCode}".` });

        // Keep response concise for voice — model should NOT read all of this
        let text = `${park.fullName}, ${park.states || 'N/A'}`;

        const mainFee = pickPrimaryEntranceFee(park.entranceFees || []);
        if (mainFee) text += `\nFee: $${mainFee.cost}`;

        const hours = park.operatingHours || [];
        if (hours.length > 0) {
          const h = hours[0].standardHours || {};
          const dayName = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'][new Date().getDay()];
          text += `\nHours: ${h[dayName] || 'Check park website'}`;
        }

        if (weather?.current) {
          const w = weather.current;
          text += `\nWeather: ${Math.round(w.tempF || w.temp)}°F, ${w.description || w.condition || 'N/A'}`;
        }

        if (alerts.length > 0) {
          // Only include closures and warnings — skip informational alerts
          const important = alerts.filter(a => a.category === 'Danger' || a.category === 'Caution' || a.category === 'Park Closure');
          const toShow = important.length > 0 ? important.slice(0, 2) : alerts.slice(0, 2);
          text += `\n${alerts.length} alerts. Key: ${toShow.map(a => a.title).join('; ')}`;
        } else {
          text += `\nNo alerts.`;
        }

        return res.json({ result: text });
      }

      case 'search_parks': {
        const state = (args?.state || '').replace(/[^a-zA-Z]/g, '').slice(0, 2).toUpperCase();
        const activity = (args?.activity || '').slice(0, 50);
        const query = (args?.query || '').slice(0, 200);

        const { parks, count } = await executeParkSearch({
          q: query || undefined,
          state: state || undefined,
          activity: activity || undefined,
          limit: 5,
          req,
          source: 'trailie_voice',
        });

        return res.json({
          result: formatVoiceSearchResult(parks, count),
        });
      }

      case 'compare_parks': {
        const codes = args?.park_codes;
        if (!Array.isArray(codes) || codes.length < 2) {
          return res.json({ result: 'Need at least 2 park codes to compare.' });
        }

        const parkCodes = codes.slice(0, 4).map(c => c.replace(/[^a-zA-Z0-9]/g, '').toLowerCase());

        const results = await Promise.allSettled(
          parkCodes.map(async (code) => {
            const [park, alerts, weather] = await Promise.allSettled([
              getNpsService().getParkByCode(code),
              getNpsService().getParkAlerts(code),
              getNpsService().getParkByCode(code).then(p =>
                p?.latitude && p?.longitude ? enhancedParkService.getWeatherData(p) : null
              ),
            ]);
            return {
              code,
              park: park.status === 'fulfilled' ? park.value : null,
              alerts: alerts.status === 'fulfilled' ? alerts.value : [],
              weather: weather.status === 'fulfilled' ? weather.value : null,
            };
          })
        );

        let text = '';
        for (const r of results) {
          if (r.status !== 'fulfilled' || !r.value.park) continue;
          const { park, alerts, weather } = r.value;
          const mainFee = pickPrimaryEntranceFee(park.entranceFees || []);
          text += `${park.fullName}: `;
          if (weather?.current) text += `${Math.round(weather.current.tempF || weather.current.temp)}°F, `;
          if (mainFee) text += `$${mainFee.cost} entry, `;
          text += `${alerts.length} alerts\n`;
        }

        return res.json({ result: text.trim() });
      }

      case 'find_events': {
        const parkCode = (args?.park_code || '').replace(/[^a-zA-Z0-9]/g, '').slice(0, 10).toLowerCase();
        if (!parkCode) return res.json({ result: 'Missing park_code for event search.' });

        const today = new Date();
        const dateStart = args?.date_start || today.toISOString().slice(0, 10);
        const defaultEnd = new Date(today);
        defaultEnd.setDate(defaultEnd.getDate() + 7);
        const dateEnd = args?.date_end || defaultEnd.toISOString().slice(0, 10);

        const events = await getNpsService().getAllEvents({
          parkCode,
          dateStart,
          dateEnd,
          limit: 20,
        });

        if (!events || events.length === 0) {
          return res.json({ result: `No events found at ${parkCode.toUpperCase()} between ${dateStart} and ${dateEnd}.` });
        }

        let text = `${events.length} events at ${parkCode.toUpperCase()}:\n`;
        events.slice(0, 5).forEach(e => {
          text += `- ${e.title || 'Event'}`;
          if (e.dateStart || e.dates) text += `, ${e.dateStart || e.dates}`;
          if (e.times?.[0]?.timeStart) text += ` at ${e.times[0].timeStart}`;
          text += '\n';
        });

        return res.json({ result: text.trim() });
      }

      default:
        return res.json({ result: `Unknown tool: ${tool}` });
    }
  } catch (err) {
    console.error('[Voice] Tool execution error:', err);
    res.status(500).json({ error: 'Tool execution failed' });
  }
});

// MCP compatibility transport over the same canonical planning pipeline.
router.post('/plan-itinerary', async (req, res) => {
  const requestStart = Date.now();
  try {
    const body = req.body || {};
    const requestIdentity = resolveAnonymousRequestIdentity(req, body.anonymousId);
    const anonymousId = requestIdentity.anonymousId;

    const session = await AnonymousSession.findOrCreateSession(anonymousId, {
      ipAddress: requestIdentity.ipAddress,
      userAgent: requestIdentity.userAgent || 'mcp',
      browserFingerprint: requestIdentity.browserFingerprint,
    });

    const priorItinerary = session.formData?.lastItinerary || null;
    const enrichedBody = {
      ...body,
      anonymousId,
      metadata: {
        ...(body.metadata || {}),
        priorItinerary,
        planningState: session.planningState || null,
        skipUserContext: true,
        source: body.metadata?.source || 'mcp',
      },
    };

    // Stage 14.8A.2 §3/§6 — the MCP planner shares the AnonymousSession store,
    // so it uses the same logical-turn ledger. It is trusted (not allowance-
    // limited), but its history write is still completion-coupled and atomic:
    // a planner failure leaves no orphan user message behind.
    const mcpTurn = await openGuestTurn({
      anonymousId: session.anonymousId,
      clientTurnId: body.clientTurnId,
      userMessage: {
        role: 'user',
        content: enrichedBody.messages?.slice(-1)[0]?.content || 'Plan itinerary',
      },
      trusted: true,
    });

    let result;
    try {
      if (!isTrailieRuntimeEnabled()) throw Object.assign(new Error('Trailie AI runtime unavailable'), { statusCode: 503, code: 'trailie_runtime_disabled' });
      const preparedContext = await prepareChatContext(enrichedBody, '[AI MCP]', {
        isAnonymous: true, isTrustedMcp: true, req,
        persistedConversationPlan: latestCanonicalPlanFromMessages(session.messages),
      });
      await persistCommittedTripMutation({ message: latestUserText(enrichedBody.messages), preparedContext, session });
      result = await executePlanItineraryRequest({ ...req, body: enrichedBody }, { preparedContext });
    } catch (planError) {
      await mcpTurn.fail(classifyGuestTurnFailure(planError));
      throw planError;
    }

    // Targeted field update rather than saving the document loaded before
    // admission — the in-flight turn record must never be clobbered by a stale
    // in-memory copy of `turns`.
    await AnonymousSession.updateOne(
      { anonymousId: session.anonymousId },
      {
        $set: {
          formData: {
            ...(session.formData || {}),
            lastItinerary: result.itinerary ? {
              parkCode: result.parkCode,
              parkName: result.parkName,
              days: result.itinerary?.days || [],
              criticalNotices: result.criticalNotices || [],
              unverified: result.unverified || [],
            } : session.formData?.lastItinerary || null,
            parkCode: result.parkCode,
          },
          parkCode: result.parkCode,
          parkName: result.parkName,
          lastActivity: new Date(),
        },
      }
    );

    await mcpTurn.complete({
      role: 'assistant',
      content: result.content,
      canonicalPlan: result.canonicalPlan,
      itineraryHash: result.itineraryHash,
      responseTime: Date.now() - requestStart,
    }, { planningState: result.planningState });
    await mcpTurn.settle(GUEST_TURN_FAILURE_CODES.EMPTY_TERMINAL_RESPONSE);

    return res.json({
      success: true,
      data: {
        ...result,
        anonymousId,
        sessionId: anonymousId,
        executionTimeMs: Date.now() - requestStart,
      },
    });
  } catch (error) {
    if (error.code) {
      return res.json({
        success: false,
        error: {
          code: error.code,
          message: error.message,
          field: error.field || null,
        },
      });
    }
    console.error('[AI Plan Itinerary] Error:', error.message);
    return res.status(500).json({
      success: false,
      error: {
        code: 'PLANNER_ERROR',
        message: 'Failed to build itinerary',
      },
    });
  }
});

module.exports = router;
// Exposed for route-contract tests — the shared orchestration seam that plumbs
// canonical evidence from prepareChatContext into the reviewer.
module.exports.processPreparedTrailieResponse = processPreparedTrailieResponse;
// Stage 9 — exposed for request-path review-separation tests.
module.exports.buildCanonicalOutbound = buildCanonicalOutbound;
module.exports.scheduleShadowReview = scheduleShadowReview;
// WP12 — exposed for prep-skip / flag-off contract tests only.
module.exports.prepareChatContext = prepareChatContext;
module.exports.finalizeTrailieNonCompleteResponse = finalizeTrailieNonCompleteResponse;

// Temporary compatibility export; canonical routes use the unversioned function.
module.exports.finalizeV2NonCompleteResponse = finalizeTrailieNonCompleteResponse;
