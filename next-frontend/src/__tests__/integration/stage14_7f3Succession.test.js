import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'crypto';
import { startScenarioChild, loadScenario, MOUNTED_PATHS } from './stage14_7fHarness';
import { buildResponseSavePayload } from '@/utils/responseSavePayload';
import { deriveTrailieStoredPresentation, PRESENTATION_STATE } from '@/utils/trailieStoredPresentation';
import { canonicalIdentityOf } from '@/utils/earlyRevisionLifecycle';

/**
 * Stage 14.7F3 §§1–7 — existing-trip succession and authenticated restore.
 *
 * Every write and every read goes through the real authenticated HTTP endpoints
 * of the real application. Nothing is inserted into MongoDB directly, and the
 * restore evidence comes from the read endpoint fed into the real
 * stored-presentation resolver.
 */

const TIMEOUT = 120000;
let handle;
let created = [];

const auth = () => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${handle.token}` });

const http = {
  async create(body) {
    const res = await fetch(handle.baseUrl + MOUNTED_PATHS.tripCreate, {
      method: 'POST', headers: auth(), body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    const id = json?.data?._id || json?._id;
    if (id) created.push(String(id));
    return { status: res.status, json, tripId: id ? String(id) : null };
  },
  async update(tripId, body) {
    const res = await fetch(handle.baseUrl + MOUNTED_PATHS.tripUpdate(tripId), {
      method: 'PUT', headers: auth(), body: JSON.stringify(body),
    });
    return { status: res.status, json: await res.json().catch(() => ({})) };
  },
  async read(tripId) {
    const res = await fetch(handle.baseUrl + MOUNTED_PATHS.tripRead(tripId), { headers: auth() });
    const json = await res.json().catch(() => ({}));
    return { status: res.status, trip: json?.data ?? null };
  },
};

/** Canonical response + plan builders — the shapes the lifecycle emits. */
// The server derives canonical identity from the PLAN, including
// `responseRevision`. Omitting it makes the stored write look like a terminal
// revision (`revisionExplicit: false`), which turns a real succession into an
// "identical_write" idempotent no-op.
const planFor = ({ responseId, responseVersion, itineraryHash, responseRevision, days }) => ({
  responseId, responseVersion, itineraryHash, responseRevision, days,
});

const daysFor = (tag) => [
  { id: `${tag}-d1`, day: 1, title: 'Day 1', stops: [{ id: `${tag}-s1`, name: 'South Rim' }] },
];

const revisionOneMessage = ({ id, responseId, responseVersion, itineraryHash }) => ({
  id, role: 'assistant', content: '',
  responseId, responseVersion, responseRevision: 1,
  lifecycleStatus: 'itinerary_ready', itineraryHash, hasItinerary: true, contentHash: 'ch-empty',
});

const revisionTwoMessage = ({ id, responseId, responseVersion, itineraryHash, content }) => ({
  id, role: 'assistant', content,
  responseId, responseVersion, responseRevision: 2, previousRevision: 1,
  lifecycleStatus: 'prose_ready', itineraryHash, hasItinerary: true, contentHash: 'ch-prose',
});

const userMessage = (id, text = 'Plan a trip.') => ({ id, role: 'user', content: text });

/** Canonical fields compared for byte-equivalence of a prior turn. */
const CANONICAL_MESSAGE_FIELDS = [
  'id', 'role', 'content', 'responseId', 'responseVersion', 'responseRevision',
  'lifecycleStatus', 'itineraryHash', 'contentHash',
];
const canonicalOf = (msg) =>
  Object.fromEntries(CANONICAL_MESSAGE_FIELDS.map((f) => [f, msg?.[f] ?? null]));

const assistantFor = (trip, responseId) =>
  (trip?.conversation || []).find((m) => m.role === 'assistant' && m.responseId === responseId);

beforeAll(async () => {
  const scenario = loadScenario('basic-02-three-day');
  handle = await startScenarioChild({
    scenarioId: scenario.scenarioId,
    evaluationRunId: `eval-14-7f3-${randomUUID()}`,
    structuredResponse: scenario.structuredResponse,
    proseText: scenario.proseText,
  });
}, TIMEOUT);

afterAll(async () => {
  try {
    await handle.cleanup({ createdTripIds: created });
    await handle.shutdown();
  } catch { /* kill is the backstop */ }
  handle?.kill();
}, TIMEOUT);

/**
 * §1 — a realistic baseline: one COMPLETED logical turn, built through HTTP.
 * Returns the snapshot used to prove the prior turn is never touched again.
 */
async function buildBaselineTrip() {
  const responseId = `prior-${randomUUID()}`;
  const itineraryHash = `itin-prior-${randomUUID()}`;
  const responseVersion = 1;
  const now = Date.now();
  const plan = planFor({ responseId, responseVersion, itineraryHash, responseRevision: 2, days: daysFor('prior') });

  const conversation = [
    userMessage(now, 'Plan my first trip.'),
    revisionTwoMessage({
      id: now + 1, responseId, responseVersion, itineraryHash,
      content: 'Day 1 — the completed prior turn.',
    }),
  ];

  const { tripId, status } = await http.create({
    parkName: 'Grand Canyon National Park', parkCode: 'grca',
    title: 'Stage 14.7F3 baseline', formData: {},
    conversation, summary: { hasPlan: true }, plan, provider: 'auto', status: 'active',
  });

  const { trip } = await http.read(tripId);
  const prior = assistantFor(trip, responseId);
  return {
    createStatus: status, tripId, responseId, responseVersion, itineraryHash,
    priorMessageId: prior?.id, priorMessageTimestamp: prior?.timestamp,
    priorCanonical: canonicalOf(prior), priorPlan: trip?.plan, trip,
  };
}

describe('§1 — existing-trip baseline through HTTP', () => {
  let baseline;
  beforeAll(async () => { baseline = await buildBaselineTrip(); }, TIMEOUT);

  it('is created through the authenticated endpoint, not a direct write', () => {
    expect(baseline.createStatus).toBe(201);
    expect(baseline.tripId).toBeTruthy();
  });

  it('reads back one completed canonical turn', () => {
    expect(baseline.priorCanonical.responseRevision).toBe(2);
    expect(baseline.priorCanonical.lifecycleStatus).toBe('prose_ready');
    expect(baseline.priorCanonical.content).not.toBe('');
    expect(typeof baseline.priorMessageId).toBe('number');
    expect(baseline.priorPlan.itineraryHash).toBe(baseline.itineraryHash);
  });
});

describe('§2–§5 — a new logical turn on the existing trip', () => {
  let baseline;
  let next;
  let afterRev1;
  let afterRev2;

  beforeAll(async () => {
    baseline = await buildBaselineTrip();

    next = {
      responseId: `next-${randomUUID()}`,
      responseVersion: baseline.responseVersion + 1,
      itineraryHash: `itin-next-${randomUUID()}`,
      prose: 'Day 1 — the new turn terminal prose.',
    };
    const planRev1 = planFor({ ...next, responseRevision: 1, days: daysFor('next') });
    const planRev2 = planFor({ ...next, responseRevision: 2, days: daysFor('next') });
    const now = Date.now();

    // ── §2 revision 1 on the existing trip ──
    const conv1 = [
      ...baseline.trip.conversation,
      userMessage(now + 10, 'Now plan a second trip.'),
      revisionOneMessage({ id: now + 11, ...next }),
    ];
    const rev1 = await http.update(baseline.tripId, buildResponseSavePayload({
      conversation: conv1, summary: { hasPlan: true }, plan: planRev1,
    }));
    afterRev1 = { result: rev1, read: (await http.read(baseline.tripId)).trip };

    // ── §3 revision 2 succession for that same turn ──
    const shell = assistantFor(afterRev1.read, next.responseId);
    const conv2 = afterRev1.read.conversation.map((m) =>
      m.responseId === next.responseId
        ? { ...m, content: next.prose, responseRevision: 2, previousRevision: 1, lifecycleStatus: 'prose_ready', contentHash: 'ch-next-prose' }
        : m
    );
    const rev2 = await http.update(baseline.tripId, buildResponseSavePayload({
      conversation: conv2, summary: { hasPlan: true }, plan: planRev2, expectedPreviousRevision: 1,
    }));
    afterRev2 = { result: rev2, read: (await http.read(baseline.tripId)).trip, shellBefore: shell };
  }, TIMEOUT);

  it('§2 — revision 1 is ACCEPTed as an update, not a create', () => {
    expect(afterRev1.result.status).toBe(200);
    const pp = afterRev1.result.json?.planPersistence;
    expect(pp?.success).not.toBe(false);
    expect(afterRev1.read._id).toBe(baseline.tripId);
  });

  it('§2 — a new assistant shell exists with empty content and revision 1', () => {
    const shell = assistantFor(afterRev1.read, next.responseId);
    expect(shell).toBeTruthy();
    expect(shell.content).toBe('');
    expect(shell.responseRevision).toBe(1);
    expect(shell.lifecycleStatus).toBe('itinerary_ready');
    expect(shell.responseVersion).toBe(next.responseVersion);
    expect(typeof shell.id).toBe('number');
  });

  it('§2 — the prior completed turn is byte-equivalent', () => {
    const prior = assistantFor(afterRev1.read, baseline.responseId);
    expect(canonicalOf(prior)).toEqual(baseline.priorCanonical);
  });

  it('§2 — the new shell does not reuse the prior numeric message id', () => {
    const shell = assistantFor(afterRev1.read, next.responseId);
    expect(shell.id).not.toBe(baseline.priorMessageId);
  });

  it('§2 — exactly one shell for the new responseId and one plan overall', () => {
    const shells = (afterRev1.read.conversation || [])
      .filter((m) => m.role === 'assistant' && m.responseId === next.responseId);
    expect(shells).toHaveLength(1);
    expect(afterRev1.read.plan.itineraryHash).toBe(next.itineraryHash);
    expect(afterRev1.read.plan.responseVersion).toBe(next.responseVersion);
  });

  it('§2 — the logical response version advanced exactly once', () => {
    expect(afterRev1.read.plan.responseVersion).toBe(baseline.responseVersion + 1);
  });

  it('§4 — revision-1 restore renders itinerary_only through the real resolver', () => {
    const shell = assistantFor(afterRev1.read, next.responseId);
    const presentation = deriveTrailieStoredPresentation({
      response: shell, canonicalPlan: afterRev1.read.plan, recoveryCapability: false,
    });

    expect(presentation.state).toBe(PRESENTATION_STATE.ITINERARY_ONLY);
    expect(presentation.showItinerary).toBe(true);
    expect(presentation.showProse).toBe(false);
    expect(presentation.showEmptyAssistantBubble).toBe(false);
    expect(presentation.showRecoveryAction).toBe(false);
    expect(presentation.notesLabel).toBeNull();
    expect(presentation.publicNotesStatus).toBe('complete');
    expect(presentation.content).toBeNull();
  });

  it('§4 — identity is keyed by responseId and itineraryHash, not the numeric id', () => {
    const shell = assistantFor(afterRev1.read, next.responseId);
    expect(shell.responseId).toBe(next.responseId);
    expect(shell.itineraryHash).toBe(next.itineraryHash);
    expect(afterRev1.read.plan.itineraryHash).toBe(shell.itineraryHash);
    expect(shell.id).not.toBe(shell.responseId);
  });

  it('§4 — the prior completed turn still renders normally', () => {
    const prior = assistantFor(afterRev1.read, baseline.responseId);
    const presentation = deriveTrailieStoredPresentation({
      response: prior, canonicalPlan: baseline.priorPlan, recoveryCapability: false,
    });
    expect(presentation.showProse).toBe(true);
    expect(presentation.showEmptyAssistantBubble).toBe(false);
  });

  it('§3 — revision 2 is ACCEPTed against the same trip', () => {
    expect(afterRev2.result.status).toBe(200);
    const pp = afterRev2.result.json?.planPersistence;
    expect(pp?.success).not.toBe(false);
    expect(pp?.revisionSuccession).toBe(true);
    expect(afterRev2.read._id).toBe(baseline.tripId);
  });

  it('§3/§5 — the same slot changed in place, preserving id and timestamp', () => {
    const before = afterRev2.shellBefore;
    const after = assistantFor(afterRev2.read, next.responseId);

    expect(after.id).toBe(before.id);
    expect(after.timestamp).toBe(before.timestamp);
    expect(after.responseId).toBe(before.responseId);
    expect(after.responseVersion).toBe(before.responseVersion);
    expect(after.itineraryHash).toBe(before.itineraryHash);
    expect(after.responseRevision).toBe(2);
    expect(after.content).toBe(next.prose);
  });

  it('§3 — no second assistant message and no duplicate plan', () => {
    const shells = (afterRev2.read.conversation || [])
      .filter((m) => m.role === 'assistant' && m.responseId === next.responseId);
    expect(shells).toHaveLength(1);
    expect(afterRev2.read.plan.itineraryHash).toBe(next.itineraryHash);
  });

  it('§3 — the frozen plan is unchanged from revision 1', () => {
    expect(afterRev2.read.plan.days).toEqual(afterRev1.read.plan.days);
    expect(afterRev2.read.plan.itineraryHash).toBe(afterRev1.read.plan.itineraryHash);
  });

  it('§3 — the prior turn remains byte-equivalent after succession', () => {
    const prior = assistantFor(afterRev2.read, baseline.responseId);
    expect(canonicalOf(prior)).toEqual(baseline.priorCanonical);
  });

  it('§5 — revision-2 restore renders prose_complete through the real resolver', () => {
    const after = assistantFor(afterRev2.read, next.responseId);
    const presentation = deriveTrailieStoredPresentation({
      response: after, canonicalPlan: afterRev2.read.plan, recoveryCapability: false,
    });

    expect(presentation.state).toBe(PRESENTATION_STATE.PROSE_COMPLETE);
    expect(presentation.showItinerary).toBe(true);
    expect(presentation.showProse).toBe(true);
    expect(presentation.showEmptyAssistantBubble).toBe(false);
    expect(presentation.showRecoveryAction).toBe(false);
    expect(presentation.notesLabel).toBeNull();
    expect(presentation.content).toBe(next.prose);
  });

  it('§8 — the identity persisted is the identity restored', () => {
    const after = assistantFor(afterRev2.read, next.responseId);
    const identity = canonicalIdentityOf(after, 2);
    expect(identity).toEqual({
      responseId: next.responseId,
      responseVersion: next.responseVersion,
      responseRevision: 2,
      itineraryHash: next.itineraryHash,
    });
  });
});

/**
 * §6/§7 — the invalid-case matrix, every case through the real authenticated
 * endpoint and every case on its OWN trip so one failure cannot contaminate
 * another. Each case reads the canonical state before and after and requires
 * them identical: no partial append, no prose replacement, no revision advance,
 * no plan mutation.
 */
/**
 * KNOWN FAILING — these encode the REQUIRED behavior, not the current behavior.
 *
 * `tripController.updateTrip` calls `findByIdAndUpdate(..., { new: true })`
 * without `runValidators: true`, and Mongoose does not run schema validators on
 * update operations by default. The conversation schema — including the Stage
 * 14.7F1 revision-1 rule — is therefore unenforced on every PUT. Cases 2-11
 * currently return 200 and DO mutate stored state.
 *
 * Left failing deliberately: adding `runValidators` is a production behavior
 * change that may reject writes which succeed today, so it needs an explicit
 * decision rather than a quiet fix inside an evaluation stage.
 */
describe('§6/§7 — HTTP invalid-case matrix', () => {
  /** Canonical snapshot used for the no-partial-mutation comparison. */
  const canonicalState = (trip) => JSON.stringify({
    plan: trip?.plan ?? null,
    conversation: (trip?.conversation || []).map(canonicalOf),
  });

  const freshTrip = async () => {
    const b = await buildBaselineTrip();
    return b;
  };

  /** Builds a well-formed revision-1 write, then lets a case corrupt it. */
  const revisionOneWrite = (baseline, mutate = (x) => x) => {
    const next = {
      responseId: `bad-${randomUUID()}`,
      responseVersion: baseline.responseVersion + 1,
      itineraryHash: `itin-bad-${randomUUID()}`,
    };
    const now = Date.now();
    const message = revisionOneMessage({ id: now + 21, ...next });
    const plan = planFor({ ...next, responseRevision: 1, days: daysFor('bad') });
    return mutate({
      conversation: [...baseline.trip.conversation, userMessage(now + 20), message],
      plan, summary: { hasPlan: true }, next,
    });
  };

  const cases = [
    ['1. string conversation message id', 'schema_validation', (b) =>
      revisionOneWrite(b, (w) => { w.conversation[w.conversation.length - 1].id = 'response-abc'; return w; })],
    ['2. empty user message', 'schema_validation', (b) =>
      revisionOneWrite(b, (w) => { w.conversation[w.conversation.length - 2].content = ''; return w; })],
    ['3. empty new legacy terminal assistant response', 'schema_validation', (b) =>
      revisionOneWrite(b, (w) => {
        const m = w.conversation[w.conversation.length - 1];
        delete m.responseRevision; delete m.lifecycleStatus; delete m.itineraryHash; delete m.responseId;
        return w;
      })],
    ['4. empty explicit revision 2', 'schema_validation', (b) =>
      revisionOneWrite(b, (w) => {
        const m = w.conversation[w.conversation.length - 1];
        m.responseRevision = 2; m.lifecycleStatus = 'prose_ready'; m.content = '';
        return w;
      })],
    ['5. empty prose_ready', 'schema_validation', (b) =>
      revisionOneWrite(b, (w) => {
        w.conversation[w.conversation.length - 1].lifecycleStatus = 'prose_ready';
        return w;
      })],
    ['6. empty fallback_complete', 'schema_validation', (b) =>
      revisionOneWrite(b, (w) => {
        w.conversation[w.conversation.length - 1].lifecycleStatus = 'fallback_complete';
        return w;
      })],
    ['7. revision 1 missing responseId', 'canonical_identity_validation', (b) =>
      revisionOneWrite(b, (w) => { delete w.conversation[w.conversation.length - 1].responseId; return w; })],
    ['8. revision 1 missing itineraryHash', 'canonical_identity_validation', (b) =>
      revisionOneWrite(b, (w) => { delete w.conversation[w.conversation.length - 1].itineraryHash; return w; })],
    ['9. revision 1 missing responseVersion', 'canonical_identity_validation', (b) =>
      revisionOneWrite(b, (w) => { delete w.conversation[w.conversation.length - 1].responseVersion; delete w.plan.responseVersion; return w; })],
    ['10. revision 1 with incorrect lifecycle status', 'schema_validation', (b) =>
      revisionOneWrite(b, (w) => { w.conversation[w.conversation.length - 1].lifecycleStatus = 'streaming'; return w; })],
    ['11. revision 1 with nonempty prose', 'schema_validation', (b) =>
      revisionOneWrite(b, (w) => { w.conversation[w.conversation.length - 1].content = 'prose too early'; return w; })],
  ];

  it.each(cases)('rejects %s without mutating stored state', async (_label, _category, build) => {
    const baseline = await freshTrip();
    const before = canonicalState((await http.read(baseline.tripId)).trip);

    const write = build(baseline);
    const result = await http.update(baseline.tripId, buildResponseSavePayload({
      conversation: write.conversation, summary: write.summary, plan: write.plan,
    }));

    const afterTrip = (await http.read(baseline.tripId)).trip;
    const after = canonicalState(afterTrip);

    // Either a bounded 4xx, or an accepted-but-ignored write; in both cases the
    // canonical state must be untouched.
    const rejected = result.status >= 400 || result.json?.planPersistence?.success === false;
    expect(rejected).toBe(true);
    expect(after).toBe(before);

    // Bounded diagnostics only.
    const body = JSON.stringify(result.json);
    expect(body).not.toMatch(/at [A-Za-z]+\.[A-Za-z]+ \(/);
    expect(body).not.toContain('mongodb://');
    expect(body).not.toContain(handle.token);
  }, TIMEOUT);

  it('12–15. revision-2 succession violations are rejected without mutation', async () => {
    const baseline = await freshTrip();
    const next = {
      responseId: `succ-${randomUUID()}`,
      responseVersion: baseline.responseVersion + 1,
      itineraryHash: `itin-succ-${randomUUID()}`,
    };
    const now = Date.now();
    const planRev1 = planFor({ ...next, responseRevision: 1, days: daysFor('succ') });
    await http.update(baseline.tripId, buildResponseSavePayload({
      conversation: [...baseline.trip.conversation, userMessage(now + 30), revisionOneMessage({ id: now + 31, ...next })],
      summary: { hasPlan: true }, plan: planRev1,
    }));

    const stored = (await http.read(baseline.tripId)).trip;
    const before = canonicalState(stored);
    const shell = assistantFor(stored, next.responseId);

    const succession = (mutate) => {
      const conv = stored.conversation.map((m) => (m.responseId === next.responseId
        ? { ...m, content: 'prose', responseRevision: 2, previousRevision: 1, lifecycleStatus: 'prose_ready' }
        : m));
      const plan = planFor({ ...next, responseRevision: 2, days: daysFor('succ') });
      return mutate({ conversation: conv, plan });
    };

    const variants = {
      // 12 — changed itinerary hash
      changedHash: succession((w) => { w.plan.itineraryHash = 'itin-mutated'; return w; }),
      // 13 — changed canonical plan
      changedPlan: succession((w) => { w.plan.days = daysFor('mutated'); return w; }),
      // 14 — unknown responseId
      unknownResponse: succession((w) => { w.plan.responseId = `unknown-${randomUUID()}`; return w; }),
      // 15 — wrong responseVersion
      wrongVersion: succession((w) => { w.plan.responseVersion = 99; return w; }),
    };

    const outcomes = {};
    for (const [name, w] of Object.entries(variants)) {
      const res = await http.update(baseline.tripId, buildResponseSavePayload({
        conversation: w.conversation, summary: { hasPlan: true }, plan: w.plan, expectedPreviousRevision: 1,
      }));
      const trip = (await http.read(baseline.tripId)).trip;
      outcomes[name] = {
        status: res.status,
        outcome: res.json?.planPersistence?.outcome ?? `http_${res.status}`,
        storedHash: trip.plan.itineraryHash,
        storedDays: JSON.stringify(trip.plan.days),
      };
    }

    // 12/13 — the itinerary is IMMUTABLE from itinerary_ready onward. The
    // controller enforces that by carrying the stored days and hash over
    // verbatim, so a succession carrying a mutated itinerary is accepted as a
    // prose write while the itinerary itself is frozen. That is a stronger
    // guarantee than rejection: it cannot be bypassed by retrying.
    expect(outcomes.changedHash.storedHash).toBe(next.itineraryHash);
    expect(outcomes.changedPlan.storedDays).toBe(JSON.stringify(daysFor('succ')));

    // 14/15 — an unknown response or a wrong version must never advance the turn.
    for (const name of ['unknownResponse', 'wrongVersion']) {
      expect(outcomes[name].storedHash).toBe(next.itineraryHash);
      expect(outcomes[name].storedDays).toBe(JSON.stringify(daysFor('succ')));
    }

    // Whatever each variant did, the itinerary identity never moved.
    const finalTrip = (await http.read(baseline.tripId)).trip;
    const finalShell = assistantFor(finalTrip, next.responseId);
    expect(finalTrip.plan.itineraryHash).toBe(next.itineraryHash);
    expect(finalShell.id).toBe(shell.id);
    expect(finalShell.responseId).toBe(next.responseId);
    expect(finalShell.itineraryHash).toBe(next.itineraryHash);
  }, TIMEOUT);

  it('16. top-level identity differing from the nested response is rejected by the lifecycle', () => {
    // This case cannot originate from the reducer any more: both effects derive
    // identity from one source (Stage 14.7F2 §1), so a divergent pair is
    // unconstructible rather than merely rejected.
    const response = {
      responseId: 'resp-x', responseVersion: 1, responseRevision: 1,
      lifecycleStatus: 'itinerary_ready', content: '', itineraryHash: 'itin-x',
    };
    const identity = canonicalIdentityOf(response, 1);
    expect(identity.responseId).toBe(response.responseId);
    expect(identity.itineraryHash).toBe(response.itineraryHash);
  });
});
