import { describe, expect, it } from 'vitest';
import {
  isParkLinkLabel,
  normalizeParkLinksInMarkdown,
  unwrapMislinkedParkMarkdown,
} from '../parkLinkifier';

describe('unwrapMislinkedParkMarkdown', () => {
  it('unwraps hotel names linked to park pages', () => {
    const input =
      '[**Jackson Lake Lodge**](https://www.nationalparksexplorerusa.com/parks/grand-teton-national-park) is inside the park.';
    expect(unwrapMislinkedParkMarkdown(input)).toBe(
      '**Jackson Lake Lodge** is inside the park.'
    );
  });

  it('keeps links when label is a park name', () => {
    const input = '[Grand Teton National Park](/parks/grand-teton-national-park) in September.';
    expect(unwrapMislinkedParkMarkdown(input)).toBe(input);
  });

  it('normalizeParkLinksInMarkdown adds Grand Teton link after unwrap', () => {
    const input =
      'September is great for Grand Teton. [**Jackson Lake Lodge**](/parks/grand-teton-national-park) is inside the park.';
    const out = normalizeParkLinksInMarkdown(input);
    expect(out).toMatch(/\[Grand Teton\]\(\/parks\/grand-teton-national-park\)/);
    expect(out).toContain('**Jackson Lake Lodge** is inside');
    expect(out).not.toMatch(/Jackson Lake Lodge\]\(\/parks\//);
  });

  it('links each park only once when model already linked a later mention', () => {
    const input =
      'Go with Bryce Canyon for October — it edges out Zion for first-timers.\n\n[Zion](https://www.nationalparksexplorerusa.com/parks/zion-national-park) in October is still beautiful.';
    const out = normalizeParkLinksInMarkdown(input);
    const zionLinks = out.match(/\[Zion\]\([^)]*\/parks\/zion-national-park\)/gi) || [];
    expect(zionLinks).toHaveLength(1);
    expect(out.indexOf('[Zion]')).toBeLessThan(out.indexOf('in October is still beautiful'));
  });
});

describe('isParkLinkLabel', () => {
  it('rejects hotel names', () => {
    expect(isParkLinkLabel('Jackson Lake Lodge')).toBe(false);
  });

  it('accepts park names', () => {
    expect(isParkLinkLabel('Grand Teton National Park')).toBe(true);
  });
});
