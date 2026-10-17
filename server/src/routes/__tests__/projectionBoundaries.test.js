'use strict';

/**
 * Stage 14.7F5 §7–§11 — projection boundaries.
 *
 * ONE canonical fixture deliberately stuffed with internal state is pushed
 * through every surface that can leave the server. The key property is §11:
 * surfaces are ALLOWLISTED, so a field nobody has invented yet is omitted by
 * default. A denylist would pass today and leak the moment someone adds a field.
 */

const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');

const TripPlan = require('../../models/TripPlan');
const User = require('../../models/User');
const { awaitModelReadiness } = require('../../eval/modelReadiness');
const { PUBLIC_PLAN_FIELDS, INTERNAL_ONLY_FIELDS, projectPublicPlan } = require('../../utils/planProjection');
const { buildSharedTripPayload } = require('../../utils/sharedTripPayload');
const { deriveTrailieStoredPresentation, VIEWER_CONTEXT } = require('../../utils/trailieStoredPresentation');

const app = express();
app.use(express.json({ limit: '10mb' }));
app.use('/api/trips', require('../trips'));
app.use(require('../../middleware/errorHandler'));

const R = 'resp-projection-A';
const V = 1;
const IH = 'itinerary-hash-projection';

/** Every internal category §7 names, planted where each could plausibly appear. */
const INTERNAL_MARKERS = {
  promptHash: 'LEAK-promptHash',
  rawReviewerOutput: 'LEAK-rawReviewerOutput',
  rawRepairOutput: 'LEAK-rawRepairOutput',
  reviewerPrompt: 'LEAK-reviewerPrompt',
  rejectedDrafts: ['LEAK-rejectedDraft'],
  providerRequest: { body: 'LEAK-providerRequest' },
  providerResponse: { body: 'LEAK-providerResponse' },
  leaseToken: 'LEAK-leaseToken',
  fencingToken: 'LEAK-fencingToken',
  queueLease: { owner: 'LEAK-queueLease' },
  evaluationRunId: 'LEAK-evaluationRunId',
  evaluationMeta: { run: 'LEAK-evaluationMeta' },
  persistenceDecision: 'LEAK-persistenceDecision',
  lifecycleEffects: ['LEAK-lifecycleEffects'],
  reducerState: { s: 'LEAK-reducerState' },
  constructorInstrumentation: 'LEAK-constructorInstrumentation',
  internalDiagnostics: { d: 'LEAK-internalDiagnostics' },
  networkGuard: { blocked: 'LEAK-networkGuard' },
  validationDiagnostics: 'LEAK-validationDiagnostics',
};

const contaminatedPlan = (over = {}) => ({
  // legitimate public content
  type: 'itinerary',
  version: 1,
  generatedAt: '2026-06-01T00:00:00.000Z',
  createdFrom: 'ai',
  parkName: 'Yosemite National Park',
  parkCode: 'yose',
  days: [{ day: 1, stops: [{ name: 'Tunnel View' }] }],
  totalDays: 1,
  highlights: ['Tunnel View'],
  packingList: ['layers'],
  permits: [],
  estimatedCost: { total: 120 },
  feasibilityIssues: [],
  // canonical identity + lifecycle (owner-only)
  responseId: R, responseVersion: V, responseRevision: 1,
  lifecycleStatus: 'itinerary_ready',
  contentHash: null, itineraryHash: IH,
  itineraryReadyAt: '2026-06-01T00:00:00.000Z',
  // server-owned metadata
  reviewMeta: { reviewerRan: true, reviewerPassed: true, reviewerPrompt: 'LEAK-reviewerPrompt' },
  auditTrail: { provider: 'claude', providerRequest: { body: 'LEAK-providerRequest' } },
  // a field nobody has invented yet — the §11 property
  someFieldInventedNextQuarter: 'LEAK-unknownFuture',
  ...INTERNAL_MARKERS,
  ...over,
});

const shellTurn = () => ({
  id: 1, role: 'assistant', content: '',
  responseId: R, responseVersion: V, responseRevision: 1,
  lifecycleStatus: 'itinerary_ready', itineraryHash: IH,
});

const terminalTurn = () => ({
  ...shellTurn(), content: 'Your Yosemite day plan.',
  responseRevision: 2, previousRevision: 1,
  lifecycleStatus: 'prose_ready', contentHash: 'ch2',
});

const LEAK = /LEAK-[A-Za-z]+/g;
const leaksIn = (value) => [...new Set(JSON.stringify(value ?? null).match(LEAK) || [])].sort();

let token;
let userId;

beforeAll(async () => {
  await awaitModelReadiness();
});

