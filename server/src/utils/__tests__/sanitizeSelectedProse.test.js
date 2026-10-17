'use strict';

/**
 * Stage 13.8 §3/§4/§7 — the unified pre-display sanitation seam.
 *
 * Composes the two shared strippers (alignment markers + Stage 8 itinerary
 * artifacts) so replayed content equals canonical content, strips every known
 * [ITINERARY_JSON] variant, and never damages ordinary markdown.
 */

const path = require('path');
const { sanitizeSelectedProse } = require('../sanitizeSelectedProse');
const { stripItineraryArtifacts } = require('../itineraryArtifacts');
// eslint-disable-next-line import/no-dynamic-require, global-require
const FIXTURES = require(path.resolve(__dirname, '../../../../shared/itineraryArtifacts.fixtures.json'));

describe('sanitizeSelectedProse', () => {
  it('removes alignment markers and itinerary artifacts together', () => {
    const input = '<!--TRAILIE_DAY:day-1--> Day 1\n<!--TRAILIE_STOP:stop-1--> Rim Trail.\n\n[ITINERARY_JSON]\n{"days":[]}\n[/ITINERARY_JSON]';
    const r = sanitizeSelectedProse({ content: input });
    expect(r.content).not.toMatch(/TRAILIE_/);
    expect(r.content).not.toMatch(/ITINERARY_JSON/);
    expect(r.content).toMatch(/Rim Trail/);
    expect(r.alignmentMarkersRemoved).toBe(true);
    expect(r.itineraryArtifactsRemoved).toBe(true);
    expect(r.artifactTypes).toContain('complete_block');
  });

  it('is idempotent — replayed content equals canonical (re-strip is a no-op)', () => {
    const input = 'Trip!\n\n[ITINERARY_JSON]\n{"days":[]}\n[/ITINERARY_JSON]';
    const once = sanitizeSelectedProse({ content: input }).content;
    // canonicalResponse strips artifacts again at hash time — must match exactly.
    expect(stripItineraryArtifacts(once).content).toBe(once);
    expect(sanitizeSelectedProse({ content: once }).content).toBe(once);
  });

  it('preserves ordinary markdown links (no over-stripping)', () => {
    const md = 'Head out early. [Continue through the canyon](/parks/example) then loop back.';
    const r = sanitizeSelectedProse({ content: md });
    expect(r.content).toBe(md);
    expect(r.changed).toBe(false);
  });

  it('leaves clean prose untouched', () => {
    const clean = 'Start at the visitor center, then hike the Rim Trail.';
    expect(sanitizeSelectedProse({ content: clean }).content).toBe(clean);
  });

  it('handles every shared Stage 8 artifact fixture the same way the stripper does', () => {
    for (const c of FIXTURES.cases) {
      const r = sanitizeSelectedProse({ content: c.input });
      // sanitize == artifact-strip when there are no alignment markers involved.
      expect(r.content).toBe(stripItineraryArtifacts(c.input).content);
      expect(r.content).not.toMatch(/\[\/?ITINERARY_JSON\]/i);
    }
  });
});
