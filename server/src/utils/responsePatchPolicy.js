'use strict';

/**
 * Deterministic policy layer between match resolution and patch planning.
 *
 * Matching (responsePatching.js) proves WHERE a quote is. This module decides
 * WHETHER the evidence authorizes changing it, and to what. No LLM is called
 * here; every decision is derived from canonical facts, the immutable itinerary,
 * and explicit user constraints.
 */

const { AUTHORITY, STATUS, WEATHER_MODE } = require('./canonicalFacts');
const { PARK_NAME_TO_CODE } = require('./parkExtractor');

const POLICY_STATUS = {
  APPROVED: 'approved',
  EVIDENCE_MISSING: 'evidence_missing',
  EVIDENCE_OUT_OF_SCOPE: 'evidence_out_of_scope',
  INSUFFICIENT_AUTHORITY: 'insufficient_authority',
  UNSUPPORTED_REPLACEMENT: 'unsupported_replacement',
  UNSUPPORTED_ACTION: 'unsupported_action',
  NOT_CONTRADICTED: 'not_contradicted',
  ITINERARY_EVIDENCE_MISSING: 'itinerary_evidence_missing',
  POLICY_ERROR: 'policy_error',
};

const CLAIM = {
  ASSERTS_REQUIRED: 'asserts_required',
  ASSERTS_NOT_REQUIRED: 'asserts_not_required',
  ASSERTS_CLOSED: 'asserts_closed',
  ASSERTS_OPEN: 'asserts_open',
  ASSERTS_CURRENT_WEATHER: 'asserts_current_weather',
  ASSERTS_FORECAST_WEATHER: 'asserts_forecast_weather',
  ASSERTS_ESTIMATE: 'asserts_estimate',
  NEUTRAL_VERIFICATION: 'neutral_verification',
};

/**
 * Why a mutation was authorized. Distinguishes a proven-false statement from one
 * whose certainty simply outran its evidence — analytics must not conflate them.
 */
const POLICY_BASIS = {
  POSITIVE_CONTRADICTION: 'positive_contradiction',
  CERTAINTY_DOWNGRADE: 'certainty_downgrade',
  ITINERARY_CONFLICT: 'itinerary_conflict',
  CONSTRAINT_CONFLICT: 'constraint_conflict',
  WARNING_ONLY: 'warning_only',
};

/** Code-owned. The reviewer's own `critical` flag is never consulted for enforcement. */
const ISSUE_POLICY = {
  closure_conflict: {
    critical: true,
    requiresPositiveContradiction: true,
    evidenceSource: 'facts',
    evidenceCategories: ['closure', 'caution', 'road', 'info'],
    allowedActions: ['replace', 'delete', 'add_warning'],
  },
  missing_permit_warning: {
    critical: true,
    requiresPositiveContradiction: false,
    evidenceSource: 'facts',
    evidenceCategories: ['permit'],
    allowedActions: ['add_warning', 'replace'],
  },
  unsupported_claim: {
    critical: false,
    requiresPositiveContradiction: true,
    evidenceSource: 'facts',
    evidenceCategories: null,
    allowedActions: ['replace', 'delete', 'add_warning'],
  },
  prose_json_mismatch: {
    critical: false,
    requiresPositiveContradiction: true,
    evidenceSource: 'itinerary',
    allowedActions: ['replace', 'delete'],
  },
  constraint_violation: {
    critical: false,
    requiresPositiveContradiction: true,
    evidenceSource: 'itinerary_or_constraints',
    allowedActions: ['replace', 'delete'],
  },
  drive_time_issue: {
    critical: false,
    requiresPositiveContradiction: true,
    evidenceSource: 'itinerary',
    allowedActions: ['replace'],
  },
};

/** Topics that escalate an unsupported_claim to critical regardless of reviewer opinion. */
const CRITICAL_TOPIC_RE =
  /\b(clos(?:ed|ure|ing)|open|access|permit|reservation|timed entry|safety|hazard|danger|avalanche|flood|wildfire|smoke|storm|road|highway|pass|evacuat|emergency|restrict)/i;

// ---------------------------------------------------------------------------
// Claim classification
// ---------------------------------------------------------------------------

