import { describe, expect, it } from 'vitest';
import {
  selectCurrentDerived,
  currentDerivedValue,
  publishDerivedSurfaces,
} from '@/lib/planDerivedPublication';

describe('planDerivedPublication', () => {
  it('publishes only derived state stamped for the current plan hash', () => {
    const current = { planHash: 'hash-b', routeLegs: [{ id: 'new' }] };
    const stale = { planHash: 'hash-a', routeLegs: [{ id: 'old' }] };
    expect(selectCurrentDerived(current, 'hash-b')).toEqual({
      status: 'current',
      value: current,
    });
    expect(selectCurrentDerived(stale, 'hash-b')).toEqual({
      status: 'stale',
      value: null,
    });
    expect(currentDerivedValue(stale, 'hash-b')).toBeNull();
  });

  it('treats missing derived state as pending once the plan has a hash', () => {
    expect(selectCurrentDerived(null, 'hash-b')).toEqual({
      status: 'pending',
      value: null,
    });
  });

  it('never shows an older route while the plan is already on the new hash', () => {
    const published = publishDerivedSurfaces({
      planHash: 'hash-b',
      travelLogistics: { planHash: 'hash-a', transport: { routeLegs: [{ id: 'old' }] } },
      warnings: { planHash: 'hash-a', items: [{ message: 'Angels Landing permit' }] },
      answer: { planHash: 'hash-b', text: 'I changed days 2 and 4.' },
    });
    expect(published.travelLogistics).toBeNull();
    expect(published.travelLogisticsStatus).toBe('stale');
    expect(published.warnings).toBeNull();
    expect(published.warningsStatus).toBe('stale');
    expect(published.answer.planHash).toBe('hash-b');
    expect(published.answerStatus).toBe('current');
  });

  it('keeps unstamped logistics pending when the plan hash is known', () => {
    expect(selectCurrentDerived({ transport: { routeLegs: [] } }, 'hash-b')).toEqual({
      status: 'pending',
      value: null,
    });
  });
});
