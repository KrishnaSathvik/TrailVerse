'use strict';
const { withDayStructure } = require('../../../tests/helpers/dayStructure');
const { validateSimpleMutation } = require('../trailieSimpleGuard');
const { normalizeEvidenceLocation } = require('../../utils/trailieCanonicalLocation');
const { transferRouteMode } = require('../../utils/transferRouteMode');
const { tripRefinement } = require('../../utils/tripRefinement');
const { stubMemoryVerifier } = require('../../../tests/helpers/memoryAuthority');
const now = new Date('2026-10-06T12:00:00Z');
const source = (id, value, extra = {}) => normalizeEvidenceLocation({ evidenceId: id, entityId: id, topic: 'activities', claim: { identity: id, normalizedValue: value }, source: { provider: 'nps', sourceClass: 'official_owner', url: 'https://www.nps.gov/' }, observation: { observedAt: now.toISOString(), expiresAt: '2026-10-07T12:00:00Z' }, quality: { authorityClass: 'official_owner', conflictStatus: 'none' }, ...extra });
const places = [source('a', { name: 'First', latitude: 40, longitude: -110 }), source('b', { name: 'Second', latitude: 40.1, longitude: -110.1 })];
const route = mode => source('route', { durationSeconds: 1440, distanceMeters: 9000 }, { topic: 'driving_time', source: { provider: 'google_maps', sourceClass: 'commercial_structured', url: 'https://maps.google.com/' }, scope: { route: { originEntityId: 'a', destinationEntityId: 'b', travelMode: mode } } });
const plan = () => withDayStructure({ intro: 'Visit', days: [{ id: 'd1', dayNumber: 1, label: 'Views', stops: ['a', 'b'].map((id, i) => ({ id, order: i + 1, type: 'viewpoint', name: ['First', 'Second'][i], evidenceRef: id, duration: 30, note: '', why: '', startTime: '' })) }] });
function check(transportation, evidence = [...places, route('driving')], p = plan()) { return validateSimpleMutation({ proposal: { response: 'Ready', plan: p }, snapshot: { planningState: transportation ? { transportation } : {} }, message: 'Plan a visit', evidence, now }); }
test('road default accepts verified duration without creating traveler transportation memory', () => {
 const r = check(); expect(r.ok).toBe(true); expect(r.planningState.transportation).toBeUndefined();
 expect(r.plan.days[0].travelEdges[0]).toMatchObject({ status: 'verified', travelMode: 'driving', durationSeconds: 1440, modeAuthority: 'practical_default' });
});
test('explicit rental car retains traveler authority', () => {
 const r = check({ rentalCar: true }); expect(r.ok).toBe(true); expect(r.plan.days[0].travelEdges[0].modeAuthority).toBe('traveler'); expect(r.planningState.transportation.rentalCar).toBe(true);
});
test('no-car rejects driving evidence but accepts grounded walking alternative', () => {
 expect(check({ noCar: true }).plan.days[0].travelEdges[0]).toMatchObject({ status: 'unverified', durationSeconds: null });
 expect(check({ drivingPolicy: 'prohibited' }, [...places, route('walking')]).plan.days[0].travelEdges[0]).toMatchObject({ status: 'verified', travelMode: 'walking' });
});
test('missing provider evidence never manufactures time', () => { expect(check(null, places).plan.days[0].travelEdges[0]).toMatchObject({ status: 'unverified', durationSeconds: null, distanceMeters: null }); });
test('activity grouping suppresses driving edges', () => { const p = plan(); p.days[0].activityGroups = [{ id: 'walk', stopIds: ['a','b'] }]; expect(check(null, [...places, route('driving')], p).plan.days[0].travelEdges).toEqual([]); });
test('later explicit correction invalidates prior driving without inventing another mode', async () => {
 const previous = check().plan; const message = 'Actually, we will not have a car.';
 const updates = [{ field: 'transportation', sourceQuote: message, value: { rentalCar: false, drivingPolicy: 'prohibited', drivingPolicyReason: 'no_car' } }];
 const { receipt: memoryAuthority } = await stubMemoryVerifier()({ message, updates });
 const r = validateSimpleMutation({ proposal: { response: 'Updated', memory_updates: updates }, snapshot: { plan: previous, planningState: {} }, message, memoryAuthority, now });
 expect(r.ok).toBe(true); expect(r.planningState.transportation.rentalCar).toBe(false); expect(r.plan.days[0].travelEdges[0].durationSeconds).toBeNull(); expect(r.plan.days[0].stops[1].drivingTimeFromPreviousMin).toBeUndefined();
});
test('grounded mandatory transfer takes precedence over road default', () => { expect(transferRouteMode({}, { requiredMode: 'ferry' })).toEqual({mode:'ferry',authority:'grounded_requirement'}); });
test('refinement is derived from actual plan changes', () => { const a=plan(), b=plan(); expect(tripRefinement(null,a).isRefinement).toBe(false); b.days[0].label='Relaxed'; expect(tripRefinement(a,b)).toMatchObject({isRefinement:true,changedDayNumbers:[1]}); });
function accessPlaces(type, extra = {}) {
 return places.map(p => { const row=structuredClone(p); row.claim.normalizedValue.operationalFacts=[{type,subject:{entityId:p.entityId,name:p.claim.normalizedValue.name},subjects:[p.claim.normalizedValue.name],provenance:{authority:'official_owner',sourceUrl:'https://www.nps.gov/access'},...extra}]; return row; });
}
test('canonical guard keeps route evidence independent from explicit access permission',()=>{
 const r=check(null,[...accessPlaces('private_vehicle_access_allowed'),route('driving')]);
 expect(r.ok).toBe(true); expect(r.plan.days[0].travelEdges[0]).toMatchObject({status:'verified',durationSeconds:1440,operationalAccess:{status:'allowed'}});
 expect(r.planningState.transportation).toBeUndefined();
});
test('canonical required-shuttle conclusion beats a conflicting Google road route even with rental car',()=>{
 const r=check({rentalCar:true},[...accessPlaces('transfer_mode_required',{requiredMode:'shuttle'}),route('driving')]);
 expect(r.ok).toBe(true); expect(r.plan.days[0].travelEdges[0]).toMatchObject({durationSeconds:1440,travelMode:'driving',operationalAccess:{status:'required_alternative',requiredMode:'shuttle'}});
});
test('no-car still refuses a driving duration despite verified private-vehicle access',()=>{
 const r=check({noCar:true},[...accessPlaces('private_vehicle_access_allowed'),route('driving')]);
 expect(r.plan.days[0].travelEdges[0]).toMatchObject({status:'unverified',durationSeconds:null});
});
test.each([false, true])('authorized dates recompute access without inventing shuttle time, with patch=%s',async(withPatch)=>{
 const previous=check().plan, message='Our trip is October 10 to October 12, 2026.';
 const updates=[{field:'dates',sourceQuote:message,value:{startDate:'2026-10-10',endDate:'2026-10-12'}}];
 const {receipt:memoryAuthority}=await stubMemoryVerifier()({message,updates});
 const r=validateSimpleMutation({proposal:{response:'Dates updated',memory_updates:updates,...(withPatch ? {plan_patch:{response:'Dates updated',operations:[{op:'update_stop',dayNumber:1,stopId:'a',stop:{note:'Check access for these dates'}}]}} : {})},snapshot:{plan:previous,planningState:{}},message,memoryAuthority,now,evidence:[...accessPlaces('transfer_mode_required',{requiredMode:'shuttle',validFrom:'2026-10-01',validTo:'2026-10-31'}),route('driving')]});
 expect(r.ok).toBe(true);expect(r.plan.days[0].travelEdges[0]).toMatchObject({durationSeconds:1440,travelMode:'driving',operationalAccess:{status:'required_alternative',requiredMode:'shuttle'}});
 expect(r.planningState.transportation).toBeUndefined();
});
