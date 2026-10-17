'use strict';

/**
 * Stage 14.7F4A (diagnosis) → Stage 14.7F4B (enforcement).
 *
 * Stage 14.7F4 grouped cases 12–15 into one "rejected" bucket. They are NOT the
 * same thing:
 *
 *   12–13  valid logical turn, mutated payload  → freezing stored state is a
 *          legitimate deterministic normalization
 *   14–15  INVALID logical-turn identity        → freezing resolves nothing; the
 *          request must be rejected outright, or a stale/malformed write could
 *          land on a different canonical turn
 *
 * Every case below runs through the REAL authenticated route
 * (`PUT /api/trips/:tripId` behind `protect`) on its own isolated trip, and
 * records the full before/after canonical state. No provider calls, no network.
 */

const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');

const TripPlan = require('../../models/TripPlan');
const User = require('../../models/User');
const { awaitModelReadiness } = require('../../eval/modelReadiness');

/**
 * The REAL router, the REAL `protect` middleware, the REAL error handler —
 * mounted exactly as `src/app.js` mounts them. `src/app.js` itself is not
 * requirable under jest (it pulls the JSX email templates through
 * `routes/auth.js`), so the app is assembled here from the same three pieces
 * rather than stubbed.
 */
const app = express();
app.use(express.json({ limit: '10mb' }));
app.use('/api/trips', require('../trips'));
app.use(require('../../middleware/errorHandler'));

// ── The canonical revision-1 checkpoint every case starts from ────────────────
const R = 'resp-canonical-A';
const V = 4;
const IH = 'itinerary-hash-frozen-1';
const CH1 = 'content-hash-rev-1';

/**
 * A deliberately RICH plan. Stage 14.7F4A §3 requires proving the whole stored
 * plan survives a freeze — not just `days` and the hash — so every field the
 * spec enumerates is present and individually mutated by case 13.
 */
const storedPlanFixture = () => ({
  type: 'itinerary',
  responseId: R,
  responseVersion: V,
  responseRevision: 1,
  lifecycleStatus: 'itinerary_ready',
  contentHash: CH1,
  itineraryHash: IH,
  planHash: 'plan-hash-rev-1',
  days: [
    {
      day: 1,
      parkCode: 'yose',
      stops: [
        { name: 'Tunnel View', lat: 37.7156, lng: -119.6773, durationMinutes: 45, source: 'nps-api' },
        { name: 'Lower Yosemite Fall', lat: 37.7459, lng: -119.5965, durationMinutes: 60, source: 'nps-api' },
      ],
      drivingMinutes: 35,
    },
  ],
  stops: [
    { name: 'Tunnel View', lat: 37.7156, lng: -119.6773 },
    { name: 'Lower Yosemite Fall', lat: 37.7459, lng: -119.5965 },
  ],
  coordinates: { lat: 37.8651, lng: -119.5383 },
  provenance: { generator: 'tool-first', drivingTimesSource: 'google-distance-matrix', builtAt: '2026-06-01T00:00:00.000Z' },
  warnings: ['Tioga Road seasonally closed'],
  totalDurationMinutes: 480,
  difficulty: 'moderate',
  parks: [{ parkCode: 'yose', fullName: 'Yosemite National Park' }],
  evidence: { npsSnapshotId: 'snap-1', weatherSource: 'nws' },
});

const storedShell = () => ({
  id: 1001,
  role: 'assistant',
  content: '',
  responseId: R,
  responseVersion: V,
  responseRevision: 1,
  lifecycleStatus: 'itinerary_ready',
  contentHash: CH1,
  itineraryHash: IH,
});

const storedUserMessage = () => ({ id: 1000, role: 'user', content: 'Plan 3 days in Yosemite' });

/** A well-formed terminal revision-2 assistant message for response R. */
const terminalMessage = (over = {}) => ({
  id: 1001,
  role: 'assistant',
  content: 'Here is your verified three-day Yosemite itinerary.',
  responseId: R,
  responseVersion: V,
  responseRevision: 2,
  previousRevision: 1,
  lifecycleStatus: 'prose_ready',
  contentHash: 'content-hash-rev-2',
  itineraryHash: IH,
  ...over,
});

/** A well-formed terminal revision-2 plan for response R. */
const terminalPlan = (over = {}) => ({
  ...storedPlanFixture(),
  responseRevision: 2,
  lifecycleStatus: 'prose_ready',
  contentHash: 'content-hash-rev-2',
  ...over,
});

// ── Harness ───────────────────────────────────────────────────────────────────

let token;
let userId;

beforeAll(async () => {
  await awaitModelReadiness();
});

beforeEach(async () => {
  const user = await User.create({
    name: 'Succession Prover',
    email: `succession-${Date.now()}-${Math.random().toString(16).slice(2)}@example.com`,
    password: 'password123',
  });
  userId = user._id;
  token = jwt.sign({ id: user._id.toString() }, process.env.JWT_SECRET, { expiresIn: '1h' });
});

/** Every case gets its OWN trip, so no case can observe another's mutation. */
async function seedIsolatedTrip() {
  const trip = await TripPlan.create({
    userId,
    title: 'Adversarial fixture',
    parkCode: 'yose',
    conversation: [storedUserMessage(), storedShell()],
    plan: storedPlanFixture(),
    provider: 'claude',
  });
  return trip._id.toString();
}

