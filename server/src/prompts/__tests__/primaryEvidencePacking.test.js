'use strict';
const fs = require('fs');
const path = require('path');
const { renderEvidenceBundleForPrompt: render } = require('../evidenceBundlePromptRenderer');
const { buildTrailiePromptV2 } = require('../trailiePromptV2');
const { packingQuality } = require('../primaryEvidencePacking');
const { countPromptTokens } = require('../../utils/promptTokenAccounting');
const record = (id, nv = {}, topic = 'activities', text = 'A grounded outing through varied terrain.') => ({
  evidenceId: id, topic, claim: { text, normalizedValue: { name: `Route ${id}`, type: 'walk', activityTypes: ['walk'], ...nv } },
  source: { provider: 'nps', url: `https://example.test/${id}` },
});
const activities = () => Array.from({ length: 18 }, (_,i) => record(`a${i}`, { duration: '2–3 Hours' }));
function input(evidence, extra = {}) {
  const requirements = [...new Set(evidence.map(e => e.topic))].map(topic => ({ requirementId: topic, topic, reasonCodes: ['itinerary_operating'] }));
  return { bundle: { evidence, resolutions: requirements.map(r => ({ requirementId: r.requirementId, status: 'satisfied_fresh', evidenceIds: evidence.filter(e => e.topic === r.topic).map(e => e.evidenceId) })) },
    requirements, constraints: { tripDays: 4 }, userRequest: 'Plan a four-day trip.', maxTokens: 1600, ...extra };
}
test('A: support-only historical selection is starved; one deterministic compact repack recovers choices', () => {
  expect(packingQuality({job:{itinerary:true,days:4},eligibleCount:18,packedCount:0})).toEqual(['primary_evidence_starvation']);
  const evidence = activities().map(r => ({...r, claim:{...r.claim, text:'Grounded route details. '.repeat(80)}}));
  evidence.push(record('desk', {type:'visitor_center',activityTypes:['visitor_center']}, 'visitor_services'));
  // A constrained window makes full cards starve; the one compact pass recovers.
  const results = [130,150,170,190,210,230].map(maxTokens => {try{return render(input(evidence,{maxTokens}));}catch{return null;}}).filter(Boolean);
  expect(results.some(r => r.primaryPacking.repackOccurred && r.primaryPacking.packedExperienceCount > 1)).toBe(true);
});
test('B: critical operational truth survives alongside experiences', () => {
  const r=render(input([...activities(), record('closure', {name:'Remote Road closure',type:null,activityTypes:[]}, 'alerts_closures','Remote Road is closed to all vehicles.')]));
  expect(r.text).toContain('closed to all vehicles'); expect(r.primaryPacking.packedExperienceCount).toBeGreaterThan(1);
  expect(r.primaryPacking.packedCriticalOperationalCount).toBe(r.primaryPacking.criticalOperationalCount);
});
test('C: duplicate sources share one card and document titles remain overlays', () => {
  const r=render(input([record('a',{name:'Cedar Loop'}),record('b',{name:'Cedar Loop',duration:'90 Minutes'}),
    record('c',{name:'Hours for Cedar Loop',canonicalEntityName:'Cedar Loop',evidenceDocumentTitle:'Hours for Cedar Loop'},'hours','Access closes at dusk.')]));
  expect(r.primaryPacking.packedExperienceCount).toBe(1);expect(r.primaryPacking.deduplicatedExperienceCount).toBe(1);
  expect(r.text).toContain('Overlay:');expect(r.text).toContain('Access closes at dusk');
  expect(r.includedEvidenceIds).toEqual(expect.arrayContaining(['a','b','c']));
});
test('D: source sizing improves priority; unknown duration remains eligible', () => {
  const r=render(input([record('unknown'),record('sized',{duration:'3–4 Hours'})]));
  expect(r.text.indexOf('Route sized')).toBeLessThan(r.text.indexOf('Route unknown'));
  expect(r.primaryPacking.eligibleExperienceCount).toBe(2);expect(r.primaryPacking.packedSourceDurationBackedCount).toBe(1);
});
test('E: accessibility prose stays bounded while structured facts survive', () => {
  const r=render(input([record('accessible',{duration:'90 Minutes',wheelchairAccessible:true,accessibility:'<p>Grounded access details</p> '.repeat(3000)}),...activities()]));
  expect(r.text).not.toContain('<p>');expect(r.text.length).toBeLessThan(18000);
  expect(r.text).toContain('wheelchairAccessible');expect(r.text).toContain('partial source detail');expect(r.primaryPacking.packedExperienceCount).toBeGreaterThan(1);
});
test('F: factual Q&A keeps its small context despite durable trip duration', () => {
  const data=input(activities(),{userRequest:'What is the entrance fee for four days?',requirements:[{requirementId:'fees',topic:'fees'}]});
  const r=buildTrailiePromptV2({mode:'buddy',evidenceBundle:data.bundle,...data});
  expect(r.budgets.evidenceTokens).toBe(1200);expect(r.evidence.primaryPacking).toBeUndefined();
});
test('G: multi-day depth scales sublinearly; candidates are choices, not prescribed days', () => {
  const data=input(Array.from({length:50},(_,i)=>record(`long${i}`,{duration:'2–3 Hours'})));const make=days=>buildTrailiePromptV2({mode:'architect',evidenceBundle:data.bundle,requirements:data.requirements,constraints:{tripDays:days},userRequest:'Plan my trip.'});
  const one=make(1), four=make(4), long=make(21);
  expect(four.evidence.primaryPacking.packedExperienceCount).toBeGreaterThan(one.evidence.primaryPacking.packedExperienceCount);
  expect(long.budgets.evidenceTokens).toBeLessThan(four.budgets.evidenceTokens*2);
  expect(four.accounting.totalTokens).toBeLessThanOrEqual(four.budgets.totalTokens);
});
test('H: sparse sources do not fabricate variety or trigger starvation', () => {
  const r=render(input([record('only')]));expect(r.primaryPacking.packedExperienceCount).toBe(1);expect(r.primaryPacking.packingWarnings).toEqual([]);
});
test('I: unresolved dependencies lose priority without disappearing', () => {
  const r=render(input([record('conditional',{permitRequired:true,operationalFacts:[{type:'permit_required',value:true,text:'Permit required.'}]}),record('ordinary')]));
  expect(r.text.indexOf('Route ordinary')).toBeLessThan(r.text.indexOf('Route conditional'));expect(r.primaryPacking.eligibleExperienceCount).toBe(2);
});
test('J: cultural requests dominate when supported; no forced trail requirement', () => {
  const museums=Array.from({length:10},(_,i)=>record(`m${i}`,{name:`Gallery ${i}`,type:'museum',category:'museum',activityTypes:['exhibits']}));
  const r=render(input([...activities(),...museums],{userRequest:'Plan a four-day museum and cultural trip.',maxTokens:600}));
  expect((r.text.match(/\[EXPERIENCE \| museum\]/g)||[]).length).toBeGreaterThan((r.text.match(/\[EXPERIENCE \| walk\]/g)||[]).length);
});
test('cannot dispatch a prompt when a rich universe cannot fit; pins and critical facts cannot be silently clipped', () => {
  expect(()=>render(input(activities(),{maxTokens:10}))).toThrow(expect.objectContaining({code:'primary_evidence_starvation',packingTelemetry:expect.objectContaining({repackOccurred:true})}));
  expect(()=>render(input([record('alert',{},'alerts_closures','Closed road.')],{maxTokens:1}))).toThrow(expect.objectContaining({code:'primary_mandatory_evidence_overflow'}));
});
test('duration text is preserved without assigning a numerical length to Half Day', () => {
  const r=render(input([record('half',{duration:'Half Day'})]));expect(r.text).toContain('Half Day');expect(r.primaryPacking.packedSourceDurationBackedCount).toBe(0);
});
test('exact frozen universe replay measures actual historical visibility and final assembled prompt', () => {
  const root=path.resolve(__dirname,'../../../../artifacts');const dir=path.join(root,'trailie-zion-paid-grounded-scope-2026-09-24');
  const bundle=JSON.parse(fs.readFileSync(path.join(dir,'frozen-evidence.json')));
  const dispatch=JSON.parse(fs.readFileSync(path.join(dir,'dispatches.json')))[0];
  const historical=dispatch.request.input.flatMap(m=>typeof m.content==='string'?[m.content]:m.content.map(c=>c.text||'')).join('\n');
  const requirements=bundle.resolutions.map(r=>({requirementId:r.requirementId,topic:bundle.evidence.find(e=>r.evidenceIds.includes(e.evidenceId))?.topic,reasonCodes:['itinerary_operating']}));
  const p=buildTrailiePromptV2({mode:'architect',evidenceBundle:bundle,requirements,constraints:{tripDays:4},userRequest:'Give me four days in Zion.'});
  expect(p.evidence.primaryPacking.packedSubstantialCount).toBeGreaterThan(3);
  expect(p.evidence.primaryPacking.packedCriticalOperationalCount).toBe(p.evidence.primaryPacking.criticalOperationalCount);
  expect(p.prompt).toContain(p.evidence.text);
  const oldEvidence=historical.split('--- PUBLIC EVIDENCE ---')[1]?.split('--- PRIVATE TRIP STATE ---')[0] || '';
  const report={note:'Exact frozen bundle and historical request. Requirement objects were not captured: IDs/topics reconstructed from frozen resolutions with itinerary intent. New context is the final assembled prompt, not model output.',
    historical:{activityBlocks:(historical.match(/\[NPS \| activities \|/g)||[]).length,supportBlocks:(historical.match(/\[NPS \| visitor_services \|/g)||[]).length,durationBackedExperienceCount:0,evidenceTokens:countPromptTokens(oldEvidence),requestTokens:countPromptTokens(historical)},
    current:{...p.evidence.primaryPacking,accounting:p.accounting},packedText:p.evidence.text,providerCalls:0};
  const out=path.join(root,'trailie-primary-packing-offline-2026-09-25');fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'captured-replay.json'),JSON.stringify(report,null,2)+'\n');
});
test('runtime packing failure exits internally before primary dispatch and consumes no repair slots', async () => {
  const {executeTrailieTurn}=require('../../services/trailieExecutionService');
  const {buildEvidenceBundle}=require('../../utils/evidenceBundle');
  const data=input(activities());const dispatch=jest.fn();
  const result=await executeTrailieTurn({userMessage:'Give me four days in Example Reserve.',
    metadata:{resolvedPlaceName:'Example Reserve'},conversationContext:{history:[]},constraints:{tripDays:4},resolvedContext:{}}, {
    enabled:true,streamGeneration:false,responseAdapters:{},resolveDeterministicRender:()=>({eligible:false}),
    classifyIntent:()=>({version:'trailie-intent-v2.0.0',source:'deterministic',primaryIntent:'full_trip',verticals:['itinerary'],depth:'planning',freshness:'stable',actionability:'planning',scope:'single_destination',entities:[],confidence:1,reasonCodes:[],structurePolicy:'required',travelerJob:null}),
    planRequirements:()=>data.requirements,
    resolveEvidence:async({requestId})=>buildEvidenceBundle({requestId,candidates:data.bundle.evidence,resolutions:data.bundle.resolutions}),
    buildPrompt:args=>buildTrailiePromptV2({...args,budgets:{evidenceTokens:10}}),executeResponses:dispatch,
  });
  expect(result.status).toBe('failed');expect(result.terminalReason).toBe('primary_evidence_starvation');
  expect(dispatch).not.toHaveBeenCalled();expect(result.telemetrySummary.subDispatches).toHaveLength(0);
});
test('restricted or seasonally excluded evidence cannot be resurrected by compact packing', () => {
  const data=input(activities(),{excludedEvidenceIds:['a0','a1']});const r=render(data);
  expect(r.includedEvidenceIds).not.toContain('a0');expect(r.includedEvidenceIds).not.toContain('a1');
});
