'use strict';

/**
 * Stage 13.7 §7 — assert the corrected detectors on the representative probes.
 * The "before" column is retained for the report; this test locks the "after".
 */

const { replay } = require('../stage13_7ProbeReplay');

describe('Stage 13.7 probe replay (offline)', () => {
  const rows = replay();
  const byText = (t) => rows.find((r) => r.text === t);

  it('removes the demonstrated context-blind false positives', () => {
    expect(byText('Permits can be difficult to obtain.').after).not.toContain('conflicting_difficulty');
    expect(byText('The shuttle runs every 15 minutes.').after).not.toContain('conflicting_duration');
    expect(byText('Arrive 30 minutes early.').after).not.toContain('conflicting_duration');
    expect(byText('The drive is 45 minutes.').after).not.toContain('conflicting_duration');
  });

  it('keeps genuine activity conflicts blocking', () => {
    expect(byText('This is a challenging hike.').after).toContain('conflicting_difficulty');
    expect(byText('The trail is strenuous.').after).toContain('conflicting_difficulty');
    expect(byText('The hike takes 3 hours.').after).toContain('conflicting_duration');
  });

  it('treats a matching activity duration as no conflict', () => {
    expect(byText('Spend 4 hours at this stop.').after).toHaveLength(0);
  });

  it('the old logic produced at least one false positive the fix removes', () => {
    const removed = rows.filter(
      (r) => r.before.some((c) => c.startsWith('conflicting_'))
        && !r.after.some((c) => c.startsWith('conflicting_')),
    );
    expect(removed.length).toBeGreaterThan(0);
  });
});
