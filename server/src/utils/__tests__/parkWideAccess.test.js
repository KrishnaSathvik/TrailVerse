'use strict';
const { officialPageParkRules, tripGuidanceFromRules } = require('../parkWideAccess');

// Sentences as published on an official NPS page (Zion Canyon Shuttle System).
const zion = 'What to Expect When Shuttles Are Running Zion Canyon Scenic Drive (the road that starts north of Canyon Junction) is closed to private vehicles during the shuttle season. The park is a large place. '
  + 'What if I am physically unable to ride the shuttle? From early March through late November, access into Zion Canyon is by shuttle bus only. '
  + 'Shuttle schedule: Shuttles run September 13 to October 24 and October 25 to November 28, with holiday service November 29 to December 25.';
const page = { title: 'Zion Canyon Shuttle System - Zion National Park (U.S. National Park Service)', text: zion,
  url: 'https://www.nps.gov/zion/planyourvisit/zion-canyon-shuttle-system.htm', parkCode: 'zion', parkName: 'Zion National Park', observedAt: '2026-10-08T12:00:00Z' };

test('a seasonal private-vehicle rule is extracted with its subject, season, mode and schedule', () => {
  const rules = officialPageParkRules(page);
  const road = rules.find(r => r.kind === 'private_vehicle_restriction');
  expect(road).toMatchObject({ subject: 'Zion Canyon Scenic Drive', seasonLabel: 'the shuttle season', seasonal: true, requiredMode: 'shuttle',
    parkCode: 'zion', sourceUrl: page.url });
  expect(road.periods).toEqual(expect.arrayContaining([{ from: '09-13', to: '10-24' }, { from: '10-25', to: '11-28' }]));
  expect(rules.find(r => r.kind === 'transfer_required')).toMatchObject({ subject: 'Zion Canyon', requiredMode: 'shuttle', seasonal: true });
});

test('an undated trip gets a date-dependent note in traveler language, one per rule family', () => {
  const items = tripGuidanceFromRules(officialPageParkRules(page), {});
  expect(items).toHaveLength(1);
  expect(items[0]).toMatchObject({ applicability: 'date_dependent', source: page.url, parkCode: 'zion' });
  expect(items[0].text).toBe('During the shuttle season, private vehicles aren’t allowed on Zion Canyon Scenic Drive. Check the current shuttle schedule once your travel dates are set.');
});

test('dates inside the published schedule (same year as the page) make the rule apply', () => {
  const [item] = tripGuidanceFromRules(officialPageParkRules(page), { startDate: '2026-10-10', endDate: '2026-10-13' });
  expect(item.applicability).toBe('applies');
  expect(item.text).toBe('The shuttle season covers your dates, so private vehicles aren’t allowed on Zion Canyon Scenic Drive — plan to use the shuttle.');
});

test('dates outside every published period do not show the rule as active', () => {
  expect(tripGuidanceFromRules(officialPageParkRules(page), { startDate: '2026-02-01', endDate: '2026-02-03' })).toEqual([]);
});

test('a different year than the page stays date-dependent, never guessed', () => {
  expect(tripGuidanceFromRules(officialPageParkRules(page), { startDate: '2027-10-10', endDate: '2027-10-12' })[0].applicability).toBe('date_dependent');
});

test('timed-entry reservations are a generic park-wide rule', () => {
  const rules = officialPageParkRules({ ...page, parkCode: 'romo', parkName: 'Rocky Mountain National Park', url: 'https://www.nps.gov/romo/planyourvisit/timed-entry-permit-system.htm',
    text: 'Timed entry reservations are required to enter the park from May 23 to October 13, 2026.' });
  const [item] = tripGuidanceFromRules(rules, {});
  expect(item.text).toBe('Rocky Mountain National Park requires a timed-entry reservation for part of the year. Check whether it applies once your travel dates are set.');
});

test('negated or unrelated wording produces no rule', () => {
  expect(officialPageParkRules({ ...page, text: 'Private vehicles are welcome on the Kolob Canyons Road year-round. No reservation is required.' })).toEqual([]);
});
