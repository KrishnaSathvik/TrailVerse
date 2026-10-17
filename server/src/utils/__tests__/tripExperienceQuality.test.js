'use strict';
const { evaluateTripExperienceQuality: evaluate, experienceIdentity, revisitRelationship } = require('../tripExperienceQuality');
const { resolveStopIdentities } = require('../stopIdentityResolution');
const { applyStopDisplayLabel } = require('../stopDisplayLabel');
const { applyQualityReplacements } = require('../focusedTripQualityRepair');
const ev = (name, type = 'museum', extra = {}) => ({ evidenceId: `ev:${name}`, topic: 'activities', evidenceType: 'fact',
  claim: { text: name, normalizedValue: { name, type, activityTypes: [type], ...extra } } });
const stop = (name, extra = {}) => ({ name, canonicalPlaceName: name, evidenceRef: `ev:${name}`, type: 'museum', duration: 120, resolutionStatus: 'resolved', ...extra });
const plan = names => ({ days: names.map((name,i) => ({ dayNumber: i+1, stops: [stop(name, { note: `Changed words ${i}`, why: `New prose ${i}` })] })) });
const bundle = { evidence: [ev('Heritage Hall'), ev('Forest Loop','walk'), ev('River Path','walk'), ev('Coastal Route','scenic_drive')] };

