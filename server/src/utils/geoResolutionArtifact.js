'use strict';

/**
 * Phase 9B.2B — evidence-bound authoritative coordinate resolution.
 *
 * This module never establishes place IDENTITY. It resolves COORDINATES for
 * a stop whose identity is already grounded — after `resolveStopIdentities`
 * (stopIdentityResolution.js) runs, every experiential stop that survived
 * validation already carries `evidenceRef`/`canonicalPlaceName`; an unbound
 * experiential stop fails the attempt before this module ever runs. So the
 * eligibility question here is narrow: does an already-grounded place lack
 * AUTHORITATIVE coordinates (Phase 9B.1, coordinateValidation.js), and if
 * so, can an external lookup supply them?
 *
 * Does NOT mutate the frozen pre-generation evidence bundle and does NOT
 * touch it at all — this operates purely on the generated candidate
 * itinerary, post stop-identity-resolution. The returned artifact is
 * immutable data describing one attempt's geographic-resolution outcome,
 * fingerprinted over the CANDIDATE stop set so a retry whose stops differ
 * can never reuse a prior attempt's geography (attempt 1's Norris cannot
 * validate attempt 2's West Thumb).
 */

const crypto = require('crypto');
const { classifyStop } = require('./itineraryCompleteness');
const { isAuthoritativeCoordinateSource } = require('./coordinateValidation');

function stopsOf(itineraryData) {
  const out = [];
  for (const day of itineraryData?.days || []) {
    for (const stop of day?.stops || []) out.push({ day, stop });
  }
  return out;
}

/** Deterministic candidate-input identity for one stop, BEFORE resolution runs. */
function stopCandidateKey({ day, stop }, itineraryData) {
  return {
    dayNumber: day?.dayNumber ?? null,
    order: stop?.order ?? null,
    stopId: stop?.id ?? null,
    name: String(stop?.name || '').trim().toLowerCase(),
    parkCode: stop?.parkCode || null,
    // Phase 9B.2C — authoritative park context, carried alongside the key so
    // a resolver can corroborate a geocoder result without re-deriving it.
    parkName: stop?.parkName || itineraryData?.parkName || null,
    evidenceRef: stop?.evidenceRef || null,
    canonicalPlaceName: stop?.canonicalPlaceName || null,
  };
}

/**
 * Fingerprints the CANDIDATE INPUT set — not only successfully resolved
 * identities — so the fingerprint differs before any geographic result
 * exists whenever the candidate stops themselves differ between attempts.
 */
function fingerprintCandidateStops(itineraryData) {
  const keys = stopsOf(itineraryData).map((entry) => stopCandidateKey(entry, itineraryData));
  return crypto.createHash('sha256').update(JSON.stringify(keys), 'utf8').digest('hex');
}

function buildGeocodeQuery({ stop, itineraryData }) {
  const place = stop.canonicalPlaceName;
  const parkName = stop.parkName || itineraryData?.parkName || null;
  return parkName ? `${place}, ${parkName}` : place;
}

/**
 * Decide, for every stop in the candidate itinerary, whether coordinate
 * resolution should be requested. Read-only — makes no calls, mutates
 * nothing. This is the eligibility gate:
 *   experiential (classifyStop)
 *   + already evidence-bound (evidenceRef AND canonicalPlaceName)
 *   + coordinates not already authoritative (Phase 9B.1 policy)
 *   → requested
 * Everything else is explicitly skipped with a reason, never silently.
 */
function planGeoResolution(itineraryData) {
  const fingerprint = fingerprintCandidateStops(itineraryData);
  const entries = [];
  for (const { day, stop } of stopsOf(itineraryData)) {
    const key = stopCandidateKey({ day, stop }, itineraryData);
    if (!stop?.name) {
      entries.push({ ...key, status: 'skipped_no_name' });
      continue;
    }
    if (classifyStop(stop) !== 'experiential') {
      entries.push({ ...key, status: 'skipped_non_experiential' });
      continue;
    }
    if (!stop.evidenceRef || !stop.canonicalPlaceName) {
      entries.push({ ...key, status: 'skipped_unbound_identity' });
      continue;
    }
    if (isAuthoritativeCoordinateSource(stop.coordinateSource)) {
      entries.push({ ...key, status: 'skipped_already_authoritative' });
      continue;
    }
    entries.push({ ...key, status: 'requested', query: buildGeocodeQuery({ stop, itineraryData }) });
  }
  return { fingerprint, entries };
}

function stopLookupKey(entry) {
  return `${entry.dayNumber ?? ''}|${entry.stopId ?? entry.order ?? ''}|${entry.name}`;
}

