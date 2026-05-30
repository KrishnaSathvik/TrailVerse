import {
  formatParkingFee,
  getParkingLiveStatusDisplay,
  isParkingLiveStatusFresh,
  parseNpsDateTime,
  summarizeCompareParking,
} from '../parkingUtils';

describe('parkingUtils', () => {
  const now = new Date('2026-05-27T12:00:00Z');

  it('parseNpsDateTime handles NPS timestamp format', () => {
    const d = parseNpsDateTime('2020-05-06 00:00:00.0');
    expect(d).toBeInstanceOf(Date);
    expect(d.getFullYear()).toBe(2020);
  });

  it('treats expired liveStatus as stale', () => {
    const liveStatus = {
      isActive: true,
      occupancy: 'Closed',
      expirationDate: '2020-05-06 00:00:00.0',
      description: '',
    };
    expect(isParkingLiveStatusFresh(liveStatus, now)).toBe(false);
    const display = getParkingLiveStatusDisplay(liveStatus, now);
    expect(display.showBadge).toBe(false);
    expect(display.isClosed).toBe(false);
  });

  it('shows fresh occupancy when expiration is in the future', () => {
    const liveStatus = {
      isActive: true,
      occupancy: 'Light',
      expirationDate: '2026-12-31 23:59:59.0',
      description: '',
      estimatedWaitTimeInMinutes: 5,
    };
    const display = getParkingLiveStatusDisplay(liveStatus, now);
    expect(display.showBadge).toBe(true);
    expect(display.badgeLabel).toBe('Light');
    expect(display.waitMinutes).toBe(5);
    expect(display.isClosed).toBe(false);
  });

  it('surfaces stale description as a note without a badge', () => {
    const liveStatus = {
      isActive: false,
      occupancy: 'Busy',
      expirationDate: '2019-11-25 14:00:00.0',
      description: 'Expect busy parking on holiday weekends.',
    };
    const display = getParkingLiveStatusDisplay(liveStatus, now);
    expect(display.showBadge).toBe(false);
    expect(display.note).toContain('holiday');
    expect(display.noteIsStale).toBe(true);
  });

  it('formatParkingFee includes title when present', () => {
    expect(formatParkingFee({ title: 'Per vehicle', cost: 35 })).toBe('Per vehicle — $35');
    expect(formatParkingFee({ cost: 10 })).toBe('$10');
  });

  it('summarizeCompareParking counts lots and live status', () => {
    const summary = summarizeCompareParking([
      { liveStatus: { occupancy: 'Light', expirationDate: '2099-01-01 00:00:00.0' } },
      { liveStatus: null },
    ]);
    expect(summary.lotCount).toBe(2);
    expect(summary.primaryLabel).toBe('2 NPS lots listed');
    expect(summary.liveStatusCount).toBe(1);
    expect(summary.liveNote).toContain('live occupancy');
  });
});
