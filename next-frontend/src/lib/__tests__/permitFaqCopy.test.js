import { describe, expect, it } from 'vitest';
import { buildPermitFaqAnswer } from '../permitFaqCopy';

describe('permitFaqCopy', () => {
  it('prefers live timed-entry permits over crowd "none required"', () => {
    const answer = buildPermitFaqAnswer({
      shortName: 'Carlsbad Caverns',
      parkCode: 'cave',
      permits: [
        { name: 'Carlsbad Caverns Timed Entry Reservation', type: 'Timed Entry', category: 'timed_entry' },
      ],
      hasPermitsTab: true,
    });
    expect(answer).toMatch(/timed entry/i);
    expect(answer).toMatch(/Permits tab/i);
    expect(answer).not.toMatch(/No park-wide entry reservation is required/);
  });

  it('uses authoritative override when live RIDB is empty', () => {
    const answer = buildPermitFaqAnswer({
      shortName: 'Yosemite',
      parkCode: 'yose',
      permits: [],
      hasPermitsTab: false,
    });
    expect(answer).toMatch(/No park-wide timed entry in 2026/i);
  });

  it('filters stale park-wide timed entry when authoritative says none', () => {
    const answer = buildPermitFaqAnswer({
      shortName: 'Arches',
      parkCode: 'arch',
      permits: [
        { name: 'Arches National Park Timed Entry', type: 'Timed Entry', category: 'timed_entry' },
        { name: 'Fiery Furnace Permit', type: 'Permit', category: 'permit' },
      ],
      hasPermitsTab: true,
    });
    expect(answer).toMatch(/No park-wide timed entry in 2026/i);
    expect(answer).toMatch(/Fiery Furnace Permit/i);
    expect(answer).not.toMatch(/Arches National Park Timed Entry/);
  });
});