const NEUTRAL_SENTENCE_RE = /\b(check|confirm|verify)\b[^.]*\b(whether|if|current status)\b/i;
const REQUIRED_RE = /\b(?:is|are|will be|remains?)\s+required\b|\brequires?\s+(?:a\s+)?(?:permit|reservation|timed entry)\b|\byou\s+(?:must|need to)\s+(?:get|have|reserve|book|obtain)\b/i;
const NOT_REQUIRED_RE = /\bno\s+(?:permit|reservation|timed entry)[^.]*\b(?:required|needed)\b|\b(?:not|isn't|aren't|no longer)\s+required\b|\bwithout\s+a\s+permit\b/i;
const CLOSED_RE = /\b(?:is|are|remains?|stays?)\s+closed\b|\bclosure\b|\bshut\s+down\b/i;
const OPEN_RE = /\b(?:is|are|remains?|stays?)\s+open\b|\bfully\s+open\b|\breopened\b|\bopen\s+(?:right\s+now|today|currently)\b/i;
const WEATHER_TERM = '(?:rain|snow|sun|storm|temperature|degrees|forecast|wind|clear|cloud|hazard)';
// `\\w*` so inflected forms (raining, storms, clearing) are still detected.
const CURRENT_WEATHER_RE = new RegExp(`\\b(?:today|right now|currently|tonight)\\b[^.]*\\b${WEATHER_TERM}\\w*`, 'i');
const FORECAST_WEATHER_RE = new RegExp(
  `\\b(?:tomorrow|this week|next week|will be|expect)\\b[^.]*\\b${WEATHER_TERM}\\w*|\\bforecast\\w*`,
  'i'
);
const ESTIMATE_RE = /\b(?:typically|usually|on average|historically|generally|expect around|tends to)\b/i;

