const { extractAllParksFromMessage } = require('../../utils/parkExtractor');
const { extractUserCity } = require('../factsService');
const {
  shouldInjectDrivingTimes,
  buildDrivingTimeLegs,
  extractAirportFromMessage,
} = require('../drivingTimesContextService');

/** [message, shouldInject, note] */
const MATRIX = [
  ['Is Angels Landing open?', false, 'trail status only'],
  ['Tell me about Zion', false, 'generic info'],
  ['Plan a 3 day Zion itinerary', true, 'planning'],
  ['How far is the drive from Las Vegas to Zion?', true, 'explicit logistics'],
  ['Is Zion crowded in July and how far is the drive from LA?', true, 'ops + logistics'],
  ['Driving from Denver to Zion', true, 'departure city'],
  ['Arches vs Canyonlands for a day trip', true, 'two parks'],
  ['How do I get to Yellowstone?', true, 'get to'],
  ['Nearest airport to Grand Canyon', true, 'airport question'],
  ['Weekend trip to Yosemite', true, 'weekend trip'],
  ['Zion weather this weekend', false, 'weather only'],
  ['Is the Narrows open and can I drive from SLC?', true, 'ops + airport'],
  ['How far is Angels Landing from the visitor center at Zion?', true, 'in-park distance'],
  ['Do I need a permit for Half Dome?', false, 'permit only'],
  ['Road trip Zion Bryce and Grand Canyon', true, 'multi park'],
  ['Compare Yellowstone and Grand Teton', true, 'compare'],
  ['Best trail in Zion for beginners', false, 'trail pick'],
  ['Getting there from Phoenix to Saguaro', true, 'getting there'],
  ['Is Yosemite open?', false, 'open status only'],
  ['Yosemite scenic drive loop', true, 'scenic drive'],
];

describe('drivingTimesInjectionMatrix', () => {
  it.each(MATRIX)('%s → inject=%s (%s)', async (message, expected) => {
    const parks = extractAllParksFromMessage(message);
    const userCity = extractUserCity(message);
    const airport = extractAirportFromMessage(message);
    const inject = shouldInjectDrivingTimes({
      userMessage: message,
      parks,
      userCity,
      airport,
    });
    expect(inject).toBe(expected);
  });
});
