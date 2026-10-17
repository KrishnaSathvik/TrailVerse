'use strict';

/**
 * Plan-stage capture files are keyed on runId + attempt only, so every turn in a
 * gate writes `<runId>__attempt-1.json`. Merge-on-write (added so the
 * repair-contract write does not erase the validation write) must therefore be
 * scoped to ONE capturer — one turn — or a turn inherits the previous turn's
 * fields.
 *
 * That is not hypothetical: in gate #4, C1 passed on attempt 1 with
 * `reasonCodes: []`, and the empty array inherited B2's
 * `["zero_duration_stops"]`, making a clean pass read as a structural failure.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

describe('merge-on-write is scoped to a single capturer', () => {
  const realEnv = { ...process.env };
  let dir;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'plan-stage-'));
    jest.resetModules();
    // Capture is off by default. Turn it on for real, or these tests pass
    // vacuously by taking the `!cap.active` early return.
    process.env.TRAILIE_EVAL_CAPTURE_PLAN_STAGES = 'true';
    process.env.NODE_ENV = 'test';
  });
  afterEach(() => {
    process.env = { ...realEnv };
    fs.rmSync(dir, { recursive: true, force: true });
  });

  function loadCapturer() {
    return require('../planStageCapture');
  }

  it('merges the two writes that belong to the SAME attempt of one turn', () => {
    const { makePlanStageCapturer } = loadCapturer();
    const cap = makePlanStageCapturer({ runId: `merge-test-${Date.now()}` });
    expect(cap.active).toBe(true);
    const first = cap.capture({
      attempt: 1,
      rawPlan: { days: [{ day: 1, stops: [{ name: 'A Place', duration: 0 }] }] },
      reasonCodes: ['zero_duration_stops'],
    });
    cap.capture({ attempt: 1, attemptProgress: { progress: 'NO_PROGRESS', satisfied: [], failed: ['positive_stop_durations'], regressed: [], discovered: [] } });
    const merged = JSON.parse(fs.readFileSync(first, 'utf8'));
    expect(merged.reasonCodes).toEqual(['zero_duration_stops']);
    expect(merged.attemptProgress.progress).toBe('NO_PROGRESS');
    expect(merged.rawPlan.days[0].stops[0].name).toBe('A Place');
    fs.rmSync(first, { force: true });
  });

  it('a NEW capturer never inherits the previous turn\'s fields', () => {
    const { makePlanStageCapturer } = loadCapturer();
    const runId = `merge-test-turnsep-${Date.now()}`;
    const turnOne = makePlanStageCapturer({ runId });
    expect(turnOne.active).toBe(true);
    const file = turnOne.capture({
      attempt: 1,
      rawPlan: { days: [{ day: 1, stops: [{ name: 'Broken', duration: 0 }] }] },
      reasonCodes: ['zero_duration_stops'],
    });

    // A different turn, same runId, same attempt number, and it PASSED.
    const turnTwo = makePlanStageCapturer({ runId });
    turnTwo.capture({
      attempt: 1,
      rawPlan: { days: [{ day: 1, stops: [{ name: 'Red Hills Visitor Center', duration: 45 }] }] },
      reasonCodes: [],
    });

    const written = JSON.parse(fs.readFileSync(file, 'utf8'));
    // The exact gate #4 contamination: a clean pass reading as a failure.
    expect(written.reasonCodes).toEqual([]);
    expect(written.rawPlan.days[0].stops[0].name).toBe('Red Hills Visitor Center');
    fs.rmSync(file, { force: true });
  });
});