function splitSentences(text) {
  return String(text || '')
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Semantic claims a piece of text makes. Hedged verification sentences
 * ("check whether a permit is required") assert nothing.
 * @returns {string[]}
 */
function classifyClaims(text) {
  const claims = new Set();

  for (const sentence of splitSentences(text)) {
    if (NEUTRAL_SENTENCE_RE.test(sentence)) {
      claims.add(CLAIM.NEUTRAL_VERIFICATION);
      continue;
    }
    if (NOT_REQUIRED_RE.test(sentence)) claims.add(CLAIM.ASSERTS_NOT_REQUIRED);
    else if (REQUIRED_RE.test(sentence)) claims.add(CLAIM.ASSERTS_REQUIRED);
    if (CLOSED_RE.test(sentence)) claims.add(CLAIM.ASSERTS_CLOSED);
    if (OPEN_RE.test(sentence)) claims.add(CLAIM.ASSERTS_OPEN);
    if (ESTIMATE_RE.test(sentence)) claims.add(CLAIM.ASSERTS_ESTIMATE);
    else {
      if (CURRENT_WEATHER_RE.test(sentence)) claims.add(CLAIM.ASSERTS_CURRENT_WEATHER);
      if (FORECAST_WEATHER_RE.test(sentence)) claims.add(CLAIM.ASSERTS_FORECAST_WEATHER);
    }
  }

  return [...claims];
}

// ---------------------------------------------------------------------------
// Authority / status matrix
// ---------------------------------------------------------------------------

/** Whether a single fact may back a specific semantic claim. */
function factAuthorizesClaim(fact, claim) {
  if (!fact) return false;

  switch (claim) {
    case CLAIM.ASSERTS_CLOSED:
      return (
        fact.source === 'nps' &&
        fact.authority === AUTHORITY.AUTHORITATIVE &&
        fact.status === STATUS.ACTIVE_CLOSURE
      );

    // No canonical status establishes that something is open. A quiet alert feed
    // is listing_not_found, which proves nothing.
    case CLAIM.ASSERTS_OPEN:
      return false;

    case CLAIM.ASSERTS_REQUIRED:
      return (
        fact.authority === AUTHORITY.AUTHORITATIVE && fact.status === STATUS.CONFIRMED_REQUIRED
      );

    case CLAIM.ASSERTS_NOT_REQUIRED:
      return (
        fact.authority === AUTHORITY.AUTHORITATIVE &&
        fact.status === STATUS.CONFIRMED_NOT_REQUIRED
      );

    // Only an observation of today can back "right now" wording. A climate
    // estimate or a future forecast day never can.
    case CLAIM.ASSERTS_CURRENT_WEATHER:
      return fact.category === 'weather' && fact.weatherMode === WEATHER_MODE.CURRENT;

    case CLAIM.ASSERTS_FORECAST_WEATHER:
      return (
        fact.category === 'weather' &&
        [WEATHER_MODE.CURRENT, WEATHER_MODE.FORECAST].includes(fact.weatherMode)
      );

    case CLAIM.ASSERTS_ESTIMATE:
      return fact.category === 'weather';

    case CLAIM.NEUTRAL_VERIFICATION:
      return true;

    default:
      return false;
  }
}

/** A fact positively contradicting the quoted statement, or null. */
function findContradictingFact(matchedText, facts) {
  const quoteClaims = classifyClaims(matchedText);

  for (const fact of facts) {
    // "X is open" contradicted by an active closure naming X.
    if (
      quoteClaims.includes(CLAIM.ASSERTS_OPEN) &&
      fact.status === STATUS.ACTIVE_CLOSURE &&
      fact.authority === AUTHORITY.AUTHORITATIVE &&
      sharesSubject(matchedText, fact)
    ) {
      return fact;
    }
    // "no permit required" contradicted by a confirmed requirement.
    if (
      quoteClaims.includes(CLAIM.ASSERTS_NOT_REQUIRED) &&
      fact.status === STATUS.CONFIRMED_REQUIRED &&
      fact.authority === AUTHORITY.AUTHORITATIVE
    ) {
      return fact;
    }
    // "permit required" contradicted by a confirmed non-requirement.
    if (
      quoteClaims.includes(CLAIM.ASSERTS_REQUIRED) &&
      fact.status === STATUS.CONFIRMED_NOT_REQUIRED &&
      fact.authority === AUTHORITY.AUTHORITATIVE
    ) {
      return fact;
    }
  }

  return null;
}

/** Cheap subject overlap — a fact must mention something the quote mentions. */
function sharesSubject(text, fact) {
  const lower = String(text || '').toLowerCase();
  return (fact.terms || []).some((term) => term.length >= 4 && lower.includes(term));
}

// ---------------------------------------------------------------------------
// Evidence resolution and scope
// ---------------------------------------------------------------------------

/**
 * Park codes a section is about.
 *
 * Derived from the canonical park-name map rather than the fact bundle: a
 * bundle-derived scope cannot see a park it holds no facts for, which would let
 * another park's closure authorize a patch in a section clearly about Olympic.
 */
function deriveSectionParkScope(section, bundle) {
  const text = String(section?.text || '').toLowerCase();
  const parkCodes = new Set();

  for (const [name, entry] of PARK_NAME_TO_CODE) {
    if (name.length < 4) continue;
    if (text.includes(name)) parkCodes.add(entry.code);
  }

  // Fall back to names carried by the facts themselves for anything unmapped.
  for (const fact of bundle.facts || []) {
    if (!fact.parkCode || !fact.parkName) continue;
    if (text.includes(fact.parkName.toLowerCase())) parkCodes.add(fact.parkCode);
  }

  return { parkCodes: [...parkCodes], unknown: parkCodes.size === 0 };
}

/**
 * Build a section's park scope from the most reliable source available.
 * Production callers pass resolved metadata; text matching is only a fallback.
 *
 * @returns {{sectionParkCodes: string[], sectionPlaceNames: string[], scopeSource: string}}
 */
function buildSectionScope({
  section,
  itineraryData = null,
  resolvedParkCodes = [],
  bundle = { facts: [] },
} = {}) {
  const text = String(section?.text || '').toLowerCase();

  // 1. Park codes carried by itinerary stops named in this section.
  const stopCodes = new Set();
  for (const day of itineraryData?.days || []) {
    for (const stop of day.stops || []) {
      if (!stop.parkCode || !stop.name) continue;
      if (text.includes(String(stop.name).toLowerCase())) stopCodes.add(stop.parkCode);
    }
  }
  if (stopCodes.size > 0) {
    return {
      sectionParkCodes: [...stopCodes],
      sectionPlaceNames: [],
      scopeSource: 'itinerary_stops',
    };
  }

  // 3/4. Parks explicitly named in the section text.
  const mentioned = deriveSectionParkScope(section, bundle);

  // 2. Single-park conversations inherit the resolved park unless the section
  //    explicitly discusses somewhere else.
  if (resolvedParkCodes.length > 0) {
    const otherPark = mentioned.parkCodes.find((code) => !resolvedParkCodes.includes(code));
    if (!otherPark) {
      return {
        sectionParkCodes: [...new Set([...resolvedParkCodes, ...mentioned.parkCodes])],
        sectionPlaceNames: [],
        scopeSource: 'resolved_metadata',
      };
    }
    return {
      sectionParkCodes: mentioned.parkCodes,
      sectionPlaceNames: [],
      scopeSource: 'section_mentions',
    };
  }

  if (mentioned.parkCodes.length > 0) {
    return {
      sectionParkCodes: mentioned.parkCodes,
      sectionPlaceNames: [],
      scopeSource: 'section_mentions',
    };
  }

  return { sectionParkCodes: [], sectionPlaceNames: [], scopeSource: 'unknown' };
}

function resolveEvidence({ issue, policy, bundle, itineraryEvidence, scope, mutating }) {
  const requested = Array.isArray(issue.evidenceFactIds) ? issue.evidenceFactIds : [];
  const accepted = [];
  const rejected = [];
  const lookup = { ...bundle.byId, ...itineraryEvidence.byId };

  for (const id of requested) {
    const fact = lookup[id];
    if (!fact) {
      rejected.push({ id, reason: POLICY_STATUS.EVIDENCE_MISSING });
      continue;
    }

    if (
      policy.evidenceCategories &&
      fact.source !== 'itinerary' &&
      !policy.evidenceCategories.includes(fact.category)
    ) {
      rejected.push({ id, reason: 'irrelevant_category' });
      continue;
    }

    // Park-scoped facts must match the section's park. Global facts apply
    // anywhere. Unknown scope never authorizes a cross-park mutation — at most a
    // warning that names the park.
    if (fact.parkCode) {
      const outOfScope = scope.unknown
        ? mutating
        : !scope.parkCodes.includes(fact.parkCode);
      if (outOfScope) {
        rejected.push({ id, reason: POLICY_STATUS.EVIDENCE_OUT_OF_SCOPE });
        continue;
      }
    }

    accepted.push(fact);
  }

  return { accepted, rejected, requested };
}

// ---------------------------------------------------------------------------
// Replacement value validation
// ---------------------------------------------------------------------------

const VALUE_PATTERNS = [
  /https?:\/\/[^\s)\]]+/g,
  /\$\d[\d,]*(?:\.\d{2})?/g,
  /\d+(?:\.\d+)?%/g,
  /\b(?:19|20)\d{2}\b/g,
  /\b\d{1,2}:\d{2}\s*(?:am|pm)?/gi,
  /\b\d+(?:\.\d+)?\s*(?:hours?|hrs?|minutes?|mins?|days?)\b/gi,
  /\b\d+(?:\.\d+)?\s*(?:miles?|mi|km|kilometers?|feet|ft)\b/gi,
];

