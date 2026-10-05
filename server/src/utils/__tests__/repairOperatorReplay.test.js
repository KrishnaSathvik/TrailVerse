'use strict';
const fs=require('fs');const path=require('path');
const {__testables}=require('../../services/trailieExecutionService');
const {resolveSubstitutionScope,buildLegalSubstitutionCatalog,applyLegalStopSubstitution}=require('../legalStopSubstitutionRepair');
const {buildPlanViabilitySnapshot,applyPlanViabilityRepair}=require('../planViabilityRepair');
const {candidatePool}=require('../downstreamRepairPlanner');
const {compactRepairContext,candidateCard}=require('../compactRepairContext');
const {activityDurationRange}=require('../evidenceActivityDuration');
const {entityEvidenceProvenance}=require('../entityEvidenceProvenance');
const {conditionalDependency}=require('../tripExperienceQuality');
const {buildEvidenceBoundRepairCandidates}=require('../evidenceBoundRepairCandidates');
const {normalizeEvidencePlaceCandidates,placeKeyOf}=require('../evidencePlaceCandidate');
const {SUBSTANTIAL_SINGLE_EXPERIENCE_MIN_MINUTES}=require('../itineraryCompleteness');
const root=path.resolve(__dirname,'../../../../artifacts');
const dir=path.join(root,'trailie-zion-paid-grounded-scope-2026-09-24');
const out=path.join(root,'trailie-repair-operators-offline-2026-09-24');
const read=n=>JSON.parse(fs.readFileSync(path.join(dir,n),'utf8'));
const bundle=read('frozen-evidence.json');const constraints={tripDays:4};const context={bundle,constraints,userPrompt:'Give me four days in Zion.'};
const validate=plan=>__testables.validateGeneration({output:{itineraryData:plan,structuredStatus:'complete',text:''},itinerary:true,...context,detectContradiction:()=>[],finalizeItinerary:require('../finalizeItinerary').finalizeStructuredItinerary});
const counts=items=>items.reduce((a,k)=>(a[k]=(a[k]||0)+1,a),{});
test('N: frozen capture coalesces all scopes, with source-backed golden assignment and catalog forensic artifact',async()=>{
 const before=await validate(read('primary-candidate.json'));
 const scope=resolveSubstitutionScope({itineraryData:before.candidatePlan,offendingStops:before.offendingStops});
 const identity=buildLegalSubstitutionCatalog({bundle,constraints,candidatePlan:before.candidatePlan,repairScope:scope});
 const substitutions=JSON.parse(read('dispatches.json')[1].generated).substitutions;
 const identityPool=candidatePool({plan:before.candidatePlan,targets:scope.targets.map(t=>({dayNumber:t.dayRef,stopIndex:t.stopRef-1})),candidates:identity.candidates,context,identity:true,focusedRepairBudgetRemaining:2,viabilityAvailable:true,
 followupPossible:(plan,projection)=>buildPlanViabilitySnapshot({plan,projection,context,existenceOnly:true})});
 const selected=identityPool.byScope[0].options.find(o=>o.candidateRef===substitutions[0].replacement.placeRef);
 expect(selected.expectedFollowupOperator).toBe('PLAN_VIABILITY_EDIT');expect(selected.followupUniverseAvailable).toBe(true);
 const merged=applyLegalStopSubstitution({itineraryData:before.candidatePlan,scope,substitutions,candidates:identity.candidates});expect(merged.ok).toBe(true);
 const afterIdentity=await validate(merged.plan);const plan=afterIdentity.candidatePlan;
 const snapshot=buildPlanViabilitySnapshot({plan,context});expect(snapshot.ok).toBe(true);
 expect(snapshot.affectedDays).toEqual([1,2,3,4]);expect(snapshot.scopes[0].reasons).toContain('conditional_primary_unsupported');
 const compact=compactRepairContext({quality:snapshot,plan,bundle,constraints});
 const eligible=buildEvidenceBoundRepairCandidates({bundle,constraints,candidatePlan:plan,includeExisting:true});
 const auditCandidates=eligible.candidates.map(c=>{
  const card=candidateCard(c,bundle);const records=bundle.evidence.filter(r=>c.evidenceIds.includes(r.evidenceId));
  const ranges=records.map(r=>activityDurationRange(r.claim.normalizedValue?.duration)).filter(Boolean);
  const conditional=conditionalDependency({name:c.canonicalName,type:c.canonicalType,evidenceRef:c.evidenceIds[0]},bundle,{constraints});
  return {ref:c.ref,name:c.canonicalName,type:c.canonicalType,recordCount:records.length,sourceCategories:c.sourceCategories,
   sourceDurationRanges:ranges,maxDurationMinutes:c.maxDurationMinutes,difficulties:card.hardConstraints.map(c=>c.difficulty).filter(Boolean),exposureLevels:card.hardConstraints.map(c=>c.exposureLevel).filter(Boolean),conditional,
   sourceSupportedSubstantial:ranges.some(r=>r.maxMinutes>=SUBSTANTIAL_SINGLE_EXPERIENCE_MIN_MINUTES),
   genericPlaceWithoutDuration:records.some(r=>r.claim.normalizedValue?.category==='place') && !ranges.length,
   evidenceIds:c.evidenceIds};
 });
 // Offline feasibility search only. Runtime model still chooses every operation.
 // The stronger golden check requires source duration, avoids known hard routes,
 // and excludes unresolved dependencies; it never pads unsourced viewpoints.
 let explored=0;let solution=null;let result=null;
 function search(index,operations){
  if(solution || explored>5000)return;
  if(index===snapshot.scopes.length){explored++;const r=applyPlanViabilityRepair({plan,snapshot,operations});if(r.ok){solution=operations;result=r;}return;}
  const scope=snapshot.scopes[index];
  for(const target of snapshot.repairPool.byScope.filter(t=>t.dayNumber===scope.dayNumber && t.operation==='replace_stop')){
   for(const ref of [...target.eligibleCandidateRefs].sort((a,b)=>Number(auditCandidates.find(c=>c.ref===b)?.difficulties.includes('easy'))-Number(auditCandidates.find(c=>c.ref===a)?.difficulties.includes('easy')))){
    const c=auditCandidates.find(c=>c.ref===ref);
    if(!c?.sourceSupportedSubstantial || c.conditional || c.difficulties.some(d=>['hard','strenuous'].includes(d)) || c.exposureLevels.includes('high'))continue;
    // A stronger offline quality fixture also avoids explicitly cross-referenced
    // outings on separate days. This conservative test heuristic is not a
    // runtime exclusion or a claim that all connected experiences are repeats.
    const textFor = candidate => bundle.evidence.filter(e=>candidate.evidenceIds.includes(e.evidenceId)).map(e=>e.claim.text).join(' ').toLowerCase();
    if(operations.some(o=>{const prior=auditCandidates.find(c=>c.ref===o.placeRef);return textFor(c).includes(prior.name.toLowerCase()) || textFor(prior).includes(c.name.toLowerCase());}))continue;
    const duration=target.options.find(o=>o.candidateRef===ref).projectedDurationMinutes;
    search(index+1,[...operations,{op:target.operation,dayNumber:scope.dayNumber,stopIndex:target.stopIndex,placeRef:ref,durationMinutes:duration,note:c.name,why:c.name}]);
    if(solution)return;
   }
  }
 }
 search(0,[]);
 expect(solution).not.toBeNull();const final=await validate(result.plan);expect(final.status).toBe('pass');
 const activityRecords=bundle.evidence.filter(r=>r.topic==='activities');
 const activityNames=activityRecords.map(r=>placeKeyOf(entityEvidenceProvenance(r).canonicalEntityName));
 const report={providerCalls:0,repairBudget:2,slot1:{operator:'IDENTITY_SUBSTITUTION',selected},
  postIdentityBlockers:snapshot.projection.days.map(d=>({day:d.dayNumber,reasons:d.codes,coverageReasonCode:d.coverageReasonCode})),
  slot2:{operator:snapshot.repairOperator,affectedScopes:snapshot.affectedDays,reasonCodes:snapshot.reasonCodes},
  thirdRepairRequiredByArchitecture:false,deterministicCandidateUniverseSufficient:'YES',finalProjectedStatus:final.status,
  goldenSimulation:{assignmentAttempts:explored,operations:solution.map(o=>({...o,name:snapshot.candidates.find(c=>c.ref===o.placeRef).canonicalName})),progress:result.progress,
   limitation:'A source-backed validator-valid starter, not a live access, routing, seasonal or traveler-preference guarantee.'},
  compactContext:compact.telemetry,
  forensic:{recordCount:bundle.evidence.length,topicCounts:counts(bundle.evidence.map(r=>r.topic)),activityRecords:activityRecords.length,
   activitySourceCategoryCounts:counts(activityRecords.map(r=>r.claim.normalizedValue?.category || 'unknown')),
   normalizedPlaceTypeCounts:counts(normalizeEvidencePlaceCandidates(bundle).map(c=>c.canonicalType || 'unknown')),
   activityUniqueSourceNames:new Set(activityNames).size,duplicateActivityRepresentations:activityNames.length-new Set(activityNames).size,
   operationalDocumentRecords:bundle.evidence.filter(r=>entityEvidenceProvenance(r).evidenceDocumentTitle).map(r=>({topic:r.topic,...entityEvidenceProvenance(r)})),
   eligibleCatalogCount:eligible.count,catalogAudit:eligible.audit,candidateTypeCounts:counts(auditCandidates.map(c=>c.type)),
   sourceSupportedSubstantialCount:auditCandidates.filter(c=>c.sourceSupportedSubstantial).length,
   conditionalCount:auditCandidates.filter(c=>c.conditional).length,
   genericPlaceWithoutDurationCount:auditCandidates.filter(c=>c.genericPlaceWithoutDuration).length,candidates:auditCandidates}};
 fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'capture-replay-and-forensics.json'),JSON.stringify(report,null,2)+'\n');
 fs.writeFileSync(path.join(out,'golden-offline-plan.json'),JSON.stringify(result.plan,null,2)+'\n');
});
