import { expect, it } from 'vitest';
import { parkCodesForPlan, parkCodeForPlan } from '../useTripImagery';

it('uses every canonical park destination of a multi-park trip, in order', () => {
  const plan = { parkName: 'Zion and Bryce Canyon National Parks', parkCode: 'zion',
    destinations: [{ type: 'nps_park', parkCode: 'zion' }, { type: 'nps_park', parkCode: 'brca' }] };
  expect(parkCodesForPlan(plan)).toEqual(['zion', 'brca']);
  expect(parkCodeForPlan(plan)).toBe('zion');
});
it('falls back to the primary park code, then an exact park name', () => {
  expect(parkCodesForPlan({ parkCode: 'glac' })).toEqual(['glac']);
  expect(parkCodesForPlan({ parkName: 'Yellowstone National Park' })).toEqual(['yell']);
});
it('a non-park destination or unknown code gets no imagery', () => {
  expect(parkCodesForPlan({ parkName: 'Canaan Valley and Blackwater Falls, West Virginia' })).toEqual([]);
  expect(parkCodesForPlan({ destinations: [{ type: 'nps_park', parkCode: 'nope' }] })).toEqual([]);
});