function extractValues(text) {
  const values = new Set();
  for (const pattern of VALUE_PATTERNS) {
    for (const found of String(text || '').match(pattern) || []) {
      values.add(found.trim().toLowerCase());
    }
  }
  return [...values];
}

/**
 * Every concrete value introduced by a replacement must be supported by accepted
 * facts, the original quote, the immutable itinerary, or explicit constraints.
 */
function findUnsupportedValues({ replacementText, matchedText, acceptedFacts, itineraryData, constraints }) {
  const haystack = [
    matchedText || '',
    ...acceptedFacts.map((f) => `${f.text} ${f.url || ''}`),
    itineraryData ? JSON.stringify(itineraryData) : '',
    constraints ? JSON.stringify(constraints) : '',
  ]
    .join(' ')
    .toLowerCase();

  return extractValues(replacementText).filter((value) => !haystack.includes(value));
}

// ---------------------------------------------------------------------------
// Deterministic renderers for critical live facts
// ---------------------------------------------------------------------------

function parkLabel(fact) {
  return fact.parkName || fact.parkCode || 'this park';
}

function renderClosureCorrection(fact) {
  return `NPS currently reports for ${parkLabel(fact)}: ${fact.text}`;
}

function renderPermitRequiredCorrection(fact) {
  const link = fact.url ? ` See ${fact.url}.` : '';
  return `A permit is required for ${parkLabel(fact)}: ${fact.text}${link}`;
}

