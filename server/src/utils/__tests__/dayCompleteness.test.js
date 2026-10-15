'use strict';
const { validateDayCompleteness } = require('../dayCompleteness');
const { validateSimpleMutation, PROPOSE_TOOL } = require('../../services/trailieSimpleGuard');
const { normalizeEvidenceLocation } = require('../trailieCanonicalLocation');
const block = (kind, periods, stopIds = []) => ({ kind, periods, stopIds, label: kind, note: 'Intentional time for this part of the day.' });
const hike = () => ({ dayNumber: 1, id: 'd1', label: 'A long outing', stops: [{ id: 'hike', duration: 360, startTime: '', timeWindow: 'Morning through afternoon' }], dayStructure: {startPeriod: 'morning', endPeriod: 'evening', type: 'sightseeing', summary: 'A full hiking day with a quiet evening.', blocks: [block('outing', ['morning', 'afternoon'], ['hike']), block('downtime', ['evening'])] } });
const now = new Date('2026-10-05T12:00:00Z');
const usDestinationEvidence = () => [normalizeEvidenceLocation({
  evidenceId: 'dest-us',
  topic: 'destination_identity',
  entityId: 'nps:park:test',
  claim: {
    identity: 'nps:park:test',
    normalizedValue: { name: 'Test National Park', countryCode: 'US', latitude: 38.5, longitude: -78.4 },
  },
  source: { provider: 'nps', sourceClass: 'official_owner', sourceId: 'nps:park:test' },
  observation: {
    observedAt: now.toISOString(),
    expiresAt: new Date(+now + 86400000).toISOString(),
  },
})];
const acceptPinless = (proposal) => validateSimpleMutation({
  proposal,
  message: 'Plan a U.S. day',
  evidence: usDestinationEvidence(),
  now,
});
test('a single long outing is complete without a fixed stop count', () => {
 expect(validateDayCompleteness(hike())).toEqual([]);
});
test('short outing plus deliberate afternoon recovery is complete', () => {
 const day = hike(); day.stops[0].duration = 60;
 day.dayStructure.blocks = [block('outing', ['morning'], ['hike']), block('downtime', ['midday', 'evening'])];
 expect(validateDayCompleteness(day)).toEqual([]);
});
test('an unexplained afternoon is rejected, even with multiple attractions', () => {
 const day = hike(); day.dayStructure.blocks[0].periods = ['morning'];
 expect(validateDayCompleteness(day)).toContain('day_time_unaccounted');
});
test.each(['transfer', 'rest', 'arrival', 'departure'])('a %s day can be complete without fake place pins', type => {
 const day = { stops: [], dayStructure: {startPeriod: 'morning', endPeriod: 'evening', type, summary: 'A deliberate logistics day.', blocks: [block(type === 'rest' ? 'downtime' : type, ['morning', 'afternoon', 'evening'])] } };
 expect(validateDayCompleteness(day)).toEqual([]);
 expect(acceptPinless({ response: 'A day for logistics.', plan: { intro: 'Logistics', days: [{ ...day, id: 'd1', label: 'Travel', dayNumber: 1 }] } }).ok).toBe(true);
});
test('accidental empty sightseeing and untyped new days are rejected by the ordinary guard', () => {
 const day = { dayNumber: 1, stops: [], dayStructure: {startPeriod: 'morning', endPeriod: 'evening', type: 'sightseeing', summary: 'Empty', blocks: [block('downtime', ['morning', 'afternoon', 'evening'])] } };
 expect(validateDayCompleteness(day)).toContain('day_accidentally_empty');
 expect(validateSimpleMutation({ proposal: { response: 'A plan', plan: { days: [{ dayNumber: 1, stops: [{ id: 'x', name: 'X' }] }] } } }).issues).toContain('mutation_schema_invalid');
});
test('exact times require a reason; daypart-only stops do not', () => {
 const day = hike(); day.stops[0].startTime = '08:00';
 expect(validateDayCompleteness(day)).toContain('clock_reason_missing');
 day.stops[0].timingReason = 'Traveler must meet their booked guide at 08:00.';
 expect(validateDayCompleteness(day)).toEqual([]);
});
test('detects activity overlap, reversed clocks and known transfer infeasibility', () => {
 const day = hike(); day.stops = [{id:'a', startTime:'09:00', duration:120, timingReason:'Booked tour'}, {id:'b', startTime:'10:30', duration:60, timingReason:'Booked tour'}];
 day.dayStructure.blocks[0].stopIds = ['a','b'];
 expect(validateDayCompleteness(day)).toContain('activity_time_overlap');
 day.stops[1].startTime='11:10';
 day.travelEdges=[{sourceStopId:'a',targetStopId:'b',status:'verified',durationSeconds:1800}];
 expect(validateDayCompleteness(day)).toContain('transfer_time_overlap');
 day.stops[1].startTime='11:30';
 expect(validateDayCompleteness(day)).toEqual([]);
 day.travelEdges[0].status='unverified'; day.travelEdges[0].durationSeconds=null;
 day.stops[1].startTime='11:00';
 expect(validateDayCompleteness(day)).toEqual([]);
});
test('rejects stale, duplicated and reordered outing references and misleading day types', () => {
 const day = hike(); day.dayStructure.blocks[0].stopIds=['missing'];
 expect(validateDayCompleteness(day)).toContain('day_stop_coverage_invalid');
 day.dayStructure.type='arrival';
 expect(validateDayCompleteness(day)).toContain('day_type_inconsistent');
});
test('saved legacy plans remain compatible with a notes-only patch', () => {
 expect(validateDayCompleteness({stops:[{id:'old',startTime:'09:00',duration:60}]}, {required:false})).toEqual([]);
});
test('the model-first tool exposes and requires the new day contract', () => {
 const schema = PROPOSE_TOOL.input_schema.properties.plan.properties.days.items;
 expect(schema.required).toContain('dayStructure');
 expect(schema.properties.stops.items.properties).toHaveProperty('timingReason');
});
test('afternoon arrival and midday departure do not require invented off-trip activities', () => {
 for (const [type, startPeriod, endPeriod] of [['arrival','afternoon','evening'],['departure','morning','midday']]) {
  const day={stops:[],dayStructure:{type,summary:'Only the useful part of the day.',startPeriod,endPeriod,blocks:[block(type,[startPeriod,endPeriod])]}};
  expect(validateDayCompleteness(day)).toEqual([]);
 }
});
test('a timed ferry cannot overlap a subsequent outing', () => {
 const day=hike();
 day.dayStructure.blocks.unshift({...block('transfer',['morning']),startTime:'09:00',duration:120,timingReason:'Booked ferry.'});
 day.stops[0].startTime='10:00';day.stops[0].timingReason='Booked guide.';
 expect(validateDayCompleteness(day)).toContain('activity_time_overlap');
});
test('non-place durations cannot subtract time from the day', () => {
 const day=hike();
 day.dayStructure.blocks.unshift({...block('transfer',['morning']),duration:-60});
 expect(validateDayCompleteness(day)).toContain('day_structure_invalid');
});
test('changing overnight bases needs a represented transfer, not invented route minutes', () => {
 const {validateBaseTransition}=require('../dayCompleteness');
 const day={...hike(),overnightLocation:'Eastern town'};
 expect(validateBaseTransition({overnightLocation:'Western town'},day)).toEqual(['base_change_unaccounted']);
 day.dayStructure.blocks.unshift(block('transfer',['morning']));
 expect(validateBaseTransition({overnightLocation:'Western town'},day)).toEqual([]);
});
test('a real service experience can be sightseeing without a fake place pin', () => {
 const day={dayNumber:1,id:'d',label:'Glacier cruise',stops:[],dayStructure:{type:'sightseeing',startPeriod:'morning',endPeriod:'evening',summary:'Protect the day for the cruise.',blocks:[{...block('experience',['morning','afternoon']),duration:420,label:'National park cruise',note:'Select a sailing; schedule and operator remain unconfirmed.'},block('downtime',['evening'])]}};
 expect(validateDayCompleteness(day)).toEqual([]);
 expect(acceptPinless({response:'A full cruise day.',plan:{intro:'Sea and glaciers.',days:[day]}}).ok).toBe(true);
});
test('a rejected patch reports the actual missing-day target to the correction model', () => {
 const prior={days:[{id:'d1',dayNumber:1,label:'Original',stops:[{id:'x',name:'View'}]}]};
 const result=validateSimpleMutation({snapshot:{plan:prior},proposal:{response:'Update',plan_patch:{response:'Update',operations:[{op:'update_stop',dayNumber:3,stopId:'x',stop:{note:'New note'}}]}}});
 expect(result.issues).toContain('plan_patch_target_not_found');
 expect(result.issues).not.toContain('patch_invalid');
});