/** Raw stored state, straight from the collection — never the API's echo. */
async function readStored(tripId) {
  const doc = await TripPlan.findById(tripId).lean();
  return {
    plan: doc.plan || null,
    conversation: (doc.conversation || []).map((m) => {
      const { _id, ...rest } = m;
      return rest;
    }),
  };
}

const canonicalAssistant = (conversation, responseId) =>
  (conversation || []).find((m) => m.role === 'assistant' && m.responseId === responseId) || null;

const stable = (value) => JSON.stringify(value, (k, v) => v, 0);

/**
 * Runs ONE case end-to-end and returns the Stage 14.7F4A report object plus the
 * raw before/after state for field-level equality proofs.
 */
async function runCase(body) {
  const tripId = await seedIsolatedTrip();
  const before = await readStored(tripId);

  const res = await request(app)
    .put(`/api/trips/${tripId}`)
    .set('Authorization', `Bearer ${token}`)
    .send(body);

  const after = await readStored(tripId);

  const beforeMsg = canonicalAssistant(before.conversation, R);
  const afterMsg = canonicalAssistant(after.conversation, R);

  const report = {
    httpStatus: res.status,
    persistenceDecision: res.body?.planPersistence?.outcome ?? null,
    persistenceReason: res.body?.planPersistence?.reason ?? null,
    storedResponseIdBefore: before.plan?.responseId ?? null,
    storedResponseIdAfter: after.plan?.responseId ?? null,
    storedResponseVersionBefore: before.plan?.responseVersion ?? null,
    storedResponseVersionAfter: after.plan?.responseVersion ?? null,
    storedResponseRevisionBefore: before.plan?.responseRevision ?? null,
    storedResponseRevisionAfter: after.plan?.responseRevision ?? null,
    storedItineraryHashBefore: before.plan?.itineraryHash ?? null,
    storedItineraryHashAfter: after.plan?.itineraryHash ?? null,
    storedContentHashBefore: before.plan?.contentHash ?? null,
    storedContentHashAfter: after.plan?.contentHash ?? null,
    canonicalStateMutated: stable(before) !== stable(after),
  };

  return { report, before, after, beforeMsg, afterMsg, res, tripId };
}

const RESULTS = {};
const record = (name, outcome) => {
  RESULTS[name] = outcome.report;
  return outcome;
};

