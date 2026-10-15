'use strict';

/**
 * Repairs approved after the 2026-10-12 root-cause diagnosis:
 *   A. research relevance + official source preservation
 *   B. current-turn hard-constraint authority independent of memory admission
 * plus the diagnosis-capture field mapping.
 */

const { orderEvidenceForRead } = require('../../utils/evidenceReadRelevance');
const { resolveHardConstraints, serializeHardConstraints } = require('../../utils/hardConstraintAuthority');
const { createEvidenceReader } = require('../trailieSimpleTools');
const { createSimpleTravelTools } = require('../trailieTravelData');
const { validateSimpleMutation } = require('../trailieSimpleGuard');
const { createMemoryAuthorityVerifier } = require('../trailieMemoryAuthority');
const { normalizeEvidenceLocation } = require('../../utils/trailieCanonicalLocation');
const { modelEvidenceRow } = require('../../utils/modelEvidenceView');

const NOW = new Date('2026-10-12T12:00:00Z');
const observation = { observedAt: NOW.toISOString(), expiresAt: new Date(+NOW + 86400000).toISOString() };
const PAD = 'Official description text. '.repeat(110); // ~3 KB, like real NPS thingstodo rows

const row = (name, value = {}, extra = {}) => ({
  evidenceId: `ev:${name}`, topic: 'activities', entityId: `ev:${name}`,
  claim: { identity: name, text: `${name}: description`, normalizedValue: { name, ...value } },
  source: { provider: 'nps', sourceClass: 'official_owner' }, observation, ...extra,
});
const names = (rows) => rows.map((r) => r.claim.normalizedValue.name);

describe('A. evidence ordering before the per-read budget', () => {
  test('a place the model asked to resolve outranks provider order', () => {
    const rows = ['Creek Trail', 'Upper Pools', 'Sand Bench', "Pa'rus Trail"].map((n) => row(n));
    expect(names(orderEvidenceForRead(rows, { places: ["Pa’rus Trail"] }))[0]).toBe("Pa'rus Trail");
  });

  test('avoidExposure promotes confirmed low exposure without any shared keywords', () => {
    const rows = [row('Ridge Route', { exposureLevel: 'high' }), row('Canyon Floor Path', { exposureLevel: 'low' })];
    const ordered = orderEvidenceForRead(rows, { query: 'easy walks with views', constraints: { avoidExposure: true } });
    expect(names(ordered)).toEqual(['Canyon Floor Path', 'Ridge Route']);
  });

  test('official access facts survive even when they share no words with the request', () => {
    const rows = [row('Easy views walk'), row('Shuttle corridor', { operationalFacts: [{ type: 'vehicle_restriction' }] })];
    expect(names(orderEvidenceForRead(rows, { query: 'easy views walk' }))[0]).toBe('Shuttle corridor');
  });

  test('keyword overlap only breaks ties; equal rows keep provider order', () => {
    const rows = [row('Alpha'), row('Beta'), row('Gamma')];
    expect(names(orderEvidenceForRead(rows, {}))).toEqual(['Alpha', 'Beta', 'Gamma']);
    const keywordOnly = orderEvidenceForRead([row('Waterfall waterfall waterfall'), row('Requested Spot')], { query: 'waterfall', places: ['Requested Spot'] });
    expect(names(keywordOnly)[0]).toBe('Requested Spot');
  });
});

