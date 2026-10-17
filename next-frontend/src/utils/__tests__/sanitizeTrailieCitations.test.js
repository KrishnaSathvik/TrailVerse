import { describe, expect, it } from 'vitest';
import { sanitizeTrailieCitations } from '../sanitizeTrailieCitations';
import { stripItineraryJsonForDisplay } from '../streamDisplayContent';
import FIXTURES from '../../../../shared/trailieCitationTokens.fixtures.json';

describe('frontend citation sanitizer matches server fixtures', () => {
  it('hides the exact Q1 captured tokens', () => {
    const out = sanitizeTrailieCitations(FIXTURES.q1Captured).content;
    expect(out).toMatch(/Choose \*\*Yosemite\*\*/);
    expect(out).not.toMatch(/\uE200|\uE201|\uE202/);
  });

  it('renders a resolvable citation token as a markdown source link', () => {
    const input = `Bridalveil Fall is a short walk. \uE200cite\uE202turn0search0\uE201 Then photograph the valley.`;
    const out = sanitizeTrailieCitations(input, {
      resolvedCitations: {
        turn0search0: { url: 'https://www.nps.gov/yose/planyourvisit/index.htm', title: 'NPS' },
      },
    }).content;
    expect(out).toBe(
      'Bridalveil Fall is a short walk. [NPS](https://www.nps.gov/yose/planyourvisit/index.htm) Then photograph the valley.'
    );
  });

  for (const c of FIXTURES.cases) {
    it(`fixture ${c.id}`, () => {
      expect(sanitizeTrailieCitations(c.input).content).toBe(c.expected);
    });
  }
});

describe('streamed display uses the same citation boundary', () => {
  it('strips unresolvable tokens from streamed assistant content', () => {
    const streamed = `Choose **Yosemite**. \uE200cite\uE202turn0\uE201`;
    expect(stripItineraryJsonForDisplay(streamed)).toBe('Choose **Yosemite**.');
  });
});
