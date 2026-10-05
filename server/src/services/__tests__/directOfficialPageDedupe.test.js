'use strict';

const {
  createDirectOfficialPageEvidenceProvider,
} = require('../providers/directOfficialPageEvidenceProvider');

function requirement(topic, evidenceTypes) {
  return {
    requirementId: `req:${topic}`,
    entity: { entityId: 'nps:park:yose', displayName: 'Yosemite' },
    topic,
    evidenceTypes,
    webScope: { sourceUrl: 'https://www.nps.gov/yose/planyourvisit/index.htm' },
  };
}

describe('WP11B direct official page dedupe invariant', () => {
  // roads and events for the same park frequently resolve to the SAME official
  // page. The physical fetch is identical, but each requirement normalizes for its
  // own topic, so they must NOT share a dedupeKey — otherwise the broker sees the
  // same dedupeKey with different fingerprints and throws
  // evidence_refresh_dedupe_collision (the live Q4/Q5 multi-topic itinerary failure).
  test('different topics on the same official page yield distinct dedupeKeys', () => {
    const provider = createDirectOfficialPageEvidenceProvider();
    const roads = provider.buildRequest(requirement('roads', ['live_state']));
    const events = provider.buildRequest(requirement('events', ['fact']));
    expect(roads.dedupeKey).not.toBe(events.dedupeKey);
    expect(roads.dedupeKey).toContain('roads');
    expect(events.dedupeKey).toContain('events');
  });

  test('same topic + same page + same entity still coalesces (identical dedupeKey)', () => {
    const provider = createDirectOfficialPageEvidenceProvider();
    const a = provider.buildRequest(requirement('roads', ['live_state']));
    const b = provider.buildRequest(requirement('roads', ['live_state']));
    expect(a.dedupeKey).toBe(b.dedupeKey);
  });
});
