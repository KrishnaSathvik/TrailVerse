const {
  slugFromFullName,
  buildParkPageUrl,
  formatTrailverseLinksBlock,
  formatTrailverseVerifyFooter,
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
    expect(footer).not.toContain('nps.gov');
  });
});
