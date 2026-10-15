'use strict';

const fs = require('fs');
const path = require('path');
const { PRIVATE_DIR, captureProposal } = require('../trailieDiagnosisCapture');

const responseId = 'diagnosis-proposal-rounds-test';
const file = path.join(PRIVATE_DIR, `${responseId}__proposal.json`);

describe('Trailie diagnosis proposal capture', () => {
  const previous = {
    NODE_ENV: process.env.NODE_ENV,
    TRAILIE_DIAGNOSIS_CAPTURE: process.env.TRAILIE_DIAGNOSIS_CAPTURE,
  };

  beforeEach(() => {
    process.env.NODE_ENV = 'test';
    process.env.TRAILIE_DIAGNOSIS_CAPTURE = 'true';
    try { fs.unlinkSync(file); } catch { /* absent */ }
  });

  afterAll(() => {
    try { fs.unlinkSync(file); } catch { /* absent */ }
    if (previous.NODE_ENV == null) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previous.NODE_ENV;
    if (previous.TRAILIE_DIAGNOSIS_CAPTURE == null) delete process.env.TRAILIE_DIAGNOSIS_CAPTURE;
    else process.env.TRAILIE_DIAGNOSIS_CAPTURE = previous.TRAILIE_DIAGNOSIS_CAPTURE;
  });

  test('preserves rejected and accepted correction rounds', () => {
    captureProposal({ responseId, proposed: { plan: { parkName: 'Zion', days: [{ dayNumber: 1, label: 'First', stops: [] }] } },
      issues: ['day_type_inconsistent'], accepted: false });
    captureProposal({ responseId, proposed: { plan: { parkName: 'Zion', days: [{ dayNumber: 1, label: 'Corrected', stops: [] }] } },
      issues: [], accepted: true });

    const captured = JSON.parse(fs.readFileSync(file, 'utf8'));
    expect(captured.proposalRounds).toHaveLength(2);
    expect(captured.proposalRounds[0]).toMatchObject({ accepted: false, issues: ['day_type_inconsistent'] });
    expect(captured.proposalRounds[1]).toMatchObject({ accepted: true, issues: [] });
    expect(captured.proposed.days[0].label).toBe('Corrected');
  });

  test('captures the applied patch candidate, exact declarations and operation location', () => {
    const evaluatedPlan = { days: [{ dayNumber: 2, stops: [], dayStructure: {
      type: 'transfer', startPeriod: 'morning', endPeriod: 'evening', summary: 'Sensitive text',
      blocks: [{ kind: 'downtime', periods: ['morning', 'evening'], label: 'Private', note: 'Private', stopIds: [] }],
    } }] };
    captureProposal({ responseId, proposed: { response: 'Private response', memory_updates: [{ sourceQuote: 'Secret quote' }],
      plan_patch: { operations: [{ op: 'update_day', dayNumber: 2, day: evaluatedPlan.days[0] }] } },
    evaluatedPlan, touchedDayNumbers: [2], issues: ['day_type_inconsistent'], accepted: false });
    const captured = JSON.parse(fs.readFileSync(file, 'utf8'));
    expect(captured.dayTypeDiagnosis).toMatchObject({ source: 'guard_candidate', status: 'complete', days: [{
      dayNumber: 2, conflicts: [{ rule: 'missing_matching_block', expected: { requiredBlockKind: 'transfer' } }],
    }] });
    expect(captured.patchOperations).toEqual([{ operationIndex: 0, op: 'update_day', dayNumber: 2 }]);
    expect(JSON.stringify(captured)).not.toMatch(/Private|Secret|Sensitive/);
  });

  test.each(['production', 'disabled'])('does no capture work when %s', mode => {
    if (mode === 'production') process.env.NODE_ENV = 'production';
    else process.env.TRAILIE_DIAGNOSIS_CAPTURE = 'false';
    const proposed = { get plan() { throw new Error('must not inspect proposal'); } };
    expect(captureProposal({ responseId, proposed })).toBeNull();
    expect(fs.existsSync(file)).toBe(false);
  });
});
