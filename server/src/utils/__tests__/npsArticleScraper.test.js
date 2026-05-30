const {
  extractArticleSections,
  sanitizeArticleSections,
  isPhotoCredit,
  mapSolrDoc,
  extractArticleVideo
} = require('../npsArticleScraper');

describe('npsArticleScraper', () => {
  test('isPhotoCredit detects NPS photo captions', () => {
    expect(isPhotoCredit('NPS / Jacob W. Frank')).toBe(true);
    expect(isPhotoCredit('A full paragraph about museums.')).toBe(false);
  });

  test('sanitizeArticleSections drops heading-only blocks', () => {
    const input = [
      {
        heading: null,
        paragraphs: ['Real intro paragraph with enough length here.']
      },
      {
        heading: '6 Park Museum Highlights',
        paragraphs: []
      }
    ];
    const out = sanitizeArticleSections(input);
    expect(out).toHaveLength(1);
    expect(out[0].heading).toBeNull();
    expect(out[0].paragraphs[0]).toContain('Real intro');
  });

  test('mapSolrDoc builds absolute NPS URLs', () => {
    const item = mapSolrDoc({
      PageURL: '/places/astro-theater.htm',
      Title: 'Astro Theater',
      Type: 'Place',
      Image_URL: '/common/uploads/test.jpg',
      Image_Alt_Text: 'Theater building'
    });
    expect(item.url).toBe('https://www.nps.gov/places/astro-theater.htm');
    expect(item.title).toBe('Astro Theater');
    expect(item.image).toContain('nps.gov');
  });

  test('extractArticleSections omits empty headings from HTML', () => {
    const html = `
      <div class="Article__Content">
        <p>The National Park Service manages one of the world's largest museum systems with many sites.</p>
        <h2>6 Park Museum Highlights</h2>
        <div class="carousel"></div>
      </div>
    `;
    const { sections, body } = extractArticleSections(html);
    expect(sections.every((s) => s.paragraphs.length > 0)).toBe(true);
    expect(body).not.toMatch(/6 Park Museum Highlights/);
  });

  test('extractArticleVideo pulls mp4 sources and poster', () => {
    const html = `
      <div class="Article__Content">
        <video poster="/common/uploads/poster.jpg">
          <source src="https://www.nps.gov/video.mp4" type="video/mp4" />
        </video>
      </div>
    `;
    const video = extractArticleVideo(html);
    expect(video).toBeTruthy();
    expect(video.poster).toBe('https://www.nps.gov/common/uploads/poster.jpg');
    expect(video.sources[0].url).toBe('https://www.nps.gov/video.mp4');
  });
});
