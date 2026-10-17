import { describe, it, expect } from 'vitest';
import { normalizeStoredMessages } from '../tripHistoryService';

describe('normalizeStoredMessages', () => {
  it('preserves travelLogistics on restored guest messages', () => {
    const travelLogistics = {
      schemaVersion: 'travel-logistics-v1',
      stays: { status: 'partial', regions: [{ name: 'West Yellowstone' }] },
    };
    const timestamp = '2026-08-11T12:00:00.000Z';

    const [restored] = normalizeStoredMessages([{
      role: 'assistant',
      content: 'Stay near the west entrance.',
      timestamp,
      travelLogistics,
    }]);

    expect(restored.travelLogistics).toEqual(travelLogistics);
    expect(restored.timestamp).toBeInstanceOf(Date);
  });
});
