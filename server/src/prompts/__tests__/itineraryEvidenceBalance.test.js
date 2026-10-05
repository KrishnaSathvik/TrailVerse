'use strict';
const {renderEvidenceBundleForPrompt}=require('../evidenceBundlePromptRenderer');
const fs=require('fs');const path=require('path');
const root=path.resolve(__dirname,'../../../../artifacts');
const dir=path.join(root,'trailie-zion-paid-grounded-scope-2026-09-24');
const bundle=JSON.parse(fs.readFileSync(path.join(dir,'frozen-evidence.json')));
const requirements=bundle.resolutions.map(r=>({requirementId:r.requirementId,topic:bundle.evidence.find(e=>r.evidenceIds.includes(e.evidenceId))?.topic,reasonCodes:['itinerary_operating']}));
test('captured rich activity evidence survives the bounded primary window alongside operations',()=>{
 // The richer primary contract retains critical operations; the old cap is now
 // an explicit construction failure instead of silently starving the model.
 expect(()=>renderEvidenceBundleForPrompt({bundle,requirements,userRequest:'Give me four days in Zion.',maxTokens:1200})).toThrow();
 const result=renderEvidenceBundleForPrompt({bundle,requirements,userRequest:'Give me four days in Zion.',maxTokens:3000});
 const included=bundle.evidence.filter(e=>result.includedEvidenceIds.includes(e.evidenceId));
 const sourceOutings=included.filter(e=>e.topic==='activities' && e.claim.normalizedValue.duration);
 expect(sourceOutings.length).toBeGreaterThan(0);expect(included.some(e=>e.topic!=='activities')).toBe(true);expect(result.tokens).toBeLessThanOrEqual(3000);
 const dispatch=JSON.parse(fs.readFileSync(path.join(dir,'dispatches.json')))[0];
 const text=dispatch.request.input.flatMap(m=>typeof m.content==='string'?[m.content]:m.content.map(c=>c.text||'')).join('\n');
 const oldVisible=bundle.evidence.filter(e=>e.topic==='activities' && e.claim.normalizedValue.duration && text.split(/\n\n(?=\[)/).some(block=>/^\[NPS \| activities \|/.test(block) && block.includes(e.claim.normalizedValue.name)));
 const report={note:'Reconstructed requirements from frozen resolution IDs/topics with itinerary-operating intent; historical visibility is read from the exact captured request.',historicalSourceDurationNames:oldVisible.map(e=>e.claim.normalizedValue.name),packedTokens:result.tokens,newSourceDurationNames:sourceOutings.map(e=>e.claim.normalizedValue.name),includedTopics:included.map(e=>e.topic),packedText:result.text};
 fs.writeFileSync(path.join(root,'trailie-repair-operators-offline-2026-09-24/primary-packing.json'),JSON.stringify(report,null,2)+'\n');
});
test('unseen names: sourced outings and operations both survive, without inflating token budget',()=>{
 const evidence=[...Array.from({length:8},(_,i)=>({evidenceId:'f'+i,topic:'visitor_services',claim:{text:'Facility '+i+' has orientation information. '.repeat(20),normalizedValue:{name:'Facility '+i,activityTypes:['visitor_center']}}})),...Array.from({length:8},(_,i)=>({evidenceId:'a'+i,topic:'activities',claim:{text:'Route '+i+' has a loop through the reserve. '.repeat(20),normalizedValue:{name:'Route '+i,activityTypes:['walk'],duration:'2-3 Hours'}}}))];
 const req=['activities','visitor_services'].map(topic=>({requirementId:topic,topic,reasonCodes:['itinerary_facility']}));
 const b={evidence,resolutions:req.map(r=>({requirementId:r.requirementId,status:'satisfied_fresh',evidenceIds:evidence.filter(e=>e.topic===r.topic).map(e=>e.evidenceId)}))};
 const r=renderEvidenceBundleForPrompt({bundle:b,requirements:req,maxTokens:400});
 expect(r.includedEvidenceIds.some(id=>id.startsWith('a'))).toBe(true);expect(r.includedEvidenceIds.some(id=>id.startsWith('f'))).toBe(true);expect(r.tokens).toBeLessThanOrEqual(400);
});
