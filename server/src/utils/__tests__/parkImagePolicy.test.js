const { shouldAttachParkImages } = require('../parkImagePolicy');

describe('shouldAttachParkImages', () => {
  test('returns false for open-ended discovery', () => {
    expect(shouldAttachParkImages('Cool July parks with lakes', { namedParkCount: 0 })).toBe(
      false
    );
  });

  test('returns false for permit or road questions', () => {
    expect(
      shouldAttachParkImages('Is Going-to-the-Sun Road open?', { namedParkCount: 1 })
    ).toBe(false);
    expect(shouldAttachParkImages('Do I need a permit for Half Dome?', { namedParkCount: 1 })).toBe(
      false
    );
  });

  test('returns false for casual greetings', () => {
    expect(shouldAttachParkImages('hi', { namedParkCount: 0 })).toBe(false);
  });

  test('returns true for explicit photo requests', () => {
    expect(shouldAttachParkImages('Show me photos of Zion', { namedParkCount: 1 })).toBe(true);
  });

  test('returns true for single-park itinerary planning', () => {
    expect(
      shouldAttachParkImages('Plan a 3-day itinerary in Yosemite', { namedParkCount: 1 })
    ).toBe(true);
  });

  test('returns false for compare without visual intent', () => {
    expect(shouldAttachParkImages('Compare Zion vs Bryce', { namedParkCount: 2 })).toBe(false);
  });
});
