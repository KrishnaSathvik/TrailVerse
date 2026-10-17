'use strict';
const { validateSimpleMutation } = require('../trailieSimpleGuard');
const prior = { intro: 'A complete two-day trip.', parkName: 'A park',
 narrativeSections: [{ placement: 'after_plan', heading: 'Access', markdown: 'Check seasonal access.' }],
 days: [{ id: 'day-1', dayNumber: 1, label: 'Arrival', stops: [{ id: 's', order: 1, duration: 60, name: 'A viewpoint', type: 'viewpoint', canonicalPlaceId: 'nps:place:one', canonicalPlaceName: 'A viewpoint', evidenceRef: 'simple:one', resolutionStatus: 'resolved', location: { lat: 38, lon: -112, source: 'resolved_metadata', authority: 'official_owner', status: 'resolved', sourceRef: 'simple:one', sourceEntity: 'nps:place:one' } }] }, { id: 'day-2', dayNumber: 2, label: 'Explore', stops: [] }] };
const run = plan_patch => validateSimpleMutation({ snapshot: { plan: prior }, message: 'Update the overview', proposal: { response: 'I would update that.', plan_patch: { response: 'Chat explanation.', ...plan_patch } } });
test('a stop/day edit preserves the saved overview rather than replacing it with the chat explanation', () => {
 const result = run({ operations: [{ op: 'update_stop', dayNumber: 1, stopId: 's', stop: { note: 'A gentle arrival.' } }] });
 expect(result.issues).toEqual([]);
 expect(result.plan.intro).toBe(prior.intro);
 expect(result.plan.narrativeSections).toEqual(prior.narrativeSections);
});
test('a narrative-only patch reconciles guidance without mutating any day', () => {
 const before = JSON.stringify(prior);
 const result = run({ operations: [], intro: 'Two days with the new outing included.', narrativeSections: [] });
 expect(result.issues).toEqual([]);
 expect(result.plan.intro).toBe('Two days with the new outing included.');
 expect(result.plan.narrativeSections).toEqual([]);
 expect(result.plan.days).toEqual(prior.days);
 expect(JSON.stringify(prior)).toBe(before);
});
test('an empty patch and malformed guidance are still rejected', () => {
 expect(run({ operations: [] }).issues).toContain('patch_schema_invalid');
 expect(run({ operations: [], narrativeSections: 'discard everything' }).ok).toBe(false);
});
