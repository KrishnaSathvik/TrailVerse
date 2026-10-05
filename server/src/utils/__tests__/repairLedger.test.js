'use strict';

/**
 * P0-E/F/H/L/M — MONOTONIC REPAIR.
 *
 * The 2026-08-24 Canyonlands ladder was three fresh generations taking turns
 * forgetting different requirements:
 *
 *   attempt 1  sunset/golden-hour stops present, every duration 0
 *   attempt 2  durations fixed, the day collapsed to four stops
 *   attempt 3  durations back to 0
 *
 * The ledger's job is to make attempt N's instruction the CUMULATIVE acceptance
 * contract rather than the latest error, so a later attempt cannot casually lose
 * a requirement an earlier candidate already demonstrated is satisfiable.
 */

const { createRepairLedger, OBLIGATION_FOR_REASON_CODE } = require('../repairLedger');

const CANYONLANDS = {
  userPrompt: "Give us three relaxed days in Canyonlands. We care most about scenery, sunset views, and easy walks, and we don't want to spend the whole trip rushing between stops.",
  constraints: { durationDays: 3, pace: 'relaxed', fitness: 'easy', interests: ['scenic-drives'] },
};

describe('contract derivation', () => {
  it('derives the traveler contract from constraints and the prompt', () => {
    const ledger = createRepairLedger(CANYONLANDS);
    const ids = ledger.obligationIds();
    expect(ids).toEqual(expect.arrayContaining([
      'day_count',
      'non_empty_days',
      'positive_stop_durations',
      'experience_anchor_every_day',
      'day_coverage_every_day',
      'requested_golden_hour',
      'requested_hike',
      'requested_scenic',
      'requested_experience_coverage',
      'pace',
      'fitness',
      'interests',
    ]));
    expect(ids).not.toContain('requested_wildlife');
    expect(ids).not.toContain('backup_plan');
    expect(ids).not.toContain('requested_scenic_drive');
  });

  /**
   * Phase 12H2-A — requested-experience coverage now sees "scenery" and
   * "easy walks". The ledger still mirrors the validator: those asks are
   * obligations because completeness can now enforce them.
   */
  it('mirrors the validator, including newly covered scenery and easy-walk asks', () => {
    const ids = createRepairLedger(CANYONLANDS).obligationIds();
    expect(ids).toContain('requested_hike');
    expect(ids).toContain('requested_scenic');
    expect(ids).not.toContain('requested_scenic_drive');
    expect(createRepairLedger({
      userPrompt: 'three days with an easy walk each morning',
      constraints: { durationDays: 3 },
    }).obligationIds()).toContain('requested_hike');
  });

  // P0-J — `missing_requested_sunset` covers the whole golden-hour family. The
  // repair instruction must name what the traveler actually asked for.
  it('labels the golden-hour obligation with the words the traveler used', () => {
    expect(createRepairLedger(CANYONLANDS).labelFor('requested_golden_hour')).toMatch(/sunset/i);
    expect(createRepairLedger({
      userPrompt: 'three days in Canyonlands, we really want a sunrise viewpoint',
      constraints: { durationDays: 3 },
    }).labelFor('requested_golden_hour')).toMatch(/sunrise/i);
    expect(createRepairLedger({
      userPrompt: 'two days somewhere with good golden hour light',
      constraints: { durationDays: 2 },
    }).labelFor('requested_golden_hour')).toMatch(/golden hour/i);
  });

  it('never says "sunset" for a sunrise request', () => {
    const ledger = createRepairLedger({
      userPrompt: 'three relaxed days in Canyonlands, we want a sunrise stop and easy walks',
      constraints: { durationDays: 3 },
    });
    ledger.recordAttempt({ attempt: 1, reasonCodes: ['missing_requested_sunset'], evaluatedObligations: ledger.obligationIds() });
    const contract = ledger.buildRepairContract();
    expect(contract).toMatch(/sunrise/i);
    expect(contract).not.toMatch(/sunset/i);
  });

  it('maps every constructor repair code onto an obligation or leaves it explicit', () => {
    for (const code of [
      'zero_duration_stops', 'empty_day', 'empty_itinerary', 'underfilled_day_count',
      'missing_experience_anchor', 'insufficient_day_coverage', 'duplicate_base_experience',
      'missing_requested_hike', 'missing_requested_sunset', 'missing_requested_scenic',
      'missing_requested_wildlife', 'missing_requested_scenic_drive', 'missing_requested_geothermal',
      'missing_requested_experience_coverage', 'missing_backup_plan', 'constraint_eligibility_unknown',
    ]) {
      expect(OBLIGATION_FOR_REASON_CODE[code]).toBeTruthy();
    }
  });
});

