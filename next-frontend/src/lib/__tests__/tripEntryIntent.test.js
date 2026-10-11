import { describe, it, expect } from 'vitest';
import { resolveTripEntryIntent, TRIP_ENTRY } from '../tripEntryIntent';
describe('navigation owns trip entry intent', () => {
  it.each(['entry=new-trip&ask=Glacier', 'ask=Glacier', 'park=glac&name=Glacier', 'suggest=Zion', 'newchat=1', 'personalized=1', 'from=intent'])('%s starts a new trip', query => {
    expect(resolveTripEntryIntent(new URLSearchParams(query))).toBe(TRIP_ENTRY.NEW);
  });
  it.each(['', 'entry=continue&conversation=yellowstone', 'conversation=yellowstone'])('%s continues without interpreting chat text', query => {
    expect(resolveTripEntryIntent(new URLSearchParams(query))).toBe(TRIP_ENTRY.CONTINUE);
  });
  it('a saved trip owns its continuation', () => {
    expect(resolveTripEntryIntent(new URLSearchParams('ask=make+it+5+days'), 'saved-trip')).toBe(TRIP_ENTRY.CONTINUE);
  });
});
