const {
  slugFromFullName,
  buildParkPageUrl,
  formatTrailverseLinksBlock,
  formatTrailverseVerifyFooter,
  formatNoLiveDataPromptInstruction,
} = require('../trailverseParkLinks');

describe('trailverseParkLinks', () => {
  const park = { parkCode: 'zion', parkName: 'Zion National Park' };

  beforeAll(() => {
    process.env.WEBSITE_URL = 'https://www.nationalparksexplorerusa.com';
  });

  test('slugFromFullName matches frontend parkToSlug', () => {
    expect(slugFromFullName('Zion National Park')).toBe('zion-national-park');
    expect(slugFromFullName('Hawaiʻi Volcanoes National Park')).toBe('hawaii-volcanoes-national-park');
  });

  test('buildParkPageUrl includes tab query', () => {
    expect(buildParkPageUrl(park)).toBe(
      'https://www.nationalparksexplorerusa.com/parks/zion-national-park'
    );
    expect(buildParkPageUrl(park, { tab: 'alerts' })).toBe(
      'https://www.nationalparksexplorerusa.com/parks/zion-national-park?tab=alerts'
    );
  });

  test('formatTrailverseLinksBlock tells model to use TrailVerse not nps.gov', () => {
    const block = formatTrailverseLinksBlock([park]);
    expect(block).toContain('TRAILVERSE LINKS');
    expect(block).toContain('not nps.gov');
    expect(block).toContain('/parks/zion-national-park?tab=alerts');
    expect(block).toContain('/plan-ai?parkCode=zion');
  });

  test('formatTrailverseVerifyFooter links to TrailVerse alerts tab', () => {
    const footer = formatTrailverseVerifyFooter([park]);
    expect(footer).toContain('TrailVerse');
    expect(footer).toContain('?tab=alerts');
    expect(footer).toContain('alerts and conditions');
    expect(footer).not.toContain('nps.gov');
  });

  test('formatNoLiveDataPromptInstruction bans general-knowledge disclaimers', () => {
    const line = formatNoLiveDataPromptInstruction(park);
    expect(line).toContain('[Zion National Park on TrailVerse]');
    expect(line).toContain('?tab=alerts');
    expect(line).toContain('general knowledge');
    expect(line).toMatch(/Do NOT say/);
    expect(line).toMatch(/usually\/typically/);
  });
});
