'use strict';

const path = require('path');
const { sanitizeTrailieCitations } = require('../sanitizeTrailieCitations');
const { sanitizeSelectedProse } = require('../sanitizeSelectedProse');
const { renderV2Content } = require('../../services/trailieV2RouteBridge');
const FIXTURES = require(path.resolve(__dirname, '../../../../shared/trailieCitationTokens.fixtures.json'));

describe('sanitizeTrailieCitations', () => {
  it('hides the exact Q1 captured unresolvable cite tokens', () => {
    const out = sanitizeTrailieCitations(FIXTURES.q1Captured).content;
    expect(out).toMatch(/Choose \*\*Yosemite\*\*/);
    expect(out).toMatch(/Bridalveil Fall Trailhead/);
    expect(out).not.toMatch(/\uE200|\uE201|\uE202/);
    expect(out).not.toMatch(/cite\uE202turn/);
    expect(out).not.toMatch(/turn0|turn1/);
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
    expect(out).not.toMatch(/\uE200|\uE201|\uE202/);
  });

  it('is idempotent', () => {
    const once = sanitizeTrailieCitations(FIXTURES.q1Captured).content;
    expect(sanitizeTrailieCitations(once).content).toBe(once);
  });

  for (const c of FIXTURES.cases) {
    it(`fixture ${c.id}`, () => {
      expect(sanitizeTrailieCitations(c.input).content).toBe(c.expected);
    });
  }
});

describe('citation tokens are part of the selected-prose sanitation seam', () => {
  it('sanitizeSelectedProse hides unresolvable tokens and keeps markdown links', () => {
    const dirty = `${FIXTURES.cases[3].input} \uE200cite\uE202turn0\uE201`;
    const out = sanitizeSelectedProse({ content: dirty }).content;
    expect(out).toContain('[NPS](https://www.nps.gov/glac/index.htm)');
    expect(out).not.toMatch(/\uE200|\uE201|\uE202/);
  });
});

describe('V2 traveler content cannot persist raw citation tokens', () => {
  it('renderV2Content sanitizes model prose before the product envelope', () => {
    const content = renderV2Content({
      response: { text: FIXTURES.q1Captured },
    });
    expect(content).toMatch(/Choose \*\*Yosemite\*\*/);
    expect(content).not.toMatch(/\uE200|\uE201|\uE202/);
  });
});
