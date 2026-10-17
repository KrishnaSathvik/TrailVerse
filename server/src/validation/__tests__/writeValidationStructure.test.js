'use strict';

/**
 * Stage 14.7F4 §13 — structural guards.
 *
 * Defect C was invisible because nothing asserted that the update path validated
 * anything. These checks are deliberately behavioural-by-inspection rather than
 * line-number assertions, so they survive ordinary edits but fail if the
 * validation boundary is removed or bypassed.
 */

const fs = require('fs');
const path = require('path');

const SERVER_ROOT = path.join(__dirname, '../../..');
const read = (rel) => fs.readFileSync(path.join(SERVER_ROOT, rel), 'utf8');

const controllerSrc = read('src/controllers/tripController.js');
const handlerSrc = read('src/middleware/errorHandler.js');
const schemaSrc = read('src/models/TripPlan.js');

describe('§13 — the write validator is actually wired in', () => {
  test('the trip controller imports the shared write contract', () => {
    expect(controllerSrc).toMatch(/require\('\.\.\/validation\/tripWriteContract'\)/);
  });

  test('both the create and update paths call it', () => {
    const calls = controllerSrc.match(/validateTripWriteCandidate\(/g) || [];
    expect(calls.length).toBeGreaterThanOrEqual(2);
    expect(controllerSrc).toMatch(/operation: 'create'/);
    expect(controllerSrc).toMatch(/operation: 'update'/);
  });

  test('validation precedes the persistence decision and the atomic mutation', () => {
    const validateAt = controllerSrc.indexOf("operation: 'update'");
    const resolveAt = controllerSrc.indexOf('resolveCanonicalResponsePersistence({', validateAt - 4000);
    const mutateAt = controllerSrc.indexOf('findByIdAndUpdate', validateAt);
    expect(validateAt).toBeGreaterThan(-1);
    expect(validateAt).toBeLessThan(controllerSrc.indexOf('resolveCanonicalResponsePersistence({', validateAt));
    expect(validateAt).toBeLessThan(mutateAt);
  });

  test('an invalid candidate returns before reaching the mutation', () => {
    // The guard must short-circuit, not merely annotate the response.
    expect(controllerSrc).toMatch(/if \(!writeVerdict\.ok\) \{\s*return res\.status\(400\)/);
    expect(controllerSrc).toMatch(/if \(!createVerdict\.ok\) \{\s*return res\.status\(400\)/);
  });
});

describe('Stage 14.7F4B §10 — identity and scope are resolved INSIDE the validator', () => {
  const contractSrc = read('src/validation/tripWriteContract.js');
  const frozenSrc = read('src/utils/frozenSuccessionPlan.js');

  test('the write validator resolves the canonical target and the mutation scope', () => {
    expect(contractSrc).toMatch(/function resolveCanonicalWriteTarget\(/);
    expect(contractSrc).toMatch(/function validateAssistantMutationScope\(/);
    const at = (n) => contractSrc.indexOf(n, contractSrc.indexOf('function validateTripWriteCandidate'));
    // shape → target → scope, all before the validator returns.
    expect(at('resolveCanonicalWriteTarget({')).toBeGreaterThan(-1);
    expect(at('resolveCanonicalWriteTarget({')).toBeLessThan(at('validateAssistantMutationScope({'));
  });

  test('a plan with no owning assistant message can never pass', () => {
    // D4: the old code returned pass() when no owner was found.
    expect(contractSrc).toMatch(/plan_message_identity_mismatch/);
    expect(contractSrc).not.toMatch(/if \(!owner\) return pass\(\);/);
  });

  test('the freeze builds from the STORED plan, never by spreading the incoming one', () => {
    // D1: `{ ...incomingPlan, days, itineraryHash }` is exactly what must not return.
    expect(frozenSrc).toMatch(/const frozen = \{ \.\.\.storedPlan \}/);
    expect(controllerSrc).not.toMatch(/\.\.\.updateData\.plan,\s*\n\s*\/\/[^\n]*\n\s*days: trip\.plan\.days/);
    expect(controllerSrc).toMatch(/buildFrozenSuccessionPlan\(\{/);
  });

  test('revision semantics are resolved before a higher version is treated as ordinary', () => {
    const planSrc = read('src/utils/planPersistence.js');
    const branch = planSrc.slice(planSrc.indexOf('incoming.responseVersion < existing.responseVersion'));
    // D3: the succession claim must be rejected before the accept paths below it.
    expect(branch.indexOf('expectedPreviousRevision != null'))
      .toBeLessThan(branch.indexOf("reason: 'direct_terminal'"));
    expect(branch.indexOf('expectedPreviousRevision != null'))
      .toBeLessThan(branch.indexOf("reason: 'newer_version'"));
  });
});

describe('§13 — one rule source', () => {
  test('the schema defers to the shared predicate instead of redefining it', () => {
    expect(schemaSrc).toMatch(/require\('\.\.\/validation\/tripWriteContract'\)/);
    expect(schemaSrc).not.toMatch(/function isCanonicalRevisionOneShell/);
  });

  test('no controller defines its own revision-1 validity rule', () => {
    expect(controllerSrc).not.toMatch(/lifecycleStatus === 'itinerary_ready'\s*&&/);
  });
});

describe('§13 — errors are bounded', () => {
  test('cast failures are translated rather than escaping as 500', () => {
    expect(handlerSrc).toMatch(/err\.name === 'CastError'/);
    expect(handlerSrc).toMatch(/field_cast_failed/);
  });

  test('write-contract errors have a dedicated bounded branch', () => {
    expect(handlerSrc).toMatch(/isTripWriteContractError/);
  });

  test('raw Mongoose validation messages are no longer returned to clients', () => {
    // The previous handler joined err.errors[].message, which interpolates the
    // rejected value into the response body.
    expect(handlerSrc).not.toMatch(/\.map\(\(e\) => e\.message\)/);
    expect(handlerSrc).toMatch(/schema_validation_failed/);
  });

  test('stack traces are never sent outside development', () => {
    expect(handlerSrc).toMatch(/NODE_ENV === 'development'/);
  });
});

describe('§13 — no evaluation-only exemption exists', () => {
  test('validation is not skipped for tests or evaluation runs', () => {
    const suspicious = /(NODE_ENV\s*===\s*'test'|TRAILIE_EVAL|evaluationRunId)[^\n]*\n[^\n]*validateTripWriteCandidate/;
    expect(controllerSrc).not.toMatch(suspicious);
    expect(controllerSrc).not.toMatch(/skipValidation|bypassValidation/);
  });
});

describe('§10 — the runValidators decision is explicit, not implicit', () => {
  test('the conversation-replacing update documents why validators stay off', () => {
    // Recorded finding: runValidators would validate unchanged historical
    // messages and make older trips permanently unupdatable.
    expect(controllerSrc).toMatch(/runValidators/);
    expect(controllerSrc).toMatch(/historical/i);
  });
});
