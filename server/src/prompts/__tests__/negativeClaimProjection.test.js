'use strict';

/**
 * §C — AUTHORITATIVE ABSENCE MUST NOT RENDER AS `Value: false`.
 *
 * Live 2026-08-27. A hard `wildfire_smoke` requirement was satisfied by a
 * genuine proven absence — complete official NPS alert feed, no fire notice,
 * `polarity: 'negative'`, official_owner authority. The model then answered:
 *
 *   "I also can't verify current wildfire-smoke conditions … from the
 *    information I have."
 *
 * Because this is what it was shown:
 *
 *   [NPS | wildfire_smoke | fresh | official_owner]
 *   Value: false
 *
 * `false` is indistinguishable from unavailable, unknown, absent, or a false
 * fact. The model's refusal was the correct reading of an ambiguous projection.
 *
 * The internal representation stays boolean/polarity-based. The MODEL-FACING
 * projection has to say what the evidence means — and no more than it proves.
 */

const { renderEvidenceBundleForPrompt } = require('../evidenceBundlePromptRenderer');
const { buildEvidenceBundle } = require('../../utils/evidenceBundle');

const NOW = new Date('2026-08-27T15:04:56.000Z');

function absenceEvidence(topic, entityId = 'nps:park:thro') {
  return {
    evidenceId: `ev-absence-${topic}`,
    entityId,
    topic,
    evidenceType: 'live_state',
    claim: {
      identity: `absence:${topic}`,
      text: null,
      normalizedValue: false,
      unit: null,
      status: null,
      subjectId: entityId,
      objectId: null,
      qualifiers: [],
      polarity: 'negative',
    },
    scope: { geographicEntityIds: [entityId], validFrom: null, validThrough: null, audience: 'public', locale: 'en-US' },
    source: { provider: 'nps', sourceClass: 'official_owner', sourceId: 'absence', url: null, title: null },
    observation: { observedAt: NOW, fetchedAt: NOW, expiresAt: NOW, staleUntil: NOW, retrievalMode: 'live' },
    quality: { authorityClass: 'official_owner', freshnessStatus: 'fresh', scopeMatch: 'exact' },
    retention: { storeClaimText: true },
  };
}

function positiveEvidence(topic) {
  return {
    ...absenceEvidence(topic),
    evidenceId: `ev-positive-${topic}`,
    claim: {
      identity: `alerts:${topic}:a1`,
      text: 'Petrified Forest Trailhead Access Update: Use Approved Route',
      normalizedValue: { title: 'Petrified Forest Trailhead Access Update', category: 'Information' },
      unit: null, status: 'active', subjectId: 'nps:park:thro', objectId: null,
      qualifiers: [], polarity: 'positive',
    },
  };
}

function requirementFor(topic) {
  return {
    requirementId: `r-${topic}`,
    topic,
    entity: { entityId: 'nps:park:thro', displayName: 'Theodore Roosevelt National Park' },
    criticality: 'hard',
    renderBudgetTokens: 180,
  };
}

function render(evidence, topic) {
  const bundle = buildEvidenceBundle({
    requestId: 'r',
    resolutions: [{
      requirementId: `r-${topic}`,
      status: 'satisfied_fresh',
      evidenceIds: [evidence.evidenceId],
      selectedEvidence: [evidence],
    }],
    candidates: [evidence],
  });
  return renderEvidenceBundleForPrompt({ bundle, requirements: [requirementFor(topic)] }).text;
}

describe('a proven absence reads as a finding, not as false', () => {
  const text = render(absenceEvidence('wildfire_smoke'), 'wildfire_smoke');

  test('the ambiguous form is gone', () => {
    expect(text).not.toMatch(/Value:\s*false/);
  });

  test('it says no matching condition was found', () => {
    expect(text).toMatch(/no matching/i);
  });

  test('it names the topic it is about', () => {
    expect(text).toMatch(/wildfire_smoke/);
  });

  test('it states that the official source was complete', () => {
    expect(text).toMatch(/complete/i);
  });

  test('it keeps authority and freshness legible', () => {
    expect(text).toMatch(/official_owner/);
    expect(text).toMatch(/fresh/);
  });

  test('it does NOT overclaim the stronger fact', () => {
    // The evidence proves no official ALERT exists. It does not prove there is
    // no smoke anywhere in the park.
    expect(text).not.toMatch(/there is no (smoke|fire)/i);
    expect(text).not.toMatch(/\bdefinitely\b/i);
    expect(text).not.toMatch(/\bconfirmed (open|safe|clear)\b/i);
  });
});

describe('the projection is generic, not a wildfire special case', () => {
  test.each(['trail_conditions', 'roads', 'alerts_closures', 'permits_reservations'])(
    'a proven absence of %s reads the same way',
    (topic) => {
      const text = render(absenceEvidence(topic), topic);
      expect(text).not.toMatch(/Value:\s*false/);
      expect(text).toMatch(/no matching/i);
      expect(text).toMatch(new RegExp(topic));
    }
  );
});

describe('positive evidence is untouched', () => {
  test('a real alert still renders its claim text', () => {
    const text = render(positiveEvidence('trail_conditions'), 'trail_conditions');
    expect(text).toMatch(/Petrified Forest Trailhead Access Update/);
    expect(text).not.toMatch(/no matching/i);
  });
});