/** Must never assert either direction — only that the status needs checking. */
function renderPermitUnknownCorrection(fact) {
  const where = fact.url || 'Recreation.gov';
  return `Check ${where} to confirm whether this permit is currently needed for ${parkLabel(fact)}.`;
}

function renderPermitNotRequiredCorrection(fact) {
  return `No permit is required for ${parkLabel(fact)}: ${fact.text}`;
}

function renderWeatherCorrection(fact) {
  const prefix = fact.weatherMode === 'climate_estimate' ? 'Typical conditions' : 'Current forecast';
  return `${prefix} for ${parkLabel(fact)}: ${fact.text}`;
}

function renderOfficialVerificationWarning(facts) {
  const urls = facts.map((f) => f.url).filter(Boolean);
  const where = urls.length ? urls[0] : 'the official park page';
  return `This detail could not be verified against live data — confirm at ${where} before you go.`;
}

/**
 * Controlled replacement text for a critical claim, with the basis that justifies
 * it. Returns null when no fact supports any safe rewrite.
 * @returns {{text: string, basis: string}|null}
 */
function renderCriticalReplacement(claims, acceptedFacts) {
  const closure = acceptedFacts.find((f) => f.status === STATUS.ACTIVE_CLOSURE);
  if (closure && (claims.includes(CLAIM.ASSERTS_OPEN) || claims.includes(CLAIM.ASSERTS_CLOSED))) {
    return {
      text: renderClosureCorrection(closure),
      basis: POLICY_BASIS.POSITIVE_CONTRADICTION,
    };
  }

  const confirmedRequired = acceptedFacts.find((f) => f.status === STATUS.CONFIRMED_REQUIRED);
  if (confirmedRequired) {
    return {
      text: renderPermitRequiredCorrection(confirmedRequired),
      basis: POLICY_BASIS.POSITIVE_CONTRADICTION,
    };
  }

  const confirmedNot = acceptedFacts.find((f) => f.status === STATUS.CONFIRMED_NOT_REQUIRED);
  if (confirmedNot) {
    return {
      text: renderPermitNotRequiredCorrection(confirmedNot),
      basis: POLICY_BASIS.POSITIVE_CONTRADICTION,
    };
  }

  // Evidence shows only that the response was more certain than the data allows —
  // never that the original statement was proven false.
  const listingOnly = acceptedFacts.find(
    (f) => f.status === STATUS.LISTING_ONLY || f.status === STATUS.STATUS_UNKNOWN
  );
  if (listingOnly) {
    return {
      text: renderPermitUnknownCorrection(listingOnly),
      basis: POLICY_BASIS.CERTAINTY_DOWNGRADE,
    };
  }

  return null;
}

// ---------------------------------------------------------------------------
// Itinerary evidence (built in code — never invented by the model)
// ---------------------------------------------------------------------------