test('a flexible non-spatial experience needs no duration or canonical pin', () => {
 const day={dayNumber:1,id:'flex',label:'A gentle day',stops:[],dayStructure:{type:'sightseeing',startPeriod:'morning',endPeriod:'evening',summary:'Explore at your own pace.',blocks:[{...block('experience',['morning','afternoon']),label:'Easy riverside time',note:'Consider an easy walk around the river area; choose your route locally.'},block('downtime',['evening'])]}};
 expect(validateDayCompleteness(day)).toEqual([]);
 const result=acceptPinless({response:'Flexible river time, not a mapped route.',plan:{intro:'A relaxed day.',days:[day]}});
 expect(result.ok).toBe(true);expect(result.plan.days[0].stops).toEqual([]);expect(result.plan.days[0].travelEdges).toEqual([]);
});
test('non-spatial experiences cannot carry a pin or reference a mapped stop', () => {
 const day=hike();day.dayStructure.blocks[0].kind='experience';
 expect(validateDayCompleteness(day)).toContain('day_structure_invalid');
 day.dayStructure.blocks[0].stopIds=[];day.stops=[];day.dayStructure.blocks[0].location={lat:35,lon:-83};
 expect(validateSimpleMutation({proposal:{response:'A day.',plan:{intro:'A day.',days:[day]}}}).ok).toBe(false);
});