describe('A. evidence reader keeps the same budget and returns a reserve', () => {
  const candidate = (name, value = {}) => ({ topic: 'activities', entityId: name, observedAt: NOW.toISOString(),
    claim: { identity: name, text: `${name}: ${PAD}`, normalizedValue: { name, ...value } },
    source: { provider: 'nps', sourceClass: 'official_owner', url: 'https://www.nps.gov/x' } });

  test('requested place is selected; over-budget rows go to reserve, not to the model', async () => {
    const all = Array.from({ length: 12 }, (_, i) => candidate(`Activity ${i}`));
    all.push(candidate("Pa'rus Trail", { exposureLevel: 'low' }));
    const reader = createEvidenceReader({ broker: { dispatchEphemeral: async () => ({ status: 'fulfilled', normalizedCandidates: all }) }, now: () => NOW });
    const result = await reader.execute('read_travel', { provider: 'nps', topic: 'activities', entity: { entityId: 'nps:park:zion', displayName: 'Zion' },
      query: 'easy walks', relevance: { places: ["Pa'rus Trail"], constraints: { avoidExposure: true } } }, { requestId: 'r' });
    const selectedBytes = result.evidence.reduce((n, e) => n + Buffer.byteLength(JSON.stringify(modelEvidenceRow(e))) + 1, 2);
    expect(result.evidence.length).toBeLessThanOrEqual(8);
    expect(selectedBytes).toBeLessThanOrEqual(12000);
    expect(names(result.evidence)[0]).toBe("Pa'rus Trail");
    expect(result.evidence.length + result.reserve.length).toBe(13);
    expect(result.omittedEvidenceCount).toBe(result.reserve.length);
  });
});

