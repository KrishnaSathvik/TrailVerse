'use strict';

/**
 * §A — A PARK NAME INSIDE A LONGER LOCAL-FEATURE NAME IS NOT A DESTINATION.
 *
 * Live 2026-08-27:
 *
 *   "Is the Petrified Forest Trail open right now, and is there any wildfire
 *    smoke affecting Theodore Roosevelt National Park?"
 *   → resolvedDestination: pefo        (Petrified Forest NP, Arizona)
 *
 * Theodore Roosevelt NP has its own Petrified Forest, and its own "Petrified
 * Forest Trailhead" alert. The catalog matched the substring `Petrified Forest`
 * and promoted a LOCAL FEATURE inside the destination into a different park —
 * outranking the explicit canonical mention in the same sentence.
 *
 * The rule is generic, not a THRO patch:
 *
 *   an explicit canonical park mention outranks a catalog park-name substring
 *   embedded in a longer, capitalised local-feature name.
 *
 * Capitalisation carries the weight: "Petrified Forest Trail" is a proper name,
 * "Death Valley road conditions" is a topic, and only the first is a feature.
 */

const {
  extractAllParksFromMessage,
  extractParkFromMessage,
} = require('../parkExtractor');

const codes = (message) => extractAllParksFromMessage(message).map((park) => park.parkCode);
const primary = (message) => (extractParkFromMessage(message) || {}).parkCode || null;

describe('an explicit park mention outranks a feature-embedded one', () => {
  test('the exact live prompt resolves to Theodore Roosevelt', () => {
    const prompt = 'Is the Petrified Forest Trail open right now, and is there any wildfire '
      + 'smoke affecting Theodore Roosevelt National Park?';
    expect(primary(prompt)).toBe('thro');
    expect(codes(prompt)).not.toContain('pefo');
  });

  test('the shorter form resolves the same way', () => {
    expect(primary('Is Petrified Forest Trail open in Theodore Roosevelt National Park?')).toBe('thro');
  });

  test('word order does not matter', () => {
    expect(primary('In Theodore Roosevelt National Park, is the Petrified Forest Trail open?')).toBe('thro');
  });

  test('a trailhead is a feature too', () => {
    expect(primary('Is the Petrified Forest Trailhead reachable in Theodore Roosevelt National Park?')).toBe('thro');
  });

  test('this is not a Petrified Forest rule — another catalog collision behaves the same', () => {
    // Grand Teton NP contains a "Death Canyon Trail"; Death Valley is a park.
    expect(primary('Is the Death Canyon Trail open in Grand Teton National Park?')).toBe('grte');
    // Sequoia has a "Crescent Meadow Road"; Crater Lake is a park.
    expect(primary('Is Crater Lake Road open in Sequoia National Park?')).toBe('sequ');
  });
});

describe('the park itself is still resolvable', () => {
  test('the full canonical name resolves', () => {
    expect(primary('Plan two days in Petrified Forest National Park')).toBe('pefo');
  });

  test('the short name used as a destination resolves', () => {
    expect(primary('Visit Petrified Forest')).toBe('pefo');
    expect(primary('What can we do in Petrified Forest for a day?')).toBe('pefo');
  });

  test('a feature-embedded mention with NO other park is not a destination guess', () => {
    expect(primary('Is the Petrified Forest Trail open?')).toBeNull();
    expect(codes('Is the Petrified Forest Trail open?')).toEqual([]);
  });
});

describe('lowercase topical words are not local features', () => {
  test('"road conditions" does not turn a destination into a feature', () => {
    expect(primary('What are the Death Valley road conditions right now?')).toBe('deva');
  });

  test('"trail conditions" does not either', () => {
    expect(primary('How are the Petrified Forest trail conditions?')).toBe('pefo');
  });

  test('a lowercase feature word after a park name is still the park', () => {
    expect(primary('Is the Crater Lake rim drive open?')).toBe('crla');
  });
});

describe('multi-park questions are unaffected', () => {
  test('two explicit parks both survive', () => {
    const found = codes('Compare Yellowstone National Park and Grand Teton National Park');
    expect(found).toEqual(expect.arrayContaining(['yell', 'grte']));
  });

  test('an explicit park plus a feature in it yields one destination', () => {
    expect(codes('Is the Petrified Forest Trail open in Theodore Roosevelt National Park?'))
      .toEqual(['thro']);
  });
});

describe('the feature-embedded flag is exposed for downstream context', () => {
  test('a feature-only message is not a destination', () => {
    expect(extractAllParksFromMessage('Is the Petrified Forest Trail open?')).toEqual([]);
  });

  test('an ordinary destination mention is not marked', () => {
    const [match] = extractAllParksFromMessage('Plan two days in Petrified Forest National Park');
    expect(match.featureEmbedded).toBeFalsy();
  });
});

/**
 * The follow-up case: the traveler does not repeat the park, so the message's
 * ONLY park match is the feature-embedded one. An active trip destination must
 * outrank it — otherwise a question about a trail inside the park silently
 * relocates the conversation to a different state.
 */
describe('an active destination outranks a feature-embedded match', () => {
  const { resolveActiveTripContext } = require('../../services/activeTripContextService');

  function resolve(message, storedDestination) {
    return resolveActiveTripContext({
      lastUserMessage: message,
      storedContext: storedDestination
        ? {
          primaryDestination: {
            parkCode: storedDestination,
            parkName: 'Theodore Roosevelt National Park',
            source: 'user_message',
            confidence: 'high',
          },
        }
        : null,
    });
  }

  test('a feature-only follow-up keeps the active destination', () => {
    const result = resolve('Is Petrified Forest Trailhead open?', 'thro');
    expect(result.activeTripContext.primaryDestination.parkCode).toBe('thro');
  });

  test('an explicit park in the follow-up still switches', () => {
    const result = resolve('Actually, what about Petrified Forest National Park?', 'thro');
    expect(result.activeTripContext.primaryDestination.parkCode).toBe('pefo');
  });

  test('with no active destination the feature match is not guessed as a park', () => {
    const result = resolve('Is Petrified Forest Trailhead open?', null);
    expect(result.activeTripContext.primaryDestination?.parkCode).toBeFalsy();
  });
});
