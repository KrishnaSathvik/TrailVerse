'use strict';

const TrailieEvidenceRefreshLease = require('../models/TrailieEvidenceRefreshLease');
const { createEvidenceBroker } = require('./evidenceBrokerService');
const { evaluateRequirementCoverage } = require('./evidenceCoverageEvaluator');
const {
  acquireEvidenceRefreshLease,
  releaseEvidenceRefreshLease,
} = require('./evidenceRefreshLeaseService');
const { recordEvidenceRefreshEvent } = require('./evidenceRefreshEventService');
const { queryEvidenceForRequirement } = require('./evidenceStoreService');
const { createGeocodeCoordinateEvidenceProvider } = require('./providers/geocodeCoordinateEvidenceProvider');
const { createNpsEvidenceProvider } = require('./providers/npsEvidenceProvider');
const { createRidbEvidenceProvider } = require('./providers/ridbEvidenceProvider');
const { createWeatherEvidenceProvider } = require('./providers/weatherEvidenceProvider');
const { createMapsEvidenceProvider } = require('./providers/mapsEvidenceProvider');
const { createAstronomyEvidenceProvider } = require('./providers/astronomyEvidenceProvider');
const { createFeeFreeDatesEvidenceProvider } = require('./providers/feeFreeDatesEvidenceProvider');
const { createBraveEvidenceProvider } = require('./providers/braveEvidenceProvider');
const { createSerperEvidenceProvider } = require('./providers/serperEvidenceProvider');
const { createTavilyEvidenceProvider } = require('./providers/tavilyEvidenceProvider');
const { createDirectOfficialPageEvidenceProvider } = require('./providers/directOfficialPageEvidenceProvider');
const { createNamedPlaceEvidenceProvider } = require('./providers/namedPlaceEvidenceProvider');
const { createKnownPlaceEvidenceProvider } = require('./providers/knownPlaceEvidenceProvider');
const { createLayeredEvidenceResolver } = require('./layeredEvidenceBroker');
const { createCuratedEvidenceOverlay } = require('./curatedEvidenceOverlay');
const { createCuratedOfficialEvidenceProvider } = require('./providers/curatedOfficialEvidenceProvider');

const wait = (ms, signal) => new Promise((resolve, reject) => {
  const timer = setTimeout(resolve, ms);
  timer.unref?.();
  if (signal) signal.addEventListener('abort', () => {
    clearTimeout(timer);
    reject(Object.assign(new Error('Evidence refresh wait cancelled'), { code: 'evidence_refresh_cancelled' }));
  }, { once: true });
});

async function waitForSharedEvidence({
  requirements = [],
  signal,
  timeoutMs = 2000,
  pollMs = 50,
  now = () => new Date(),
  queryEvidence = (requirement) => queryEvidenceForRequirement({ requirement }),
} = {}) {
  const deadline = Date.now() + timeoutMs;
  do {
    for (const requirement of requirements) {
      const candidates = await queryEvidence(requirement);
      const coverage = evaluateRequirementCoverage(requirement, candidates, { now: now() });
      if (coverage.status === 'satisfied_fresh') return { outcome: 'coalesced_store_update' };
    }
    await wait(pollMs, signal);
  } while (Date.now() < deadline);
  const error = new Error('Timed out waiting for shared evidence refresh');
  error.code = 'refresh_wait_timeout';
  throw error;
}

let singleton = null;

function createDefaultEvidenceProviders() {
  return [
    createNpsEvidenceProvider(),
    createRidbEvidenceProvider(),
    createWeatherEvidenceProvider(),
    createMapsEvidenceProvider(),
    createAstronomyEvidenceProvider(),
    createFeeFreeDatesEvidenceProvider(),
    createKnownPlaceEvidenceProvider(),
    createBraveEvidenceProvider(),
    createSerperEvidenceProvider(),
    createTavilyEvidenceProvider(),
    createDirectOfficialPageEvidenceProvider(),
    createGeocodeCoordinateEvidenceProvider(),
    createNamedPlaceEvidenceProvider(),
  ];
}

function createEvidenceBrokerRuntime() {
  if (singleton) return singleton;
  const broker = createEvidenceBroker({
    providers: createDefaultEvidenceProviders(),
    acquireLease: (args) => acquireEvidenceRefreshLease({
      LeaseModel: TrailieEvidenceRefreshLease,
      ...args,
      now: new Date(),
    }),
    releaseLease: (args) => releaseEvidenceRefreshLease({
      LeaseModel: TrailieEvidenceRefreshLease,
      ...args,
    }),
    waitForRefresh: (args) => waitForSharedEvidence(args),
    recordRefreshEvent: (event) => recordEvidenceRefreshEvent({ event }),
  });
  // Phase 9C.1D.5C-C — authoritative curated official-source evidence is merged
  // after layered resolution. Inert (returns the same bundle) with no records.
  singleton = createCuratedEvidenceOverlay({
    resolver: createLayeredEvidenceResolver({ broker }),
    provider: createCuratedOfficialEvidenceProvider(),
  });
  singleton.dispatchEphemeral = broker.dispatchEphemeral;
  return singleton;
}

function resetEvidenceBrokerRuntimeForTests() {
  singleton = null;
}

module.exports = {
  createDefaultEvidenceProviders,
  createEvidenceBrokerRuntime,
  resetEvidenceBrokerRuntimeForTests,
  waitForSharedEvidence,
};