describe('A. named places bind to the official record when one exists', () => {
  const official = (name, value = {}) => ({ topic: 'activities', entityId: `nps:${name}`, observedAt: NOW.toISOString(),
    claim: { identity: `nps:${name}`, text: `${name}: ${PAD}`, normalizedValue: { name, latitude: 37.2, longitude: -112.98, ...value } },
    source: { provider: 'nps', sourceClass: 'official_owner', url: 'https://www.nps.gov/zion' } });
  const commercial = (name) => ({ topic: 'activities', entityId: `google:${name}`, observedAt: NOW.toISOString(),
    claim: { identity: `google:${name}`, status: 'resolved_place_identity', normalizedValue: { name, requestedName: name, latitude: 37.21, longitude: -112.97 } },
    source: { provider: 'named_place', sourceClass: 'commercial_structured' } });

  function backend(options = {}) {
    const filler = Array.from({ length: 10 }, (_, i) => official(`Unrelated activity ${i}`));
    const broker = { dispatchEphemeral: jest.fn(async ({ requirement: r }) => {
      if (r.topic === 'activities' && r.preferredProviders[0] === 'nps') {
        return { status: 'fulfilled', normalizedCandidates: [...filler, official("Pa'rus Trail", { exposureLevel: 'low' }), official('Court of the Patriarchs')] };
      }
      if (r.topic === 'activities' && r.preferredProviders[0] === 'named_place') {
        return { status: 'fulfilled', normalizedCandidates: [commercial(r.entity.displayName)] };
      }
      if (r.topic === 'alerts_closures') {
        return { status: 'fulfilled', normalizedCandidates: [{ ...official('Road closure alert'), topic: 'alerts_closures',
          claim: { identity: 'alert', text: 'Road closed', normalizedValue: {} } }] };
      }
      return { status: 'unsupported', normalizedCandidates: [] };
    }) };
    const tools = createSimpleTravelTools({ broker, now: () => NOW, ...options,
      destinationResolver: async () => ({ entityId: 'nps:park:zion', displayName: 'Zion National Park', latitude: 37.3, longitude: -113, sourceClass: 'official_owner' }) });
    return { broker, tools };
  }

  test('reserved official record is promoted instead of a commercial identity, with no extra provider call', async () => {
    const { broker, tools } = backend();
    const result = await tools.execute('read_travel', { destination: 'Zion National Park', question: 'Easy walks, no exposure',
      places: ["Pa'rus Trail", 'Checkerboard Mesa'], constraints: { avoidExposure: true } }, { requestId: 'q', userMessage: 'x' });
    const parus = result.namedPlaceResolutions.find((p) => p.requestedName === "Pa'rus Trail");
    const bound = result.evidence.find((e) => e.evidenceId === parus.evidenceRef);
    expect(bound.source.provider).toBe('nps');
    expect(bound.claim.normalizedValue.exposureLevel).toBe('low');
    const namedCalls = broker.dispatchEphemeral.mock.calls.filter(([{ requirement }]) => requirement.preferredProviders[0] === 'named_place');
    expect(namedCalls.map(([{ requirement }]) => requirement.entity.displayName)).toEqual(['Checkerboard Mesa']);
    // No exact official record: the generic identity remains the honest answer.
    const mesa = result.namedPlaceResolutions.find((p) => p.requestedName === 'Checkerboard Mesa');
    expect(result.evidence.find((e) => e.evidenceId === mesa.evidenceRef).source.provider).toBe('named_place');
  });

  test('a typographic apostrophe names the same official place (live R02 after-repair failure)', async () => {
    const { broker, tools } = backend();
    const result = await tools.execute('read_travel', { destination: 'Zion National Park', question: 'Easy walks',
      places: ['Pa’rus Trail'], constraints: { avoidExposure: true } }, { requestId: 'q3', userMessage: 'x' });
    const parus = result.namedPlaceResolutions.find((p) => p.requestedName === 'Pa’rus Trail');
    expect(result.evidence.find((e) => e.evidenceId === parus.evidenceRef).source.provider).toBe('nps');
    expect(broker.dispatchEphemeral.mock.calls.some(([{ requirement }]) => requirement.preferredProviders[0] === 'named_place')).toBe(false);
  });

  test('research annotates eligible and unknown places before planning, preserving evidence and budget', async () => {
    const { tools } = backend();
    const result = await tools.execute('read_travel', { destination: 'Zion National Park', question: 'Easy walks',
      places: ["Pa'rus Trail", 'Court of the Patriarchs'] }, { requestId: 'annotations', userMessage: 'Plan',
      snapshot: { planningState: { validationConstraints: { avoidExposure: true }, preferences: { fitness: 'easy' } } } });
    const facts = result.modelContext.facts;
    const parus = facts.find(f => f.value?.name === "Pa'rus Trail");
    const court = facts.find(f => f.value?.name === 'Court of the Patriarchs');
    expect(parus.eligibility).toMatchObject({ status: 'eligible', restrictions: { avoidExposure: true } });
    expect(court.eligibility).toMatchObject({ status: 'unknown', reasonCodes: ['constraint_eligibility_unknown'] });
    for (const fact of [parus, court]) {
      const original = result.evidence.find(e => e.evidenceId === fact.evidenceId);
      expect(fact.fact).toBe(original.claim.text);
      expect(fact.value).toEqual(original.claim.normalizedValue);
      expect(fact.source).toBe(original.source.url);
    }
    expect(facts.length).toBeLessThanOrEqual(48);
    expect(facts.reduce((n, f) => n + Buffer.byteLength(JSON.stringify(f)), 0)).toBeLessThanOrEqual(28000);
  });

  test('unrequested reserve rows never reach the model, and access facts precede discovery rows', async () => {
    const { tools } = backend();
    const result = await tools.execute('read_travel', { destination: 'Zion National Park', question: 'Easy walks',
      places: ["Pa'rus Trail"] }, { requestId: 'q2', userMessage: 'x' });
    const factNames = result.modelContext.facts.map((f) => f.value?.name);
    expect(factNames).not.toContain('Court of the Patriarchs');
    const firstAlert = result.modelContext.facts.findIndex((f) => f.topic === 'alerts_closures');
    const firstUnrequested = result.modelContext.facts.findIndex((f) => /Unrelated activity/.test(f.value?.name || ''));
    expect(result.modelContext.facts[0].value.name).toBe("Pa'rus Trail");
    expect(firstAlert).toBeGreaterThan(-1);
    expect(firstAlert).toBeLessThan(firstUnrequested);
  });

  test('inactive reserve discovery changes nothing; opt-in adds model choices without provider work or guard authority', async () => {
    const baseline = backend();
    const visible = backend({ reserveDiscovery: true });
    const args = { destination: 'Zion National Park', question: 'Easy walks', constraints: { avoidExposure: true } };
    const context = { requestId: 'reserve-visibility', userMessage: 'Plan easy walks with no exposure.' };
    const before = await baseline.tools.execute('read_travel', args, context);
    const after = await visible.tools.execute('read_travel', args, context);

    expect(before.evidenceDelivery.reserveDiscovery).toBe(false);
    expect(before.evidenceDelivery.deliveredReserveRecords).toBe(0);
    expect(after.evidenceDelivery.reserveDiscovery).toBe(true);
    expect(after.evidenceDelivery.deliveredReserveRecords).toBeGreaterThan(0);
    expect(after.modelContext.facts.length).toBeGreaterThan(before.modelContext.facts.length);
    expect(after.evidence).toHaveLength(before.evidence.length);
    expect(after.evidenceDelivery.modelContextBytes).toBeLessThanOrEqual(36000);
    expect(after.evidenceDelivery.modelContextWithinCeiling).toBe(true);
    expect(visible.broker.dispatchEphemeral).toHaveBeenCalledTimes(baseline.broker.dispatchEphemeral.mock.calls.length);
    expect(visible.broker.dispatchEphemeral.mock.calls.some(([{ requirement }]) => ['named_place', 'geocode_coordinate'].includes(requirement.preferredProviders[0]))).toBe(false);

    const activeIds = new Set(after.evidence.map(e => e.evidenceId));
    const discovered = after.modelContext.facts.find(f => !activeIds.has(f.evidenceId));
    expect(discovered).toBeDefined();
    expect(after.evidence.some(e => e.evidenceId === discovered.evidenceId)).toBe(false);
  });

  test('whole research envelope drops only reserve facts at its explicit ceiling', async () => {
    const { tools } = backend({ reserveDiscovery: true, modelContextCeilingBytes: 12000 });
    const result = await tools.execute('read_travel', { destination: 'Zion National Park', question: 'Easy walks' },
      { requestId: 'reserve-ceiling', userMessage: 'Plan easy walks.' });
    expect(result.evidenceDelivery.reserveFactsDroppedForEnvelope).toBeGreaterThan(0);
    expect(result.evidenceDelivery.modelContextBytes).toBeLessThanOrEqual(12000);
    expect(result.evidenceDelivery.modelContextWithinCeiling).toBe(true);
    expect(result.modelContext.facts.filter(f => result.evidence.some(e => e.evidenceId === f.evidenceId)).length).toBeGreaterThan(0);
  });
});

