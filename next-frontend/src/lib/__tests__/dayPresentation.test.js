import { describe, expect, it } from 'vitest';
import playback from '@/data/trailieDemoPlayback.json';
import samples from '@/data/public-itineraries/index.json';
import { presentDay, restates, daypartLabel } from '@/lib/dayPresentation';

const demoPlan = id => playback.scenarios.find(s => s.id === id).turns.at(-1).plan;
const allDays = [
  ...playback.scenarios.flatMap(s => s.turns.flatMap(t => t.plan?.days || [])),
  ...samples.flatMap(s => s.plan.days),
];

describe('presentDay', () => {
  it('merges an outing block with its stop into one traveler-facing activity', () => {
    const day = demoPlan('discovery').days[1];
    const items = presentDay(day);
    const stony = items.filter(i => i.title === 'Stony Man Trail' || i.title === 'Stony Man walk and views');
    expect(stony).toHaveLength(1);
    expect(stony[0]).toMatchObject({ type: 'activity', title: 'Stony Man Trail', duration: 100, daypart: 'Early morning' });
    expect(stony[0].stops.map(s => s.id)).toEqual(['d2-stony']);
  });

  it('keeps every canonical stop exactly once and every non-outing block', () => {
    for (const day of allDays) {
      const items = presentDay(day);
      const shown = items.flatMap(i => i.stops.map(s => s.id));
      expect(shown.sort()).toEqual((day.stops || []).map(s => s.id).sort());
      const nonOuting = (day.dayStructure?.blocks || []).filter(b => b.kind !== 'outing').length;
      expect(items.filter(i => i.key.startsWith('block-') && !i.stops.length)).toHaveLength(nonOuting);
    }
  });

  it('never prints implementation wording or unverified transfer time', () => {
    for (const day of allDays) {
      const text = JSON.stringify(presentDay(day).map(({ title, travelTime, daypart }) => [title, travelTime, daypart]));
      expect(text).not.toMatch(/not mapped|Flexible experience|timing not verified/i);
    }
  });

  it('prints a daypart only where it changes', () => {
    const items = presentDay(demoPlan('zion-bryce').days[3]);
    const shown = items.filter(i => i.showDaypart).map(i => i.daypart);
    shown.forEach((label, i) => expect(label).not.toBe(shown[i - 1]));
  });

  it('treats near-duplicate copy as a restatement', () => {
    expect(restates('Walk slowly with time at the viewpoint.', 'Walk slowly, with ample time at the viewpoint.')).toBe(true);
    expect(restates('Short summit walk.', 'Bring a picnic lunch and water.')).toBe(false);
    expect(daypartLabel(['morning', 'afternoon'])).toBe('Morning → Afternoon');
  });
});

import { quietUncertainty, planHasQuietedUncertainty } from '@/lib/dayPresentation';
describe('quietUncertainty', () => {
  it.each([
    ['Start with local advice if the center is open; hours unconfirmed.', 'Start with local advice if the center is open.'],
    ['Bring a picnic or use an operating seasonal dining option; opening hours are not confirmed.', 'Bring a picnic or use an operating seasonal dining option.'],
    ['Stay back from rocky edges and skip it in ice or poor visibility; current conditions unconfirmed.', 'Stay back from rocky edges and skip it in ice or poor visibility.'],
    ['Leave through Swift Run Gap for the new base. Allow a generous travel buffer; route duration has not been confirmed.', 'Leave through Swift Run Gap for the new base. Allow a generous travel buffer.'],
    ['Continue to your East Glacier overnight base, allowing a generous margin because travel duration is unconfirmed.', 'Continue to your East Glacier overnight base, allowing a generous margin.'],
    ['Bring a picnic and allow an unhurried return, with travel time not confirmed.', 'Bring a picnic and allow an unhurried return.'],
    ['Move to Canyon Village with generous room for slow traffic; the road travel time is not confirmed.', 'Move to Canyon Village with generous room for slow traffic.'],
  ])('quiets a pure disclaimer: %s', (input, expected) => {
    expect(quietUncertainty(input)).toBe(expected);
  });
  it.each([
    'Treat this as a substantial travel day; reserve most of the day rather than relying on an unconfirmed route duration.',
    'Departure timing is not confirmed; do not book an early flight.',
    'Use the canyon shuttle when it is operating.',
  ])('keeps uncertainty that changes what the traveler does: %s', input => {
    expect(quietUncertainty(input)).toBe(input);
  });
  it('lets the trip say it once when anything was quieted', () => {
    expect(planHasQuietedUncertainty({ days: [{ stops: [{ note: 'Walk the loop; current conditions unconfirmed.' }] }] })).toBe(true);
    expect(planHasQuietedUncertainty({ days: [{ stops: [{ note: 'Walk the loop.' }] }] })).toBe(false);
  });
});