test('A/C: same canonical experience with different prose is material trip repetition', () => {
 const q = evaluate({ itineraryData: plan(Array(4).fill('Heritage Hall')), bundle });
 expect(q.reasonCodes).toContain('excessive_trip_repetition');expect(q.retryability).toBe('model_fixable');
 expect(q.affectedDays).toEqual([2,3,4]);expect(q.frozenDayNumbers).toEqual([1]);
 expect(q.diagnostics.repeatedExperienceIdentities[0].redundantUses).toBe(3);
});
test('one ordinary revisit does not fail a trip', () => {
 expect(evaluate({ itineraryData: plan(['Heritage Hall','Forest Loop','Heritage Hall']), bundle }).ok).toBe(true);
});
test('B: bound cultural visit and separate exterior sunrise subject are distinct revisits', () => {
 const b = { evidence: [ev('Heritage Hall','museum',{ experienceSubjects: [{ name:'Eastern Cliffs',activityType:'photography',timeContexts:['sunrise','sunset'] }] })] };
 const cultural = experienceIdentity(stop('Heritage Hall'), b);
 const photo = experienceIdentity(stop('Heritage Hall',{ type:'photography',experienceSubject:'Eastern Cliffs',subjectEvidenceRef:'ev:Heritage Hall',timeWindow:'Sunrise' }),b);
 expect(revisitRelationship(cultural,photo)).toBe('DISTINCT_REVISIT');
 expect(revisitRelationship(cultural,{...cultural,grounded:false})).toBe('UNCERTAIN');
});
test('unbound invented subject or time does not create novelty', () => {
 const a=experienceIdentity(stop('Heritage Hall'),bundle);
 expect(revisitRelationship(a,experienceIdentity(stop('Heritage Hall',{experienceSubject:'Made up',timeWindow:'Sunrise'}),bundle))).toBe('REDUNDANT_REPEAT');
});
test('D: thematic trips need no artificial category diversity', () => {
 const b={evidence:['East Garden','West Garden','North Garden','South Garden'].map(n=>ev(n,'viewpoint'))};
 const q=evaluate({itineraryData:plan(['East Garden','West Garden','North Garden','South Garden']),bundle:b,userPrompt:'A photography trip, please'});
 expect(q.ok).toBe(true);expect(q.diagnostics.experienceFamilies).toHaveLength(1);
});
test('explicitly requested daily repetition is permitted, ordinary thematic preference is not a waiver', () => {
 const itineraryData=plan(Array(4).fill('Heritage Hall'));
 expect(evaluate({itineraryData,bundle,userPrompt:'Return to the same place every day'}).ok).toBe(true);
 expect(evaluate({itineraryData,bundle,userPrompt:'I enjoy museums'}).ok).toBe(false);
});
test('limited evidence produces a bounded evidence blocker, not an invented candidate', () => {
 const q=evaluate({itineraryData:plan(Array(4).fill('Heritage Hall')),bundle:{evidence:[ev('Heritage Hall')]}});
 expect(q.retryability).toBe('evidence_blocker');expect(q.candidates).toHaveLength(0);
});
test.each([
 ['Vehicle restrictions on Coastal Highway','Coastal Highway','roads'],
 ['Cedar Trail Permit Requirements','Cedar Trail','activities'],
 ['Operating hours for Heritage Hall','Heritage Hall','activities'],
 ['Ferry schedule for Island Route','Island Route','roads'],
 ['Accessibility information for Stone Gallery','Stone Gallery','activities'],
])('E/F: %s is evidence about %s, never the traveler entity label', (title,name,topic) => {
 const b={evidence:[{ evidenceId:'notice',topic,claim:{text:`${title}: operational information`,normalizedValue:{name:title,type:'scenic_drive'}} }]};
 const resolved=resolveStopIdentities({itineraryData:plan([name]),evidenceBundle:b});
 expect(resolved.violations).toEqual([]);
 const s=applyStopDisplayLabel(resolved.itineraryData.days[0].stops[0]);
 expect(s.canonicalPlaceName).toBe(name);expect(s.displayName).toBe(name);expect(s.evidenceDocumentTitle).toBe(title);
});
test('explicit entity metadata outranks document title and authored label', () => {
 const b={evidence:[ev('Cedar Trail Permit Requirements','walk',{canonicalEntityName:'Cedar Trail'})]};
 const s=resolveStopIdentities({itineraryData:plan(['Cedar Trail']),evidenceBundle:b}).itineraryData.days[0].stops[0];
 expect(s.canonicalPlaceName).toBe('Cedar Trail');expect(s.entityNameSource).toBe('structured_entity');
});
test('G/H: seasonal sole primary needs a grounded eligible fallback', () => {
 const b={evidence:[ev('Habitat Center','museum',{seasonal:true}),ev('Forest Loop','walk')]};
 const p=plan(['Habitat Center']);
 expect(evaluate({itineraryData:p,bundle:b}).reasonCodes).toContain('conditional_primary_unsupported');
 p.days[0].stops[0].alternatives=[{name:'Invented'}];
 expect(evaluate({itineraryData:p,bundle:b}).ok).toBe(false);
 p.days[0].stops[0].alternatives=[{name:'Forest Loop'}];
 const q=evaluate({itineraryData:p,bundle:b});expect(q.ok).toBe(true);
 expect(q.diagnostics.days[0]).toMatchObject({provisional:true,conditionalStatus:'PRIMARY_CONDITIONAL_WITH_FALLBACK'});
});
test('a nonconditional independent primary supports a conditional day', () => {
 const b={evidence:[ev('Habitat Center','museum',{seasonal:true}),ev('Forest Loop','walk')]};
 const p=plan(['Habitat Center']);p.days[0].stops.push(stop('Forest Loop',{type:'walk'}));
 expect(evaluate({itineraryData:p,bundle:b}).ok).toBe(true);
});
test('quality merge cannot change frozen days, invent identities or inherit removed facts', () => {
 const p=plan(Array(4).fill('Heritage Hall'));p.days[1].stops[0].exposureLevel='low';
 const q=evaluate({itineraryData:p,bundle});
 const op={dayNumber:2,stopIndex:0,placeRef:q.candidates[0].ref,durationMinutes:120,note:'Explore',why:'A distinct outing'};
 const m=applyQualityReplacements(p,q,[op]);expect(m.ok).toBe(true);
 expect(m.plan.days[0]).toEqual(p.days[0]);expect(m.plan.days[1].stops[0].exposureLevel).toBeUndefined();
 expect(applyQualityReplacements(p,q,[{...op,dayNumber:1}]).ok).toBe(false);
 expect(applyQualityReplacements(p,q,[{...op,placeRef:9999}]).ok).toBe(false);
});
test('facility semantic categories preserve cultural, visitor-service and nature identities', () => {
 const names=['History Museum','Canyon Visitor Center','Habitat Nature Center'];
 const b={evidence:names.map(n=>ev(n,'visitor_center',{activityTypes:['exhibits']}))};
 const p=resolveStopIdentities({itineraryData:plan(names),evidenceBundle:b}).itineraryData;
 expect(p.days.map(d=>d.stops[0].semanticCategory)).toEqual(['museum_cultural','visitor_service','nature_interpretive']);
});

