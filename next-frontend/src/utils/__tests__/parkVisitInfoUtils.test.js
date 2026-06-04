import { describe, expect, it } from 'vitest';
import {
  getPrimaryEntranceFeeSummary,
  isReservationStyleFee,
  isStandardEntranceFee,
  pickPrimaryEntranceFee,
  sortEntranceFeesForDisplay,
} from '../parkVisitInfoUtils';

const ACADIA_FEES = [
  {
    title: 'Timed Entry Reservation',
    cost: '6.00',
    description: 'Vehicle reservation for Cadillac Summit Road.',
  },
  {
    title: 'Private Vehicle Entrance Pass',
    cost: '35.00',
    description: 'Admits one private, non-commercial vehicle (15 passengers or less).',
  },
  {
    title: 'Motorcycle Entrance Pass',
    cost: '30.00',
    description: 'Admits one motorcycle and one passenger.',
  },
];

describe('pickPrimaryEntranceFee', () => {
  it('prefers private vehicle entrance over timed entry reservation (Acadia)', () => {
    expect(pickPrimaryEntranceFee(ACADIA_FEES)?.title).toBe('Private Vehicle Entrance Pass');
    expect(pickPrimaryEntranceFee(ACADIA_FEES)?.cost).toBe('35.00');
  });

  it('uses reservation wording when only reservation fees exist', () => {
    const fees = [ACADIA_FEES[0]];
    expect(getPrimaryEntranceFeeSummary(fees)).toEqual({
      price: 'From $6.00',
      subtitle: 'Timed Entry Reservation',
    });
  });
});

describe('getPrimaryEntranceFeeSummary', () => {
  it('shows standard entrance price for parks with both fee types', () => {
    expect(getPrimaryEntranceFeeSummary(ACADIA_FEES)).toEqual({
      price: '$35.00',
      subtitle: 'Private Vehicle Entrance Pass',
    });
  });
});

describe('sortEntranceFeesForDisplay', () => {
  it('lists standard entrance fees before reservations', () => {
    const sorted = sortEntranceFeesForDisplay(ACADIA_FEES);
    expect(sorted[0].title).toBe('Private Vehicle Entrance Pass');
    expect(sorted.at(-1)?.title).toBe('Timed Entry Reservation');
  });
});

describe('fee classification', () => {
  it('classifies timed entry as reservation-style', () => {
    expect(isReservationStyleFee(ACADIA_FEES[0])).toBe(true);
    expect(isStandardEntranceFee(ACADIA_FEES[0])).toBe(false);
  });

  it('classifies private vehicle as standard entrance', () => {
    expect(isStandardEntranceFee(ACADIA_FEES[1])).toBe(true);
    expect(isReservationStyleFee(ACADIA_FEES[1])).toBe(false);
  });
});