/**
 * Execute the resolution plan and apply successful results onto a COPY of
 * the itinerary. `resolveStopCoordinates` is the only I/O seam — an
 * injected `async ({ query, key, signal }) => { latitude, longitude,
 * coordinateSource, providerSource } | null`. Absent (the default) means
 * "no resolver available": every requested entry is left unresolved and
 * zero calls are made — the same fail-safe convention already used for
 * `loadTargetPlan`/`resolveEvidence` elsewhere in this codebase.
 *
 * A resolver result is only ever applied if it independently satisfies
 * Phase 9B.1's authority policy (`isAuthoritativeCoordinateSource`) — a
 * resolver that hands back an untrusted/unspecified source cannot
 * establish authority merely by being asked.
 */
async function resolveGeoArtifactForAttempt({ itineraryData, resolveStopCoordinates = null, signal, requestId, attempt = null, dispatchIndex = null, evidenceBundle } = {}) {
  const plan = planGeoResolution(itineraryData);
  const hasWork = plan.entries.some((entry) => entry.status === 'requested');

  if (!hasWork || typeof resolveStopCoordinates !== 'function') {
    return {
      fingerprint: plan.fingerprint,
      candidateFingerprint: plan.fingerprint,
      counts: summarizeGeoResolution(plan.entries, 0),
      entries: plan.entries.map((entry) => (
        entry.status === 'requested' ? { ...entry, status: 'unresolved_no_provider' } : entry
      )),
      itineraryData,
      resolvedCount: 0,
    };
  }

  const next = JSON.parse(JSON.stringify(itineraryData));
  const byKey = new Map();
  for (const { day, stop } of stopsOf(next)) {
    byKey.set(stopLookupKey(stopCandidateKey({ day, stop }, next)), stop);
  }

  const finalEntries = [];
  let resolvedCount = 0;
  let dispatches = 0;
  for (const entry of plan.entries) {
    if (entry.status !== 'requested') {
      finalEntries.push(entry);
      continue;
    }

    if (signal?.aborted) {
      finalEntries.push({ ...entry, status: 'cancelled' });
      continue;
    }
    let result = null;
    try {
      // eslint-disable-next-line no-await-in-loop
      result = await resolveStopCoordinates({
        query: entry.query, key: entry, signal, requestId, evidenceBundle,
        onDispatch: () => { dispatches += 1; },
        ownership: { attempt, dispatchIndex, candidateFingerprint: plan.fingerprint },
      });
    } catch (error) {
      const cancelled = signal?.aborted || ['ABORT_ERR', 'provider_cancelled'].includes(error?.code);
      finalEntries.push({ ...entry, status: cancelled ? 'cancelled' : 'provider_failure',
        errorCode: cancelled ? 'provider_cancelled'
          : (['provider_timeout', 'coordinate_ownership_mismatch', 'coordinate_binding_invalid'].includes(error?.code)
            ? error.code : 'coordinate_provider_failure') });
      continue;
    }

    if (signal?.aborted) {
      finalEntries.push({ ...entry, status: 'cancelled' });
      continue;
    }
    if (!result || !Number.isFinite(result.latitude) || !Number.isFinite(result.longitude)) {
      finalEntries.push({ ...entry, status: 'unresolved_no_result' });
      continue;
    }
    if (!isAuthoritativeCoordinateSource(result.coordinateSource)) {
      finalEntries.push({ ...entry, status: 'unresolved_untrusted_source' });
      continue;
    }

    const stop = byKey.get(stopLookupKey(entry));
    if (!stop) {
      finalEntries.push({ ...entry, status: 'unresolved_stop_not_found' });
      continue;
    }
    stop.latitude = result.latitude;
    stop.longitude = result.longitude;
    stop.coordinateSource = result.coordinateSource;
    resolvedCount += 1;
    finalEntries.push({
      ...entry,
      status: 'resolved',
      coordinateSource: result.coordinateSource,
      providerSource: result.providerSource || null,
    });
  }

  const stale = fingerprintCandidateStops(itineraryData) !== plan.fingerprint;
  const discard = signal?.aborted || stale;
  const entries = discard ? finalEntries.map((entry) => entry.status === 'resolved'
    ? { ...entry, status: signal?.aborted ? 'cancelled' : 'ownership_mismatch' } : entry) : finalEntries;
  return {
    fingerprint: plan.fingerprint, candidateFingerprint: plan.fingerprint,
    entries, itineraryData: discard ? itineraryData : next,
    resolvedCount: discard ? 0 : resolvedCount,
    counts: summarizeGeoResolution(entries, dispatches),
  };
}

function summarizeGeoResolution(entries, dispatches) {
  const count = (status) => entries.filter((entry) => entry.status === status).length;
  return {
    eligibleStops: entries.filter((entry) => !entry.status.startsWith('skipped_')).length,
    dispatches,
    authoritative: count('resolved'),
    rejectedByAuthority: count('unresolved_untrusted_source'),
    noResult: count('unresolved_no_result'),
    providerFailure: count('provider_failure'),
    cancelled: count('cancelled'),
  };
}

module.exports = {
  fingerprintCandidateStops,
  planGeoResolution,
  resolveGeoArtifactForAttempt,
};