test('captured technical success fails repetition and seasonal robustness with no invented alternatives', () => {
 const fixture=require('./fixtures/tripQuality/captured-trip.json');
 const normalized=resolveStopIdentities({itineraryData:fixture.plan,evidenceBundle:fixture.bundle});
 expect(normalized.violations).toEqual([]);
 const road=normalized.itineraryData.days[2].stops[0];
 expect(road.canonicalPlaceName).toBe('Zion-Mt. Carmel Highway');
 expect(applyStopDisplayLabel(road).displayName).toBe('Zion-Mt. Carmel Highway');
 expect(road.evidenceDocumentTitle).toBe('Large vehicle restrictions on Zion-Mt. Carmel Highway');
 const q=evaluate({itineraryData:normalized.itineraryData,bundle:fixture.bundle});
 expect(q.reasonCodes).toEqual(['excessive_trip_repetition','conditional_primary_unsupported']);
 expect(q.diagnostics.days[3].conditionalStatus).toBe('PRIMARY_CONDITIONAL_UNSUPPORTED');
 expect(q.retryability).toBe('evidence_blocker');expect(q.candidates).toHaveLength(0);
});

test('a token nonconditional stop cannot cover a seasonal primary and excluded fallbacks cannot rescue it', () => {
 const b={evidence:[ev('Habitat Center','museum',{seasonal:true}),ev('Forest Loop','walk')]};
 const p=plan(['Habitat Center']);p.days[0].stops.push(stop('Forest Loop',{type:'walk',duration:1}));
 expect(evaluate({itineraryData:p,bundle:b}).ok).toBe(false);
 p.days[0].stops.pop();p.days[0].stops[0].alternatives=[{name:'Forest Loop'}];
 expect(evaluate({itineraryData:p,bundle:b,excludedEvidenceIds:['ev:Forest Loop']}).ok).toBe(false);
});

test('incidental brief repeats and recurring lodging do not turn variety into a checklist', () => {
 const p=plan(['Forest Loop','River Path','Coastal Route','High Meadow']);
 for(const d of p.days)d.stops.push(stop('Heritage Hall',{duration:5}),stop('Base Hotel',{type:'lodging',duration:600}));
 expect(evaluate({itineraryData:p,bundle}).ok).toBe(true);
});
test('a request to avoid repetition is not permission for daily repetition', () => {
 expect(evaluate({itineraryData:plan(Array(4).fill('Heritage Hall')),bundle,userPrompt:"Do not revisit the same place every day"}).ok).toBe(false);
});

test('repair catalogue uses the same entity provenance as final identity normalization', () => {
 const {buildEvidenceBoundRepairCandidates}=require('../evidenceBoundRepairCandidates');
 const b={evidence:[ev('Cedar Trail Permit Requirements','walk',{canonicalEntityName:'Cedar Trail'})]};
 const catalogue=buildEvidenceBoundRepairCandidates({bundle:b});
 expect(catalogue.candidates[0]).toMatchObject({canonicalName:'Cedar Trail',evidenceIds:['ev:Cedar Trail Permit Requirements']});
});

test('seasonal scenery does not make an otherwise available hike conditional', () => {
 const b={evidence:[ev('Forest Loop','walk')]};b.evidence[0].claim.text='Forest Loop has seasonal waterfalls and summer flowers.';
 expect(evaluate({itineraryData:plan(['Forest Loop']),bundle:b}).ok).toBe(true);
});
test('an authoritative entity name containing an operational word remains an entity', () => {
 const {entityEvidenceProvenance}=require('../entityEvidenceProvenance');
 expect(entityEvidenceProvenance(ev('Closed Museum','museum')).canonicalEntityName).toBe('Closed Museum');
});

test('confirmed date coverage and established permits do not demand unnecessary quality repair', () => {
 const b={evidence:[ev('Seasonal Gallery','museum',{operatingMonths:[6,7,8]})]};
 const itineraryData=plan(['Seasonal Gallery']);
 expect(evaluate({itineraryData,bundle:b,constraints:{dates:{startDate:'2026-07-01',endDate:'2026-07-04'}}}).ok).toBe(true);
 expect(evaluate({itineraryData,bundle:b,constraints:{dates:{startDate:'2026-10-01',endDate:'2026-10-04'}}}).ok).toBe(false);
 const permit={evidence:[ev('Reserved Gallery','museum',{operationalFacts:[{type:'permit_required'}]})]};
 expect(evaluate({itineraryData:plan(['Reserved Gallery']),bundle:permit,userPrompt:'We have a permit.'}).ok).toBe(true);
 permit.evidence[0].claim.normalizedValue.operationalFacts=[];
 permit.evidence[0].claim.text='No permit required.';
 expect(evaluate({itineraryData:plan(['Reserved Gallery']),bundle:permit}).ok).toBe(true);
});