beforeEach(async () => {
  const user = await User.create({
    name: 'Projection Prover',
    email: `proj-${Date.now()}-${Math.random().toString(16).slice(2)}@example.com`,
    password: 'password123',
  });
  userId = user._id;
  token = jwt.sign({ id: user._id.toString() }, process.env.JWT_SECRET, { expiresIn: '1h' });
});

async function seedTrip({ terminal = false, shareScope = 'plan_only' } = {}) {
  const trip = await TripPlan.create({
    userId,
    title: 'Projection fixture',
    parkCode: 'yose',
    shareId: `share-${Math.random().toString(16).slice(2)}`,
    shareScope,
    conversation: [
      { id: 0, role: 'user', content: 'One day in Yosemite' },
      terminal ? terminalTurn() : shellTurn(),
    ],
    plan: terminal
      ? contaminatedPlan({ responseRevision: 2, lifecycleStatus: 'prose_ready', contentHash: 'ch2' })
      : contaminatedPlan(),
  });
  return trip;
}

// ─────────────────────────────────────────────────────────────────────────────
// §7 — authenticated owner projection
// ─────────────────────────────────────────────────────────────────────────────
describe('§7 — owner projection', () => {
  test('the owner read exposes no internal field, at any nesting depth', async () => {
    const trip = await seedTrip();
    const res = await request(app)
      .get(`/api/trips/${trip._id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    // The unknown-future field is owner data, not an internal category — the
    // owner surface is subtractive by design. Everything else must be gone.
    expect(leaksIn(res.body.data)).toEqual(['LEAK-unknownFuture']);
  });

  test('nested internals inside reviewMeta / auditTrail are removed too', async () => {
    const trip = await seedTrip();
    const res = await request(app)
      .get(`/api/trips/${trip._id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.body.data.plan.reviewMeta.reviewerPrompt).toBeUndefined();
    expect(res.body.data.plan.reviewMeta.reviewerPassed).toBe(true);
    expect(res.body.data.plan.auditTrail.providerRequest).toBeUndefined();
    expect(res.body.data.plan.auditTrail.provider).toBe('claude');
  });

  test('the owner still receives what restore needs', async () => {
    const trip = await seedTrip();
    const res = await request(app)
      .get(`/api/trips/${trip._id}`)
      .set('Authorization', `Bearer ${token}`);

    const p = res.body.data.plan;
    expect(p.responseId).toBe(R);
    expect(p.responseVersion).toBe(V);
    expect(p.responseRevision).toBe(1);
    expect(p.itineraryHash).toBe(IH);
    expect(p.lifecycleStatus).toBe('itinerary_ready');
    expect(p.days).toHaveLength(1);
    expect(res.body.data.conversation).toHaveLength(2);
  });

  test.each([
    ['revision 1', false, false],
    ['revision 2', true, true],
  ])('%s owner rendering through the real presentation resolver is unchanged', async (_l, terminal, showProse) => {
    const trip = await seedTrip({ terminal });
    const res = await request(app)
      .get(`/api/trips/${trip._id}`)
      .set('Authorization', `Bearer ${token}`);

    const turns = res.body.data.conversation.filter((m) => m.role === 'assistant');
    const presentation = deriveTrailieStoredPresentation({
      response: turns[turns.length - 1],
      canonicalPlan: res.body.data.plan,
      viewerContext: VIEWER_CONTEXT.OWNER,
      recoveryCapability: true,
    });
    expect(presentation.showItinerary).toBe(true);
    expect(presentation.showProse).toBe(showProse);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §8 — shared-trip projection
// ─────────────────────────────────────────────────────────────────────────────
describe('§8 — shared projection', () => {
  test.each([
    ['revision 1', false],
    ['revision 2', true],
  ])('%s share leaks nothing through the real public endpoint', async (_l, terminal) => {
    const trip = await seedTrip({ terminal, shareScope: 'plan_plus_explanation' });
    const res = await request(app).get(`/api/trips/shared/${trip.shareId}`);

    expect(res.status).toBe(200);
    expect(leaksIn(res.body)).toEqual([]);
    expect(Object.keys(res.body.data.plan).filter((k) => !PUBLIC_PLAN_FIELDS.includes(k))).toEqual([]);
  });

  test('revision 1 keeps the itinerary but renders no empty prose bubble', async () => {
    const trip = await seedTrip({ terminal: false, shareScope: 'plan_plus_explanation' });
    const res = await request(app).get(`/api/trips/shared/${trip.shareId}`);

    expect(res.body.data.plan.days).toHaveLength(1);
    // No assistant message with empty content may be published.
    const assistants = (res.body.data.conversation || []).filter((m) => m.role === 'assistant');
    expect(assistants.every((m) => (m.content || '').trim().length > 0)).toBe(true);
    // Tool-first revision 1 is a settled itinerary-only success — notesStatus
    // is complete (not a pending-notes error). Canonical fixtures agree.
    expect(res.body.data.notesStatus).toBe('complete');
    expect(assistants).toHaveLength(0);
  });

  test('revision 2 exposes prose at plan_plus_explanation but NEVER at plan_only', async () => {
    const shared = await seedTrip({ terminal: true, shareScope: 'plan_plus_explanation' });
    const withProse = await request(app).get(`/api/trips/shared/${shared.shareId}`);
    expect(JSON.stringify(withProse.body)).toContain('Your Yosemite day plan.');

    const planOnly = await seedTrip({ terminal: true, shareScope: 'plan_only' });
    const without = await request(app).get(`/api/trips/shared/${planOnly.shareId}`);
    expect(JSON.stringify(without.body)).not.toContain('Your Yosemite day plan.');
    expect(without.body.data.plan.days).toHaveLength(1);
  });

  test('no duplicate assistant response in a share', async () => {
    const trip = await seedTrip({ terminal: true, shareScope: 'full_conversation' });
    const res = await request(app).get(`/api/trips/shared/${trip.shareId}`);
    const assistants = (res.body.data.conversation || []).filter((m) => m.role === 'assistant');
    expect(assistants).toHaveLength(1);
  });

  test('share scope semantics are unchanged by the allowlist', async () => {
    const scopes = ['plan_only', 'plan_plus_explanation', 'full_conversation'];
    for (const scope of scopes) {
      const trip = await seedTrip({ terminal: true, shareScope: scope });
      const res = await request(app).get(`/api/trips/shared/${trip.shareId}`);
      expect(res.body.data.plan.days).toHaveLength(1);
      const hasUserMessages = (res.body.data.conversation || []).some((m) => m.role === 'user');
      expect(hasUserMessages).toBe(scope === 'full_conversation');
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §11 — differential: one fixture, every surface, explicit allowlists
// ─────────────────────────────────────────────────────────────────────────────
describe('§11 — projection differential', () => {
  test('the public plan projection is an ALLOWLIST, not a denylist', () => {
    const projected = projectPublicPlan(contaminatedPlan());
    expect(Object.keys(projected).sort()).toEqual(
      PUBLIC_PLAN_FIELDS.filter((f) => f in contaminatedPlan()).sort()
    );
    expect(leaksIn(projected)).toEqual([]);
  });

  test('an unknown internal field is omitted from every public surface', async () => {
    // The property that a denylist cannot give: nobody had to name this field.
    const trip = await seedTrip({ terminal: true, shareScope: 'full_conversation' });
    const shared = await request(app).get(`/api/trips/shared/${trip.shareId}`);

    expect(JSON.stringify(shared.body)).not.toContain('LEAK-unknownFuture');
    expect(JSON.stringify(projectPublicPlan(contaminatedPlan()))).not.toContain('LEAK-unknownFuture');
  });

  test('each surface omits every §7 internal category', () => {
    const plan = contaminatedPlan();
    const surfaces = {
      shared_plan_only: buildSharedTripPayload(
        { plan, conversation: [shellTurn()], shareScope: 'plan_only', title: 't' },
        { scope: 'plan_only' }
      ),
      shared_full: buildSharedTripPayload(
        { plan, conversation: [terminalTurn()], shareScope: 'full_conversation', title: 't' },
        { scope: 'full_conversation' }
      ),
      public_plan: projectPublicPlan(plan),
    };
    for (const [name, payload] of Object.entries(surfaces)) {
      expect({ surface: name, leaks: leaksIn(payload) }).toEqual({ surface: name, leaks: [] });
    }
  });

  /**
   * Regression: the owner projection rebuilds plain objects key-by-key. A `Date`
   * or an `ObjectId` is `typeof 'object'` but stores its value in internal slots,
   * so recursing into one yields `{}` — which silently destroyed message
   * timestamps and broke every downstream byte-equivalence check.
   */
  test('non-plain objects (Date, ObjectId) survive the owner projection intact', async () => {
    const trip = await seedTrip();
    const res = await request(app)
      .get(`/api/trips/${trip._id}`)
      .set('Authorization', `Bearer ${token}`);

    const stored = await TripPlan.findById(trip._id).lean();
    const projectedTurn = res.body.data.conversation.find((m) => m.role === 'assistant');
    const storedTurn = stored.conversation.find((m) => m.role === 'assistant');

    expect(typeof projectedTurn.timestamp).toBe('string');
    expect(new Date(projectedTurn.timestamp).toISOString())
      .toBe(new Date(storedTurn.timestamp).toISOString());
    expect(res.body.data.createdAt).toBeTruthy();
    expect(String(res.body.data.userId)).toBe(String(stored.userId));
  });

  test('the internal-field list actually covers every §7 category', () => {
    for (const field of Object.keys(INTERNAL_MARKERS)) {
      expect(INTERNAL_ONLY_FIELDS).toContain(field);
    }
  });
});