describe('B. hard-constraint authority', () => {
  const update = (field, value, sourceQuote = 'No scary exposed hikes.') => ({ field, value, sourceQuote });
  const message = '4 days in Zion. No scary exposed hikes. Easy walks.';

  test('read_travel constraints alone arm the restriction', () => {
    expect(resolveHardConstraints({ turnConstraints: [{ avoidExposure: true, fitness: 'easy walks' }], message }).avoidExposure).toBe(true);
  });

  test('a restriction survives an unsupported sibling key (the R09 failure)', () => {
    const u = update('preferences', { avoidExposure: true, fitness: 'easy walks' });
    const armed = resolveHardConstraints({ proposedUpdates: [u], message,
      relationship: (_, key) => (key === 'fitness' ? 'unsupported' : 'explicit'), admitted: () => false });
    expect(armed.avoidExposure).toBe(true);
  });

  test('a contradicted or hypothetical restriction does not arm', () => {
    for (const verdict of ['contradicted', 'hypothetical', 'conditional']) {
      expect(resolveHardConstraints({ proposedUpdates: [update('preferences', { avoidExposure: true })], message,
        relationship: () => verdict }).avoidExposure).toBe(false);
    }
  });

  test('an unquoted update cannot arm', () => {
    expect(resolveHardConstraints({ proposedUpdates: [update('preferences', { avoidExposure: true }, 'not in message')], message }).avoidExposure).toBe(false);
  });

  test('prior validation persists; only admitted traveler words loosen it', () => {
    const prior = { avoidExposure: true, mobility: { maxWalkMilesPerSegment: 2 } };
    expect(serializeHardConstraints(resolveHardConstraints({ priorValidation: prior, message: 'Make day 2 easier' }))).toEqual(prior);
    const loosen = [update('preferences', { avoidExposure: false }, 'Exposure is fine now'), update('mobility', { maxWalkMilesPerSegment: 5 }, 'Exposure is fine now')];
    expect(resolveHardConstraints({ priorValidation: prior, proposedUpdates: loosen, message: 'Exposure is fine now', admitted: () => false }))
      .toMatchObject({ avoidExposure: true, mobility: { maxWalkMilesPerSegment: 2 } });
    expect(resolveHardConstraints({ priorValidation: prior, proposedUpdates: loosen, message: 'Exposure is fine now', admitted: () => true }))
      .toMatchObject({ avoidExposure: false, mobility: { maxWalkMilesPerSegment: 5 } });
  });

  test('limits only tighten across sources', () => {
    const armed = resolveHardConstraints({ priorValidation: { mobility: { maxWalkMilesPerSegment: 3 } },
      turnConstraints: [{ mobility: { maxWalkMilesPerSegment: 1.5, wheelchair: true } }], message });
    expect(armed.mobility).toEqual({ maxWalkMilesPerSegment: 1.5, wheelchair: true });
  });
});

