'use strict';

const { isParkLinkLabel, unwrapMislinkedParkMarkdown } = require('../parkMarkdownLinks');

describe('unwrapMislinkedParkMarkdown', () => {
  test('unwraps hotel names linked to park pages', () => {
    const input =
      '[**Jackson Lake Lodge**](https://www.nationalparksexplorerusa.com/parks/grand-teton-national-park) is inside the park.';
    expect(unwrapMislinkedParkMarkdown(input)).toBe(
      '**Jackson Lake Lodge** is inside the park.'
    );
  });

  test('keeps links when label is a park name', () => {
    const input = '[Grand Teton National Park](/parks/grand-teton-national-park) in September.';
    expect(unwrapMislinkedParkMarkdown(input)).toBe(input);
  });
});

describe('isParkLinkLabel', () => {
  test('rejects hotel names', () => {
    expect(isParkLinkLabel('Jackson Lake Lodge')).toBe(false);
  });

  test('accepts park names', () => {
    expect(isParkLinkLabel('Grand Teton National Park')).toBe(true);
  });
});