afterAll(() => {
  const dir = path.resolve(__dirname, '../../../../artifacts');
  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, 'trailie-stage14_7F4B-succession-enforcement.json'),
      `${JSON.stringify(RESULTS, null, 2)}\n`
    );
  } catch {
    /* artifact write is reporting convenience, never a test dependency */
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// §2 — Case 12: revision 2 whose itinerary hash differs from the frozen one
// ─────────────────────────────────────────────────────────────────────────────
describe('§2 Case 12 — revision 2 with a changed itinerary hash', () => {
  const MUTATED_HASH = 'itinerary-hash-MUTATED';

  let out;
  beforeEach(async () => {
    out = record('case12', await runCase({
      conversation: [storedUserMessage(), terminalMessage({ itineraryHash: MUTATED_HASH })],
      plan: terminalPlan({
        itineraryHash: MUTATED_HASH,
        days: [{ day: 1, parkCode: 'yose', stops: [{ name: 'INJECTED' }], drivingMinutes: 999 }],
      }),
      expectedPreviousVersion: V,
      expectedPreviousRevision: 1,
    }));
  });

  test('POLICY A — bounded rejection, classified by the hash change itself', () => {
    expect(out.report.persistenceDecision).toBe('conflict');
    expect(out.report.persistenceReason).toBe('revision_itinerary_hash_changed');
    expect(out.res.body.success).toBe(false);
  });

  /**
   * Stage 14.7F4B §1 — HTTP 200 is the APPROVED transport for a bounded
   * persistence decision. What carries the rejection is the decision field, and
   * the status must never be readable as success on its own.
   */
  test('§1 — the 200 carries an explicit non-accept decision', () => {
    expect(out.report.httpStatus).toBe(200);
    expect(out.res.body.success).toBe(false);
    expect(['stale', 'conflict']).toContain(out.report.persistenceDecision);
  });

  test('zero mutation — the whole canonical unit is untouched', () => {
    expect(out.report.canonicalStateMutated).toBe(false);
  });

  test('the frozen itinerary hash is retained byte-identically', () => {
    expect(out.report.storedItineraryHashAfter).toBe(IH);
    expect(stable(out.after.plan.days)).toBe(stable(out.before.plan.days));
  });

  test('no mutated itinerary field survives anywhere', () => {
    expect(stable(out.after)).not.toContain('INJECTED');
    expect(stable(out.after)).not.toContain(MUTATED_HASH);
  });

  test('the revision-1 shell keeps empty prose', () => {
    expect(out.afterMsg.content).toBe('');
    expect(out.afterMsg.responseRevision).toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §3 — Case 13: revision 2 whose canonical PLAN differs from revision 1
// ─────────────────────────────────────────────────────────────────────────────
describe('§3 Case 13 — revision 2 with a changed canonical plan', () => {
  let out;
  beforeEach(async () => {
    // Every enumerated plan field is mutated, but the itinerary hash is left
    // correct — this is precisely the request the freeze policy must neutralize.
    out = record('case13', await runCase({
      conversation: [storedUserMessage(), terminalMessage()],
      plan: terminalPlan({
        itineraryHash: IH,
        planHash: 'plan-hash-MUTATED',
        days: [{ day: 1, parkCode: 'zion', stops: [{ name: 'INJECTED-DAY' }], drivingMinutes: 999 }],
        stops: [{ name: 'INJECTED-STOP', lat: 0, lng: 0 }],
        coordinates: { lat: 0, lng: 0 },
        provenance: { generator: 'INJECTED-GENERATOR', drivingTimesSource: 'INJECTED-SOURCE' },
        warnings: ['INJECTED-WARNING'],
        totalDurationMinutes: 99999,
        difficulty: 'INJECTED-DIFFICULTY',
        parks: [{ parkCode: 'zion', fullName: 'INJECTED PARK' }],
        evidence: { npsSnapshotId: 'INJECTED-SNAPSHOT', weatherSource: 'INJECTED-WEATHER' },
      }),
      expectedPreviousVersion: V,
      expectedPreviousRevision: 1,
    }));
  });

  test('POLICY B — the prose revision is accepted as a succession', () => {
    expect(out.report.persistenceDecision).toBe('accept');
    expect(out.report.persistenceReason).toBe('newer_revision');
    expect(out.report.storedResponseRevisionAfter).toBe(2);
  });

  test('the two fields the controller freezes ARE byte-identical', () => {
    expect(stable(out.after.plan.days)).toBe(stable(out.before.plan.days));
    expect(out.report.storedItineraryHashAfter).toBe(IH);
  });

  /**
   * D1 REGRESSION (was `test.failing` in Stage 14.7F4A).
   *
   * The freeze used to be built as `{ ...incomingPlan, days, itineraryHash }`,
   * so every other canonical field was taken verbatim from a revision-2 write.
   * `buildFrozenSuccessionPlan` now starts from the STORED plan, which makes
   * freezing the default and mutation the whitelisted exception.
   */
  test('D1 §3 — every non-progression plan field is frozen', () => {
    const FROZEN_FIELDS = [
      'days', 'stops', 'coordinates', 'provenance', 'warnings',
      'totalDurationMinutes', 'difficulty', 'parks', 'evidence',
      'planHash', 'itineraryHash',
    ];
    const drift = FROZEN_FIELDS.filter(
      (f) => stable(out.after.plan?.[f]) !== stable(out.before.plan?.[f])
    );
    expect(drift).toEqual([]);
  });

  test('D1 §3 — no injected plan value survives the freeze', () => {
    expect(stable(out.after)).not.toContain('INJECTED');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §4 — Case 14: revision 2 targeting an UNKNOWN responseId
// ─────────────────────────────────────────────────────────────────────────────
describe('§4 Case 14 — revision 2 targeting an unknown responseId', () => {
  const UNKNOWN = 'resp-does-not-exist';

  let out;
  beforeEach(async () => {
    out = record('case14', await runCase({
      conversation: [
        storedUserMessage(),
        storedShell(),
        terminalMessage({ id: 2001, responseId: UNKNOWN, content: 'Prose for a response that does not exist.' }),
      ],
      plan: terminalPlan({ responseId: UNKNOWN }),
      expectedPreviousVersion: V,
      expectedPreviousRevision: 1,
    }));
  });

  test('rejected under the repository category for an unresolvable target', () => {
    // The repo has no `unknown_response` category; `different_response_same_version`
    // is its established equivalent — an id that does not own the version slot.
    expect(out.report.persistenceDecision).toBe('conflict');
    expect(out.report.persistenceReason).toBe('different_response_same_version');
    expect(out.res.body.success).toBe(false);
  });

  test('§6 — the frozen-itinerary succession policy never ran', () => {
    expect(out.res.body.planPersistence.revisionSuccession).toBe(false);
  });

  test('§1 — the 200 carries an explicit non-accept decision', () => {
    expect(out.report.httpStatus).toBe(200);
    expect(out.res.body.success).toBe(false);
    expect(['stale', 'conflict']).toContain(out.report.persistenceDecision);
  });

  test('zero mutation', () => {
    expect(out.report.canonicalStateMutated).toBe(false);
  });

  test('no response id is substituted — stored identity still names the real turn', () => {
    expect(out.report.storedResponseIdAfter).toBe(R);
    expect(out.report.storedResponseIdAfter).not.toBe(UNKNOWN);
  });

  test('no prose is written into another response', () => {
    expect(out.afterMsg.content).toBe('');
    expect(stable(out.after)).not.toContain('Prose for a response that does not exist.');
  });

  test('no new assistant turn is appended', () => {
    const assistants = out.after.conversation.filter((m) => m.role === 'assistant');
    expect(assistants).toHaveLength(1);
  });

  test('no revision advances', () => {
    expect(out.report.storedResponseRevisionAfter).toBe(1);
    expect(out.afterMsg.responseRevision).toBe(1);
  });

  test('it is NOT classified as idempotent', () => {
    expect(out.report.persistenceDecision).not.toBe('idempotent');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §4b — the smuggle variant: valid plan identity, extra unknown assistant turn
// ─────────────────────────────────────────────────────────────────────────────
describe('§4b Case 14b — valid target identity carrying an extra unknown assistant turn', () => {
  let out;
  beforeEach(async () => {
    out = record('case14b', await runCase({
      conversation: [
        storedUserMessage(),
        terminalMessage(),
        { id: 2002, role: 'assistant', content: 'SMUGGLED prose.', responseId: 'resp-smuggled', responseVersion: V, responseRevision: 2, lifecycleStatus: 'prose_ready', itineraryHash: IH, contentHash: 'x' },
      ],
      plan: terminalPlan(),
      expectedPreviousVersion: V,
      expectedPreviousRevision: 1,
    }));
  });

  /**
   * D2 REGRESSION (was `test.failing` in Stage 14.7F4A).
   *
   * Identity resolution reads the plan, but the conversation used to be written
   * wholesale — so a write naming a VALID target could carry an extra assistant
   * turn under an unvalidated response identity and have it persisted.
   * `validateAssistantMutationScope` now bounds a canonical write to exactly one
   * changed assistant turn.
   */
  test('D2 §6 — bounded 4xx validation failure', () => {
    expect(out.report.httpStatus).toBe(400);
    expect(out.res.body.code).toBe('unrelated_assistant_mutation');
    expect(out.res.body.category).toBe('canonical_target_validation');
  });

  test('D2 §6 — zero mutation', () => {
    expect(out.report.canonicalStateMutated).toBe(false);
  });

  test('D2 §6 — the target response does not advance and no prose is written', () => {
    expect(out.report.storedResponseRevisionAfter).toBe(1);
    expect(out.afterMsg.content).toBe('');
    expect(out.afterMsg.responseRevision).toBe(1);
  });

  test('D2 §6 — the extra assistant response is not appended', () => {
    const assistants = out.after.conversation.filter((m) => m.role === 'assistant');
    expect(assistants.map((m) => m.responseId)).toEqual([R]);
    expect(stable(out.after)).not.toContain('SMUGGLED');
  });

  test('D2 §6 — the plan does not change', () => {
    expect(stable(out.after.plan)).toBe(stable(out.before.plan));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §5 — Case 15: revision 2 targeting the WRONG responseVersion
// ─────────────────────────────────────────────────────────────────────────────
describe('§5 Case 15a — older responseVersion (N-1) must be a bounded stale result', () => {
  let out;
  beforeEach(async () => {
    out = record('case15a', await runCase({
      conversation: [storedUserMessage(), terminalMessage({ responseVersion: V - 1 })],
      plan: terminalPlan({ responseVersion: V - 1 }),
      expectedPreviousRevision: 1,
    }));
  });

  test('classified stale', () => {
    expect(out.report.persistenceDecision).toBe('stale');
    expect(out.report.persistenceReason).toBe('older_version');
    expect(out.res.body.success).toBe(false);
  });

  test('§6 — the frozen-itinerary succession policy never ran', () => {
    expect(out.res.body.planPersistence.revisionSuccession).toBe(false);
  });

  test('no alternate response version is substituted', () => {
    expect(out.afterMsg.responseVersion).toBe(V);
    expect(out.after.plan.responseVersion).toBe(V);
  });

  test('zero mutation, stored version stays N', () => {
    expect(out.report.canonicalStateMutated).toBe(false);
    expect(out.report.storedResponseVersionAfter).toBe(V);
    expect(out.report.storedResponseRevisionAfter).toBe(1);
    expect(out.afterMsg.content).toBe('');
  });
});

describe('§5 Case 15b — future responseVersion (N+1) must be a bounded conflict result', () => {
  let out;
  beforeEach(async () => {
    out = record('case15b', await runCase({
      conversation: [storedUserMessage(), terminalMessage({ responseVersion: V + 1 })],
      plan: terminalPlan({ responseVersion: V + 1 }),
      expectedPreviousRevision: 1,
    }));
  });

  /**
   * DEFECT D3 — the most serious of the four.
   *
   * `decidePersistenceOutcome` evaluates `expectedPreviousRevision` ONLY inside
   * the same-version branch. A revision-2 write that names a FUTURE version
   * (N+1) while asserting `expectedPreviousRevision: 1` therefore falls through
   * to the version branch, where — with no `expectedPreviousVersion` to
   * constrain it — it is ACCEPTED as `newer_version`.
   *
   * The write consumes a new turn slot (N → N+1), advances the revision to 2,
   * and destroys the revision-1 itinerary checkpoint of turn N, even though the
   * client explicitly claimed to be succeeding revision 1 of turn N.
   */
  test('D3 §7 — a future-version SUCCESSION CLAIM is bounded-conflicted', () => {
    expect(out.report.persistenceDecision).toBe('conflict');
    expect(out.report.persistenceReason).toBe('expected_revision_but_none_stored');
    expect(out.res.body.success).toBe(false);
  });

  test('D3 §7 — zero mutation; the revision-1 checkpoint of turn N survives', () => {
    expect(out.report.canonicalStateMutated).toBe(false);
    expect(out.report.storedResponseVersionAfter).toBe(V);
    expect(out.report.storedResponseRevisionAfter).toBe(1);
    expect(out.afterMsg.content).toBe('');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §7 — Case 16: top-level (plan) identity vs nested (conversation) identity
// ─────────────────────────────────────────────────────────────────────────────
describe('§7 Case 16 — plan identity disagreeing with nested canonical response identity', () => {
  let out;
  beforeEach(async () => {
    out = record('case16', await runCase({
      // plan names the REAL response R; the conversation's terminal assistant
      // message names a different one. Neither may silently win.
      conversation: [
        storedUserMessage(),
        terminalMessage({ id: 3001, responseId: 'resp-nested-other', content: 'Prose under a different identity.' }),
      ],
      plan: terminalPlan(),
      expectedPreviousVersion: V,
      expectedPreviousRevision: 1,
    }));
  });

  /**
   * DEFECT D4 — top-level (plan) identity silently overrides nested identity.
   *
   * `extractIncomingResponseIdentity` takes the PLAN identity first and only
   * falls back to the conversation. `validatePlanAgreement` cross-checks the
   * plan against its owning message — but when no incoming message carries the
   * plan's responseId it finds no owner and returns `pass()`, so a disagreement
   * is never detected.
   *
   * The write is then accepted as a succession of the plan's response R, while
   * `mergeTerminalRevisionIntoConversation` finds no incoming message for R and
   * returns the conversation untouched. Result: the stored revision-1 shell for
   * R is REPLACED by prose carrying a different responseId, and the trip ends up
   * with `plan.responseId === R` and no conversation message for R at all.
   */
  test('D4 §9 — bounded 4xx identity-validation failure', () => {
    expect(out.report.httpStatus).toBe(400);
    expect(out.res.body.code).toBe('plan_message_identity_mismatch');
    expect(out.res.body.category).toBe('canonical_target_validation');
  });

  test('D4 §9 — zero mutation; the canonical unit stays whole', () => {
    expect(out.report.canonicalStateMutated).toBe(false);
    expect(out.after.plan.responseId).toBe(R);
    expect(canonicalAssistant(out.after.conversation, R)).not.toBeNull();
    expect(canonicalAssistant(out.after.conversation, R).content).toBe('');
    expect(stable(out.after)).not.toContain('Prose under a different identity.');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §7/§8 — direct terminal is a DIFFERENT thing from succession
// ─────────────────────────────────────────────────────────────────────────────
describe('§7/§8 — direct-terminal new turn at N+1 stays supported', () => {
  const NEW_ID = 'resp-canonical-B';
  const NEW_IH = 'itinerary-hash-turn-5';

  /** A brand-new logical turn landing straight at the terminal revision. */
  const directTerminalBody = (over = {}) => ({
    conversation: [
      storedUserMessage(),
      storedShell(),
      { id: 1002, role: 'user', content: 'Now make it four days' },
      {
        id: 1003, role: 'assistant', content: 'Here is your four-day itinerary.',
        responseId: NEW_ID, responseVersion: V + 1, responseRevision: 2,
        lifecycleStatus: 'prose_ready', contentHash: 'ch-turn-5', itineraryHash: NEW_IH,
      },
    ],
    plan: {
      ...storedPlanFixture(),
      responseId: NEW_ID, responseVersion: V + 1, responseRevision: 2,
      lifecycleStatus: 'prose_ready', contentHash: 'ch-turn-5', itineraryHash: NEW_IH,
    },
    ...over,
  });

  test('accepted and classified explicitly as direct terminal', async () => {
    const out = record('directTerminal', await runCase(directTerminalBody()));
    expect(out.res.body.success).toBe(true);
    expect(out.report.persistenceDecision).toBe('accept');
    expect(out.report.persistenceReason).toBe('direct_terminal');
    expect(out.res.body.planPersistence.revisionSuccession).toBe(false);
    expect(out.report.storedResponseVersionAfter).toBe(V + 1);
    expect(out.report.storedResponseIdAfter).toBe(NEW_ID);
  });

  test('the prior turn is preserved, not overwritten', async () => {
    const out = await runCase(directTerminalBody());
    const prior = canonicalAssistant(out.after.conversation, R);
    expect(prior).not.toBeNull();
    expect(prior.responseRevision).toBe(1);
    expect(prior.content).toBe('');
  });

  test('a legacy write with NO explicit revision is still direct terminal', async () => {
    const body = directTerminalBody();
    delete body.conversation[3].responseRevision;
    delete body.plan.responseRevision;
    const out = await runCase(body);
    expect(out.report.persistenceDecision).toBe('accept');
    expect(out.report.persistenceReason).toBe('direct_terminal');
  });

  test('direct terminal may NOT claim a revision-1 predecessor', async () => {
    const out = await runCase(directTerminalBody({ expectedPreviousRevision: 1 }));
    expect(out.res.body.success).toBe(false);
    expect(out.report.persistenceDecision).toBe('conflict');
    expect(out.report.persistenceReason).toBe('expected_revision_but_none_stored');
    expect(out.report.canonicalStateMutated).toBe(false);
  });

  test('reusing the stored responseId at a new version is rejected as ambiguous', async () => {
    // Two assistant turns would then claim the same response — caught by target
    // resolution before classification is even reached.
    const body = directTerminalBody();
    body.conversation[3].responseId = R;
    body.plan.responseId = R;
    const out = await runCase(body);
    expect(out.report.httpStatus).toBe(400);
    expect(out.res.body.code).toBe('canonical_target_ambiguous');
    expect(out.report.canonicalStateMutated).toBe(false);
  });

  test('reusing the stored responseId with the shell dropped is a classification conflict', async () => {
    // Only one assistant turn carries the id, so this reaches the resolver and
    // must be caught there — the second, independent layer of the same rule.
    const body = directTerminalBody();
    body.conversation = [
      storedUserMessage(),
      { id: 1002, role: 'user', content: 'Now make it four days' },
      { ...body.conversation[3], responseId: R },
    ];
    body.plan.responseId = R;
    const out = await runCase(body);
    expect(out.res.body.success).toBe(false);
    expect(out.report.persistenceDecision).toBe('conflict');
    expect(out.report.persistenceReason).toBe('response_id_version_reuse');
    expect(out.report.canonicalStateMutated).toBe(false);
  });

  test('skipping more than one logical version is a conflict', async () => {
    const body = directTerminalBody();
    body.conversation[3].responseVersion = V + 3;
    body.plan.responseVersion = V + 3;
    const out = await runCase(body);
    expect(out.res.body.success).toBe(false);
    expect(out.report.persistenceReason).toBe('version_jump');
    expect(out.report.canonicalStateMutated).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §5 — remaining canonical-target rejections
// ─────────────────────────────────────────────────────────────────────────────
describe('§5 — one canonical assistant target per write', () => {
  test('an ambiguous target (two assistant turns for the same response) is rejected', async () => {
    const out = await runCase({
      conversation: [storedUserMessage(), terminalMessage(), terminalMessage({ id: 4001 })],
      plan: terminalPlan(),
      expectedPreviousRevision: 1,
    });
    expect(out.report.httpStatus).toBe(400);
    expect(out.res.body.code).toBe('canonical_target_ambiguous');
    expect(out.report.canonicalStateMutated).toBe(false);
  });

  test('a plan carrying half an identity is rejected, not read as legacy', async () => {
    const plan = terminalPlan();
    delete plan.responseVersion;
    const out = await runCase({ conversation: [storedUserMessage(), terminalMessage()], plan });
    expect(out.report.httpStatus).toBe(400);
    expect(out.res.body.code).toBe('plan_identity_incomplete');
    expect(out.report.canonicalStateMutated).toBe(false);
  });

  test('a plan disagreeing with its own owning message on version is rejected', async () => {
    const out = await runCase({
      conversation: [storedUserMessage(), terminalMessage()],
      plan: terminalPlan({ responseVersion: V + 1 }),
      expectedPreviousRevision: 1,
    });
    expect(out.report.httpStatus).toBe(400);
    expect(out.res.body.code).toBe('plan_response_version_mismatch');
    expect(out.report.canonicalStateMutated).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §13 — complete frozen-plan comparison evidence
// ─────────────────────────────────────────────────────────────────────────────
describe('§13 — frozen-plan equality report', () => {
  const { compareFrozenSuccessionPlan } = require('../../utils/frozenSuccessionPlan');

  test('immutableFieldsChanged is empty for a mutated case-13 write', async () => {
    const out = await runCase({
      conversation: [storedUserMessage(), terminalMessage()],
      plan: terminalPlan({
        planHash: 'plan-hash-MUTATED',
        days: [{ day: 9, parkCode: 'zion', stops: [{ name: 'INJECTED-DAY' }] }],
        stops: [{ name: 'INJECTED-STOP' }],
        coordinates: { lat: 0, lng: 0 },
        provenance: { generator: 'INJECTED' },
        warnings: ['INJECTED-WARNING'],
        totalDurationMinutes: 99999,
        difficulty: 'INJECTED',
        parks: [{ parkCode: 'zion' }],
        evidence: { npsSnapshotId: 'INJECTED' },
        feasibilityIssues: ['INJECTED-FEASIBILITY'],
        smuggledUnknownField: 'INJECTED-UNKNOWN',
      }),
      expectedPreviousVersion: V,
      expectedPreviousRevision: 1,
    });

    const evidence = compareFrozenSuccessionPlan({ before: out.before.plan, after: out.after.plan });
    RESULTS.frozenPlanEvidence = evidence;

    expect(out.report.persistenceDecision).toBe('accept');
    expect(evidence.immutableFieldsChanged).toEqual([]);
    // Every field the stage enumerates is actually in the compared set.
    expect(evidence.immutableFieldsCompared).toEqual(expect.arrayContaining([
      'days', 'stops', 'coordinates', 'provenance', 'warnings',
      'totalDurationMinutes', 'difficulty', 'parks', 'evidence',
      'planHash', 'itineraryHash', 'type', 'responseId', 'responseVersion',
    ]));
    // An unrecognized incoming field is dropped, never silently merged in.
    expect(out.after.plan.smuggledUnknownField).toBeUndefined();
    expect(out.after.plan.feasibilityIssues).toBeUndefined();
  });

  test('the response reports that stored canonical plan data won', async () => {
    const out = await runCase({
      conversation: [storedUserMessage(), terminalMessage()],
      plan: terminalPlan({ difficulty: 'INJECTED' }),
      expectedPreviousRevision: 1,
    });
    expect(out.res.body.planPersistence.frozenPlanRetained).toBe(true);
    // Bounded metadata only — no rejected plan content is echoed back.
    expect(JSON.stringify(out.res.body.planPersistence)).not.toContain('INJECTED');
  });

  test('whitelisted lifecycle progression fields DO advance', async () => {
    const out = await runCase({
      conversation: [storedUserMessage(), terminalMessage()],
      plan: terminalPlan({ proseReadyAt: '2026-06-02T00:00:00.000Z', auditTrail: { provider: 'claude' } }),
      expectedPreviousRevision: 1,
    });
    expect(out.after.plan.responseRevision).toBe(2);
    expect(out.after.plan.lifecycleStatus).toBe('prose_ready');
    expect(out.after.plan.contentHash).toBe('content-hash-rev-2');
    expect(out.after.plan.proseReadyAt).toBe('2026-06-02T00:00:00.000Z');
    expect(out.after.plan.auditTrail).toEqual({ provider: 'claude' });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §6 — identity-validation ORDER
// ─────────────────────────────────────────────────────────────────────────────
describe('§6 — validate shape → resolve identity → classify → freeze → mutate', () => {
  const fs2 = require('fs');
  const controllerSrc = fs2.readFileSync(
    path.resolve(__dirname, '../../controllers/tripController.js'), 'utf8'
  );
  const updateSrc = controllerSrc.slice(controllerSrc.indexOf('exports.updateTrip'));

  const at = (needle) => updateSrc.indexOf(needle);

  test('write-shape validation precedes identity resolution', () => {
    expect(at('validateTripWriteCandidate(')).toBeGreaterThan(-1);
    expect(at('validateTripWriteCandidate(')).toBeLessThan(at('resolveCanonicalResponsePersistence('));
  });

  test('identity resolution and classification precede the freeze policy', () => {
    expect(at('resolveCanonicalResponsePersistence('))
      .toBeLessThan(at('mergeTerminalRevisionIntoConversation('));
  });

  test('the freeze policy precedes the guarded mutation', () => {
    expect(at('mergeTerminalRevisionIntoConversation('))
      .toBeLessThan(at('findByIdAndUpdate('));
  });

  test('the freeze policy is gated on a CLASSIFIED valid succession', () => {
    // Structural guard: itinerary normalization is reachable only through the
    // resolver's verdict, never from request shape alone.
    expect(updateSrc).toMatch(
      /if \(resolution\.revisionSuccession && updateData\.conversation\) \{\s*updateData\.conversation = mergeTerminalRevisionIntoConversation\(/
    );
  });

  test('a rejected classification strips every response-coupled field before the write', () => {
    expect(updateSrc).toMatch(
      /if \(!resolution\.writeResponseCoupled\) \{\s*RESPONSE_COUPLED_FIELDS\.forEach\(field => delete updateData\[field\]\)/
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §6 — integration guard: normalization cannot rescue an invalid target
// ─────────────────────────────────────────────────────────────────────────────
describe('§6 — itinerary normalization never converts an invalid target into a valid one', () => {
  const INVALID_TARGETS = [
    ['unknown responseId', { responseId: 'resp-nowhere' }],
    ['older responseVersion', { responseVersion: V - 1 }],
  ];

  test.each(INVALID_TARGETS)('a rev-2 write with an %s is never accepted, even with a byte-correct itinerary', async (_label, override) => {
    const out = await runCase({
      conversation: [storedUserMessage(), terminalMessage(override)],
      // The itinerary is IDENTICAL to the stored one — the strongest possible
      // invitation for a freeze/normalization path to accept the request.
      plan: terminalPlan({ ...override, days: storedPlanFixture().days, itineraryHash: IH }),
      expectedPreviousRevision: 1,
    });

    expect(out.res.body.success).toBe(false);
    expect(out.report.canonicalStateMutated).toBe(false);
    expect(out.res.body.planPersistence.revisionSuccession).toBe(false);
    expect(out.report.storedResponseIdAfter).toBe(R);
    expect(out.report.storedResponseVersionAfter).toBe(V);
    expect(out.report.storedResponseRevisionAfter).toBe(1);
    expect(canonicalAssistant(out.after.conversation, R).content).toBe('');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §15 — valid-path regressions
// ─────────────────────────────────────────────────────────────────────────────
describe('§15 — a new revision-1 turn on an existing trip, then its revision 2', () => {
  const ID2 = 'resp-canonical-C';
  const IH2 = 'itinerary-hash-turn-5';

  const newShell = () => ({
    id: 5001, role: 'assistant', content: '',
    responseId: ID2, responseVersion: V + 1, responseRevision: 1,
    lifecycleStatus: 'itinerary_ready', itineraryHash: IH2,
  });

  const newPlan = (over = {}) => ({
    ...storedPlanFixture(),
    responseId: ID2, responseVersion: V + 1, responseRevision: 1,
    lifecycleStatus: 'itinerary_ready', itineraryHash: IH2, contentHash: null,
    ...over,
  });

  test('revision 1 lands, then revision 2 fills the SAME slot', async () => {
    const tripId = await seedIsolatedTrip();
    const put = (body) => request(app)
      .put(`/api/trips/${tripId}`)
      .set('Authorization', `Bearer ${token}`)
      .send(body);

    const base = [storedUserMessage(), storedShell(), { id: 5000, role: 'user', content: 'Add a day' }];

    const r1 = await put({ conversation: [...base, newShell()], plan: newPlan() });
    expect(r1.body.planPersistence.outcome).toBe('accept');
    expect(r1.body.planPersistence.reason).toBe('newer_version');

    const afterR1 = await readStored(tripId);
    expect(afterR1.plan.responseVersion).toBe(V + 1);
    expect(afterR1.plan.responseRevision).toBe(1);

    const terminal = {
      ...newShell(), id: 9999, content: 'Terminal prose for turn five.',
      responseRevision: 2, previousRevision: 1,
      lifecycleStatus: 'prose_ready', contentHash: 'ch-turn-5',
    };
    const r2 = await put({
      conversation: [...base, terminal],
      plan: newPlan({ responseRevision: 2, lifecycleStatus: 'prose_ready', contentHash: 'ch-turn-5' }),
      expectedPreviousRevision: 1,
    });
    expect(r2.body.planPersistence.outcome).toBe('accept');
    expect(r2.body.planPersistence.reason).toBe('newer_revision');
    expect(r2.body.planPersistence.revisionSuccession).toBe(true);

    const after = await readStored(tripId);
    const turns = after.conversation.filter((m) => m.role === 'assistant');

    // No duplicate assistant turn, no duplicate plan, same numeric id preserved.
    expect(turns).toHaveLength(2);
    const t5 = canonicalAssistant(after.conversation, ID2);
    expect(t5.id).toBe(newShell().id);
    expect(t5.content).toBe('Terminal prose for turn five.');
    expect(t5.responseRevision).toBe(2);

    // The PRIOR turn is byte-equivalent to what it was.
    const prior = canonicalAssistant(after.conversation, R);
    expect(prior.content).toBe('');
    expect(prior.responseRevision).toBe(1);
    expect(prior.responseVersion).toBe(V);

    // Same complete frozen plan and identity.
    expect(after.plan.responseVersion).toBe(V + 1);
    expect(after.plan.responseRevision).toBe(2);
    expect(after.plan.itineraryHash).toBe(IH2);
    expect(stable(after.plan.days)).toBe(stable(afterR1.plan.days));
  });

  test('unchanged historical state plus a valid modern turn is accepted', async () => {
    // A trip carrying a legacy message with no canonical identity at all.
    const legacy = { id: 1, role: 'assistant', content: 'legacy answer' };
    const trip = await TripPlan.create({
      userId,
      title: 'Historical fixture',
      conversation: [{ id: 0, role: 'user', content: 'old question' }, legacy, storedUserMessage(), storedShell()],
      plan: storedPlanFixture(),
    });
    const tripId = trip._id.toString();

    const res = await request(app)
      .put(`/api/trips/${tripId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        conversation: [{ id: 0, role: 'user', content: 'old question' }, legacy, storedUserMessage(), terminalMessage()],
        plan: terminalPlan(),
        expectedPreviousRevision: 1,
      });

    expect(res.status).toBe(200);
    expect(res.body.planPersistence.outcome).toBe('accept');

    const after = await readStored(tripId);
    // The historical message passed through untouched.
    expect(after.conversation.find((m) => m.id === 1).content).toBe('legacy answer');
    expect(canonicalAssistant(after.conversation, R).content).toBe(terminalMessage().content);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §8 — the normal path must still work
// ─────────────────────────────────────────────────────────────────────────────
describe('§8 — valid revision 1 → 2 succession still persists', () => {
  let out;
  beforeEach(async () => {
    out = record('validSuccession', await runCase({
      conversation: [storedUserMessage(), terminalMessage()],
      plan: terminalPlan(),
      expectedPreviousVersion: V,
      expectedPreviousRevision: 1,
    }));
  });

  test('accepted as a revision succession', () => {
    expect(out.res.status).toBe(200);
    expect(out.res.body.success).toBe(true);
    expect(out.report.persistenceDecision).toBe('accept');
    expect(out.report.persistenceReason).toBe('newer_revision');
    expect(out.res.body.planPersistence.revisionSuccession).toBe(true);
  });

  test('prose lands in the SAME message slot', () => {
    const assistants = out.after.conversation.filter((m) => m.role === 'assistant');
    expect(assistants).toHaveLength(1);
    expect(assistants[0].id).toBe(storedShell().id);
    expect(assistants[0].content).toBe(terminalMessage().content);
    expect(assistants[0].responseRevision).toBe(2);
  });

  test('same plan, same itinerary hash', () => {
    expect(out.report.storedItineraryHashAfter).toBe(IH);
    expect(stable(out.after.plan.days)).toBe(stable(out.before.plan.days));
    expect(out.report.storedResponseVersionAfter).toBe(V);
    expect(out.report.storedResponseRevisionAfter).toBe(2);
  });
});