describe('B. guard enforces the restriction regardless of memory admission', () => {
  const source = (value = {}) => normalizeEvidenceLocation({
    evidenceId: 'e', topic: 'activities', entityId: 'e',
    claim: { identity: 'place-e', normalizedValue: { name: 'Riverside Walk', countryCode: 'US', latitude: 37.28, longitude: -112.95, ...value } },
    source: { provider: 'named_place', sourceClass: 'commercial_structured', sourceId: 'e' }, observation,
  });
  const message = '4 days in Zion. No scary exposed hikes. Easy walks.';
  const proposal = (memoryUpdates = []) => ({
    response: 'An easy canyon walk.',
    ...(memoryUpdates.length ? { memory_updates: memoryUpdates } : {}),
    plan: { intro: 'An easy canyon walk.', days: [{ id: 'd', dayNumber: 1, label: 'Day', stops: [{ id: 's', order: 1, type: 'walk',
      name: 'Riverside Walk', note: '', startTime: '', timeWindow: 'Morning', duration: 90, evidenceRef: 'e' }],
    dayStructure: { type: 'sightseeing', startPeriod: 'morning', endPeriod: 'evening', summary: 'One easy canyon walk.', blocks: [
      { kind: 'outing', periods: ['morning'], label: 'Canyon walk', note: 'The day’s outing.', stopIds: ['s'] },
      { kind: 'downtime', periods: ['midday', 'evening'], label: 'Rest', note: 'Lunch and a free afternoon.', stopIds: [] }] } }] },
  });
  const preferences = { field: 'preferences', value: { avoidExposure: true, fitness: 'easy walks' }, sourceQuote: 'No scary exposed hikes. Easy walks.' };
  const perKeyVerifier = (verdictFor) => createMemoryAuthorityVerifier({ model: async ({ input }) => ({
    completionStatus: 'completed', toolCalls: [],
    outputText: JSON.stringify({ verdicts: JSON.parse(input[0].content).facts.map(({ id, field }) => {
      const relationship = verdictFor(field);
      return { id, supported: relationship === 'explicit', relationship, reason: 'fixture' };
    }) }),
  }) });

  test('memory dropping preferences no longer disarms avoidExposure (R02 vs R09 consistency)', async () => {
    const verification = await perKeyVerifier((field) => (field === 'preferences.fitness' ? 'unsupported' : 'explicit'))({
      message, updates: [preferences] });
    const full = validateSimpleMutation({ proposal: proposal([preferences]), snapshot: {}, message, evidence: [source()], now: NOW,
      memoryAuthority: verification.receipt });
    expect(full.issues).toEqual(expect.arrayContaining(['memory_authority_unsupported', 'constraint_eligibility_unknown']));
    // The runtime's memory-only retry: dropped update removed, but still offered as a constraint statement.
    const retained = validateSimpleMutation({ proposal: proposal([]), snapshot: {}, message, evidence: [source()], now: NOW,
      memoryAuthority: verification.receipt, constraintUpdates: [preferences] });
    expect(retained.ok).toBe(false);
    expect(retained.issues).toContain('constraint_eligibility_unknown');
    expect(retained.planningState.preferences).toBeUndefined(); // memory still not saved
  });

  test('research constraints arm validation when no memory update is proposed', () => {
    const verdict = validateSimpleMutation({ proposal: proposal(), snapshot: {}, message, evidence: [source()], now: NOW,
      turnConstraints: [{ avoidExposure: true }] });
    expect(verdict.issues).toContain('constraint_eligibility_unknown');
  });

  test('confirmed low exposure is accepted and the validated restriction is recorded for follow-ups', () => {
    const verdict = validateSimpleMutation({ proposal: proposal(), snapshot: {}, message, evidence: [source({ exposureLevel: 'low' })], now: NOW,
      turnConstraints: [{ avoidExposure: true }] });
    expect(verdict.ok).toBe(true);
    expect(verdict.planningState.validationConstraints).toEqual({ avoidExposure: true });
  });

  test('negative control: confirmed high exposure is still a violation', () => {
    const verdict = validateSimpleMutation({ proposal: proposal(), snapshot: {}, message, evidence: [source({ exposureLevel: 'high' })], now: NOW,
      turnConstraints: [{ avoidExposure: true }] });
    expect(verdict.issues).toContain('exposure_constraint_violation');
  });

  test('a follow-up turn with no restatement stays armed from the validated trip', () => {
    const verdict = validateSimpleMutation({ proposal: proposal(), snapshot: { planningState: { validationConstraints: { avoidExposure: true } } },
      message: 'Make day 1 easier', evidence: [source()], now: NOW });
    expect(verdict.issues).toContain('constraint_eligibility_unknown');
  });

  test('no restriction anywhere: unchanged behavior', () => {
    const verdict = validateSimpleMutation({ proposal: proposal(), snapshot: {}, message: 'Plan a day', evidence: [source()], now: NOW });
    expect(verdict.ok).toBe(true);
    expect(verdict.planningState.validationConstraints).toBeUndefined();
  });
});