describe('P0-K — offline repair simulation over the real Canyonlands ladder', () => {
  it('accumulates obligations instead of replacing them, and calls the regression', () => {
    const ledger = createRepairLedger(CANYONLANDS);

    // Candidate A — real attempt 1: golden-hour stops present, all durations 0.
    // Rejected by the early structural stage, so only structural obligations
    // were actually evaluated.
    const a = ledger.recordAttempt({
      attempt: 1,
      reasonCodes: ['zero_duration_stops'],
      evaluatedObligations: ['day_count', 'non_empty_days', 'positive_stop_durations'],
    });
    expect(a.progress).toBe('NO_PROGRESS');
    expect(a.failed).toEqual(['positive_stop_durations']);
    // Nothing tested the golden-hour ask, so nothing may claim it was satisfied.
    expect(a.satisfied).not.toContain('requested_golden_hour');

    let contract = ledger.buildRepairContract();
    expect(contract).toMatch(/MUST FIX:/);
    expect(contract).toMatch(/duration/i);
    // P0-F — the original contract travels with every repair.
    expect(contract).toMatch(/MUST PRESERVE:/);
    expect(contract).toMatch(/sunset/i);
    expect(contract).toMatch(/three|3-day|3 day/i);

    // Candidate B — synthetic: durations fixed, golden-hour ask now missing.
    const b = ledger.recordAttempt({
      attempt: 2,
      reasonCodes: ['missing_requested_sunset'],
      evaluatedObligations: ledger.obligationIds(),
    });
    expect(b.progress).toBe('PROGRESS');
    expect(b.satisfied).toContain('positive_stop_durations');
    expect(b.failed).toEqual(['requested_golden_hour']);

    contract = ledger.buildRepairContract();
    // Both obligations are now live: the newly discovered one AND the one a
    // previous candidate already proved satisfiable.
    expect(contract).toMatch(/MUST PRESERVE:[\s\S]*duration/i);
    expect(contract).toMatch(/MUST FIX:[\s\S]*sunset/i);

    // Candidate C — real attempt 3: durations back to 0. That is a regression,
    // not a fresh discovery.
    const c = ledger.recordAttempt({
      attempt: 3,
      reasonCodes: ['zero_duration_stops'],
      evaluatedObligations: ['day_count', 'non_empty_days', 'positive_stop_durations'],
    });
    expect(c.progress).toBe('REGRESSION');
    expect(c.regressed).toEqual(['positive_stop_durations']);

    // P0-M — the regression is marked AND both obligations stay in the contract.
    contract = ledger.buildRepairContract();
    expect(contract).toMatch(/MUST FIX:[\s\S]*duration/i);
    expect(contract).toMatch(/MUST PRESERVE:[\s\S]*sunset/i);
  });

  it('reaches monotonic completion when a candidate satisfies everything', () => {
    const ledger = createRepairLedger(CANYONLANDS);
    ledger.recordAttempt({ attempt: 1, reasonCodes: ['zero_duration_stops'], evaluatedObligations: ['positive_stop_durations'] });
    ledger.recordAttempt({ attempt: 2, reasonCodes: ['missing_requested_sunset'], evaluatedObligations: ledger.obligationIds() });
    const c = ledger.recordAttempt({ attempt: 3, reasonCodes: [], evaluatedObligations: ledger.obligationIds() });
    expect(c.progress).toBe('PROGRESS');
    expect(c.failed).toEqual([]);
    expect(c.regressed).toEqual([]);
    expect(ledger.buildRepairContract()).toBe('');
  });
});

describe('P0-L — attempt progress model', () => {
  it('does not trade one hard obligation for several soft successes', () => {
    const ledger = createRepairLedger(CANYONLANDS);
    ledger.recordAttempt({
      attempt: 1,
      reasonCodes: ['insufficient_day_coverage', 'duplicate_base_experience', 'missing_experience_anchor'],
      evaluatedObligations: ledger.obligationIds(),
    });
    // Three soft coverage defects cleared, one hard structural invariant lost.
    const second = ledger.recordAttempt({
      attempt: 2,
      reasonCodes: ['zero_duration_stops'],
      evaluatedObligations: ledger.obligationIds(),
    });
    expect(second.progress).toBe('REGRESSION');
    expect(second.regressed).toEqual(['positive_stop_durations']);
  });

  it('publishes a bounded per-attempt summary', () => {
    const ledger = createRepairLedger(CANYONLANDS);
    ledger.recordAttempt({ attempt: 1, reasonCodes: ['zero_duration_stops'], evaluatedObligations: ['positive_stop_durations'] });
    ledger.recordAttempt({ attempt: 2, reasonCodes: [], evaluatedObligations: ledger.obligationIds() });
    const summary = ledger.summary();
    expect(summary).toHaveLength(2);
    expect(summary[0]).toEqual(expect.objectContaining({ attempt: 1, progress: 'NO_PROGRESS' }));
    expect(summary[1]).toEqual(expect.objectContaining({ attempt: 2, progress: 'PROGRESS' }));
    // Bounded — codes and obligation ids only, never prose or plan content.
    for (const row of summary) {
      for (const value of [...row.failed, ...row.satisfied, ...row.regressed]) {
        expect(value).toMatch(/^[a-z0-9_]{1,64}$/);
      }
    }
  });

  it('ignores unknown or malformed reason codes without inventing obligations', () => {
    const ledger = createRepairLedger(CANYONLANDS);
    const r = ledger.recordAttempt({
      attempt: 1,
      reasonCodes: ['totally_unknown_code', 42, null, 'zero_duration_stops'],
      evaluatedObligations: ledger.obligationIds(),
    });
    expect(r.failed).toEqual(['positive_stop_durations']);
    expect(ledger.buildRepairContract()).toMatch(/totally_unknown_code/);
  });
});

describe('P0-F — the contract never degrades to the latest error alone', () => {
  it('always restates the original traveler contract', () => {
    const ledger = createRepairLedger({
      userPrompt: 'Plan four easygoing days in Everglades. We care about wildlife, photography, and scenic stops.',
      constraints: { durationDays: 4, pace: 'relaxed', fitness: 'easy' },
    });
    ledger.recordAttempt({ attempt: 1, reasonCodes: ['zero_duration_stops'], evaluatedObligations: ['positive_stop_durations'] });
    ledger.recordAttempt({ attempt: 2, reasonCodes: ['missing_experience_anchor'], evaluatedObligations: ledger.obligationIds() });
    const contract = ledger.buildRepairContract();
    expect(contract).toMatch(/four|4-day|4 day/i);
    expect(contract).toMatch(/wildlife/i);
    expect(contract).toMatch(/MUST PRESERVE:[\s\S]*duration/i);
    expect(contract).toMatch(/MUST FIX:[\s\S]*anchor|MUST FIX:[\s\S]*experience/i);
  });
});