function buildItineraryEvidence(itineraryData) {
  const facts = [];
  const byId = Object.create(null);
  const stopNames = [];

  for (const day of itineraryData?.days || []) {
    for (const stop of day.stops || []) {
      const fact = {
        id: `itinerary:${day.id}:stop:${stop.id}`,
        source: 'itinerary',
        category: 'itinerary_stop',
        status: 'validated_itinerary_stop',
        authority: AUTHORITY.AUTHORITATIVE,
        text: stop.name || '',
        parkCode: null,
        parkName: null,
        url: null,
        terms: [],
      };
      facts.push(fact);
      byId[fact.id] = fact;
      if (stop.name) stopNames.push(String(stop.name).toLowerCase());
    }
  }

  return { facts, byId, stopNames };
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

function result(status, extra = {}) {
  return {
    status,
    derivedCritical: false,
    allowedAction: 'none',
    evidenceFactIds: [],
    acceptedFactIds: [],
    rejectedFactIds: [],
    replacementSource: null,
    policyBasis: null,
    scopeSource: null,
    patch: null,
    reason: status,
    ...extra,
  };
}

/**
 * Decide whether a resolved issue may mutate the response, and how.
 * Never throws — a failure is reported as policy_error with content untouched.
 */
function evaluateIssuePolicy({
  issue,
  match,
  section,
  sectionScope = null,
  canonicalFactBundle,
  itineraryData = null,
  constraints = null,
}) {
  try {
    const policy = ISSUE_POLICY[issue?.type];
    if (!policy) {
      return result(POLICY_STATUS.UNSUPPORTED_ACTION, { reason: 'unknown_issue_type' });
    }

    const bundle = canonicalFactBundle || { facts: [], byId: {} };
    const itineraryEvidence = buildItineraryEvidence(itineraryData);

    // Orchestration supplies scope in production; fall back to text matching.
    const explicitScope =
      sectionScope || buildSectionScope({ section, itineraryData, bundle });
    const scope = {
      parkCodes: explicitScope.sectionParkCodes || [],
      unknown:
        explicitScope.scopeSource === 'unknown' ||
        (explicitScope.sectionParkCodes || []).length === 0,
      source: explicitScope.scopeSource,
    };

    // Criticality is code-derived. A reviewer cannot downgrade a closure conflict,
    // nor escalate harmless prose.
    const derivedCritical =
      policy.critical ||
      (issue.type === 'unsupported_claim' && CRITICAL_TOPIC_RE.test(match.matchedText || ''));

    const requestedAction = issue.action;
    if (!policy.allowedActions.includes(requestedAction)) {
      return result(POLICY_STATUS.UNSUPPORTED_ACTION, {
        derivedCritical,
        reason: `action_${requestedAction}_not_allowed_for_${issue.type}`,
      });
    }

    const mutating = requestedAction === 'replace' || requestedAction === 'delete';
    const evidence = resolveEvidence({
      issue,
      policy,
      bundle,
      itineraryEvidence,
      scope,
      mutating,
    });
    const evidenceIds = {
      evidenceFactIds: evidence.requested,
      acceptedFactIds: evidence.accepted.map((f) => f.id),
      rejectedFactIds: evidence.rejected.map((r) => r.id),
    };

    if (evidence.rejected.some((r) => r.reason === POLICY_STATUS.EVIDENCE_MISSING)) {
      return result(POLICY_STATUS.EVIDENCE_MISSING, { derivedCritical, ...evidenceIds });
    }
    if (evidence.rejected.some((r) => r.reason === POLICY_STATUS.EVIDENCE_OUT_OF_SCOPE)) {
      return result(POLICY_STATUS.EVIDENCE_OUT_OF_SCOPE, { derivedCritical, ...evidenceIds });
    }
    if (evidence.accepted.length === 0) {
      const missing =
        policy.evidenceSource === 'facts'
          ? POLICY_STATUS.EVIDENCE_MISSING
          : POLICY_STATUS.ITINERARY_EVIDENCE_MISSING;
      return result(missing, { derivedCritical, ...evidenceIds });
    }

    // --- itinerary-sourced issues -----------------------------------------
    if (policy.evidenceSource !== 'facts') {
      const quoteNamesExistingStop = itineraryEvidence.stopNames.some((name) =>
        String(match.matchedText || '').toLowerCase().includes(name)
      );
      if (quoteNamesExistingStop) {
        return result(POLICY_STATUS.NOT_CONTRADICTED, {
          derivedCritical,
          ...evidenceIds,
          reason: 'quote_matches_validated_itinerary_stop',
        });
      }

      const replacement = requestedAction === 'delete' ? null : String(issue.replacementText || '');
      if (requestedAction === 'replace') {
        const unsupported = findUnsupportedValues({
          replacementText: replacement,
          matchedText: match.matchedText,
          acceptedFacts: evidence.accepted,
          itineraryData,
          constraints,
        });
        if (unsupported.length > 0) {
          return result(POLICY_STATUS.UNSUPPORTED_REPLACEMENT, {
            derivedCritical,
            ...evidenceIds,
            reason: `unsupported_values:${unsupported.join(',')}`,
          });
        }
      }

      return result(POLICY_STATUS.APPROVED, {
        derivedCritical,
        allowedAction: requestedAction,
        replacementSource: requestedAction === 'delete' ? null : 'model',
        policyBasis:
          issue.type === 'constraint_violation'
            ? POLICY_BASIS.CONSTRAINT_CONFLICT
            : POLICY_BASIS.ITINERARY_CONFLICT,
        scopeSource: scope.source,
        ...evidenceIds,
        patch: {
          issue: { ...issue, action: requestedAction, replacementText: replacement },
          match,
        },
      });
    }

    // --- fact-sourced issues ----------------------------------------------
    const contradiction = findContradictingFact(match.matchedText, evidence.accepted);

    if (policy.requiresPositiveContradiction && !contradiction) {
      // Absence of support is not proof of falsehood. Never delete; at most warn.
      if (requestedAction === 'delete') {
        return result(POLICY_STATUS.NOT_CONTRADICTED, {
          derivedCritical,
          ...evidenceIds,
          reason: 'delete_requires_positive_contradiction',
        });
      }
      if (derivedCritical && policy.allowedActions.includes('add_warning')) {
        return result(POLICY_STATUS.APPROVED, {
          derivedCritical,
          allowedAction: 'add_warning',
          ...evidenceIds,
          reason: 'downgraded_to_warning_no_contradiction',
          replacementSource: 'renderer',
          policyBasis: POLICY_BASIS.WARNING_ONLY,
          scopeSource: scope.source,
          patch: {
            issue: {
              ...issue,
              action: 'add_warning',
              replacementText: renderOfficialVerificationWarning(evidence.accepted),
            },
            match,
          },
        });
      }
      return result(POLICY_STATUS.NOT_CONTRADICTED, { derivedCritical, ...evidenceIds });
    }

    // Prefer a deterministic renderer for critical claims over model prose. The
    // model's text is discarded entirely in that case, so record which won.
    let replacementText = issue.replacementText;
    let allowedAction = requestedAction;
    let replacementSource = requestedAction === 'delete' ? null : 'model';
    let policyBasis = contradiction
      ? POLICY_BASIS.POSITIVE_CONTRADICTION
      : POLICY_BASIS.CERTAINTY_DOWNGRADE;

    if (derivedCritical && requestedAction !== 'delete') {
      const claims = classifyClaims(match.matchedText || '');
      const rendered = renderCriticalReplacement(claims, evidence.accepted);
      if (rendered) {
        replacementText = rendered.text;
        allowedAction = 'replace';
        replacementSource = 'renderer';
        policyBasis = rendered.basis;
      }
    }

    if (allowedAction === 'replace') {
      if (!String(replacementText || '').trim()) {
        return result(POLICY_STATUS.UNSUPPORTED_REPLACEMENT, {
          derivedCritical,
          ...evidenceIds,
          reason: 'empty_replacement',
        });
      }

      // The replacement may not assert more than its evidence permits.
      for (const claim of classifyClaims(replacementText)) {
        if (claim === CLAIM.NEUTRAL_VERIFICATION) continue;
        if (!evidence.accepted.some((fact) => factAuthorizesClaim(fact, claim))) {
          return result(POLICY_STATUS.INSUFFICIENT_AUTHORITY, {
            derivedCritical,
            ...evidenceIds,
            reason: `claim_${claim}_unsupported_by_evidence`,
          });
        }
      }

      const unsupported = findUnsupportedValues({
        replacementText,
        matchedText: match.matchedText,
        acceptedFacts: evidence.accepted,
        itineraryData,
        constraints,
      });
      if (unsupported.length > 0) {
        return result(POLICY_STATUS.UNSUPPORTED_REPLACEMENT, {
          derivedCritical,
          ...evidenceIds,
          reason: `unsupported_values:${unsupported.join(',')}`,
        });
      }
    }

    return result(POLICY_STATUS.APPROVED, {
      derivedCritical,
      allowedAction,
      replacementSource,
      policyBasis,
      scopeSource: scope.source,
      ...evidenceIds,
      patch: {
        issue: { ...issue, action: allowedAction, replacementText },
        match,
      },
    });
  } catch (err) {
    return result(POLICY_STATUS.POLICY_ERROR, { reason: err.message });
  }
}

module.exports = {
  POLICY_STATUS,
  POLICY_BASIS,
  CLAIM,
  buildSectionScope,
  ISSUE_POLICY,
  classifyClaims,
  factAuthorizesClaim,
  findContradictingFact,
  deriveSectionParkScope,
  extractValues,
  findUnsupportedValues,
  buildItineraryEvidence,
  renderClosureCorrection,
  renderPermitRequiredCorrection,
  renderPermitUnknownCorrection,
  renderPermitNotRequiredCorrection,
  renderWeatherCorrection,
  renderOfficialVerificationWarning,
  evaluateIssuePolicy,
};