describe('diagnosis capture maps runtime facts', () => {
  test('fact text, subject, source and suitability are captured', () => {
    jest.isolateModules(() => {
      const fs = require('fs');
      const writes = [];
      jest.spyOn(fs, 'writeFileSync').mockImplementation((file, data) => writes.push(JSON.parse(data)));
      jest.spyOn(fs, 'mkdirSync').mockImplementation(() => {});
      jest.spyOn(fs, 'existsSync').mockReturnValue(false);
      jest.spyOn(fs, 'readFileSync').mockReturnValue('artifacts/private\n');
      const prev = { capture: process.env.TRAILIE_DIAGNOSIS_CAPTURE, env: process.env.NODE_ENV };
      process.env.TRAILIE_DIAGNOSIS_CAPTURE = 'true'; process.env.NODE_ENV = 'test';
      try {
        const { captureResearch } = require('../../utils/trailieDiagnosisCapture');
        captureResearch({ responseId: 'r1', request: { destination: 'Zion' }, evidence: [{ evidenceId: 'e1' }], modelContext: { facts: [{
          evidenceId: 'e1', topic: 'activities', fact: "Pa'rus Trail: paved", source: 'https://www.nps.gov/zion', authority: 'official_owner',
          value: { name: "Pa'rus Trail", exposureLevel: 'low', difficulty: 'easy' } }] } });
      } finally {
        process.env.TRAILIE_DIAGNOSIS_CAPTURE = prev.capture; process.env.NODE_ENV = prev.env;
        jest.restoreAllMocks();
      }
      expect(writes[0].modelContext.facts[0]).toMatchObject({ subject: "Pa'rus Trail", text: "Pa'rus Trail: paved",
        source: 'https://www.nps.gov/zion', sourceClass: 'official_owner', suitability: { exposureLevel: 'low', difficulty: 'easy' } });
      expect(writes[0].frozen.evidence).toEqual([{ evidenceId: 'e1' }]);
    });
  });
});
