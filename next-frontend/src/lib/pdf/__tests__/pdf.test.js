import { describe, it, expect } from 'vitest';
import { parseBlogHtml, normalizeBlogPostForPdf, partsToPlainText } from '../parseBlogHtml';
import { slugifyPdfFilename, resolveTripShareUrl, sanitizePdfText, toAbsoluteAssetUrl, isPlaceholderHeroUrl, normalizePdfLinkUrl } from '../pdfUtils';

describe('parseBlogHtml', () => {
  it('parses headings and paragraphs from HTML', () => {
    const blocks = parseBlogHtml('<h2>Trail Tips</h2><p>Pack layers.</p>');
    expect(blocks).toEqual([
      { type: 'heading', level: 2, parts: [{ type: 'text', value: 'Trail Tips' }] },
      { type: 'paragraph', parts: [{ type: 'text', value: 'Pack layers.' }] },
    ]);
  });

  it('parses unordered lists', () => {
    const blocks = parseBlogHtml('<ul><li>Water</li><li>Map</li></ul>');
    expect(blocks[0]).toEqual({
      type: 'ul',
      items: [
        [{ type: 'text', value: 'Water' }],
        [{ type: 'text', value: 'Map' }],
      ],
    });
  });

  it('preserves anchor links as clickable segments', () => {
    const html = '<p>Visit <a href="/parks/yosemite-national-park">Yosemite</a> or read <a href="https://www.nps.gov/yose/">NPS</a>.</p>';
    const blocks = parseBlogHtml(html);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].parts).toEqual([
      { type: 'text', value: 'Visit ' },
      {
        type: 'link',
        href: toAbsoluteAssetUrl('/parks/yosemite-national-park'),
        text: 'Yosemite',
      },
      { type: 'text', value: ' or read ' },
      {
        type: 'link',
        href: 'https://www.nps.gov/yose/',
        text: 'NPS',
      },
      { type: 'text', value: '.' },
    ]);
    expect(partsToPlainText(blocks[0].parts)).toBe('Visit Yosemite or read NPS.');
  });
});

describe('normalizeBlogPostForPdf', () => {
  it('builds canonical blog URL and author fallback', () => {
    const normalized = normalizeBlogPostForPdf({
      slug: 'yosemite-guide',
      title: 'Yosemite Guide',
      author: 'Admin',
      content: '<p>Hello</p>',
    });

    expect(normalized.author).toBe('Krishna');
    expect(normalized.canonicalUrl).toContain('/blog/yosemite-guide');
  });
});

describe('pdfUtils', () => {
  it('slugifies filenames', () => {
    expect(slugifyPdfFilename('Yellowstone Trip!', 'trip-plan')).toBe('yellowstone-trip-trip-plan.pdf');
  });

  it('resolves public trip share URLs only', () => {
    expect(resolveTripShareUrl({ shareId: 'abc123' })).toContain('/plan-ai/shared/abc123');
    expect(resolveTripShareUrl({ tripId: 'trip-1' })).toBeNull();
  });

  it('normalizePdfLinkUrl returns absolute https links', () => {
    expect(normalizePdfLinkUrl('/explore')).toBe('https://www.nationalparksexplorerusa.com/explore');
    expect(normalizePdfLinkUrl('https://www.nps.gov/yose/')).toBe('https://www.nps.gov/yose/');
  });

  it('sanitizePdfText strips emoji and zero-width characters', () => {
    expect(sanitizePdfText('📅 Park hours')).toBe('Park hours');
    expect(sanitizePdfText('Hello\u200Bworld')).toBe('Helloworld');
  });

  it('isPlaceholderHeroUrl detects brand/default assets', () => {
    expect(isPlaceholderHeroUrl('https://www.nationalparksexplorerusa.com/og-image-trailverse.jpg')).toBe(true);
    expect(isPlaceholderHeroUrl('https://www.nationalparksexplorerusa.com/logo.png')).toBe(true);
    expect(isPlaceholderHeroUrl('https://www.nps.gov/yose/images/hero.jpg')).toBe(false);
  });
});
