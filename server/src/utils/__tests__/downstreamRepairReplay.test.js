'use strict';
const fs = require('fs');
const path = require('path');
const { __testables, executeTrailieTurn } = require('../../services/trailieExecutionService');
const { resolveSubstitutionScope, buildLegalSubstitutionCatalog, applyLegalStopSubstitution } = require('../legalStopSubstitutionRepair');
const { candidatePool, projectPlan } = require('../downstreamRepairPlanner');
const dir=path.resolve(__dirname,'../../../../artifacts/trailie-zion-paid-grounded-scope-2026-09-24');
const read=name=>JSON.parse(fs.readFileSync(path.join(dir,name),'utf8'));
const bundle=read('frozen-evidence.json');const primary=read('primary-candidate.json');const dispatches=read('dispatches.json');
const validate=plan=>__testables.validateGeneration({output:{itineraryData:plan,structuredStatus:'complete',text:''},itinerary:true,bundle,constraints:{tripDays:4},userPrompt:'Give me four days in Zion.',detectContradiction:()=>[],finalizeItinerary:require('../finalizeItinerary').finalizeStructuredItinerary});
test('exact captured identity and final coverage snapshots replay without provider calls',async()=>{
 const before=await validate(primary);expect(before.stage).toBe('stop_identity');
 const scope=resolveSubstitutionScope({itineraryData:before.candidatePlan,offendingStops:before.offendingStops});
 const catalog=buildLegalSubstitutionCatalog({bundle,constraints:{tripDays:4},candidatePlan:before.candidatePlan,repairScope:scope});
 // Verify reconstructed frozen catalogue against every name/ref actually sent.
 const offered=[...dispatches[1].request.input[0].content.matchAll(/placeRef (\d+) — ([^\n]+)/g)];
 expect(offered).toHaveLength(30);
 for(const match of offered) expect(match[2].startsWith(catalog.candidates.find(c=>c.ref===Number(match[1]))?.canonicalName)).toBe(true);
 const selected=JSON.parse(dispatches[1].generated).substitutions;
 const pool=candidatePool({plan:before.candidatePlan,targets:scope.targets.map(t=>({dayNumber:t.dayRef,stopIndex:t.stopRef-1})),candidates:catalog.candidates,context:{bundle,constraints:{tripDays:4}},identity:true,focusedRepairBudgetRemaining:2,coverageAvailable:true});
 const picked=pool.byScope[0].options.find(o=>o.candidateRef===selected[0].replacement.placeRef);
 expect(picked.projectedCoverageStatus).toBe('primary_too_thin_for_available_day');expect(picked.repairViability).not.toBe('SELF_SUFFICIENT');
 const merged=applyLegalStopSubstitution({itineraryData:before.candidatePlan,scope,substitutions:selected,candidates:catalog.candidates});expect(merged.ok).toBe(true);
 const after=await validate(merged.plan);expect(after.actionability.affectedDays).toEqual([2,3,4]);
 const quality=after.actionability;
 const coveragePool=candidatePool({plan:after.candidatePlan,targets:quality.diagnostics.days.flatMap(d=>d.weakStopIndexes.map(stopIndex=>({dayNumber:d.dayNumber,stopIndex}))),candidates:quality.candidates,context:{bundle,constraints:{tripDays:4}},focusedRepairBudgetRemaining:1});
 const compact=require('../compactRepairContext').compactRepairContext({quality:{...quality,candidates:coveragePool.candidates,repairPool:coveragePool},plan:after.candidatePlan,bundle,constraints:{tripDays:4}});
 expect(compact.telemetry.repairPromptTokens).toBeLessThan(10000);
 expect(new Set(compact.context.candidates.map(c=>c.ref)).size).toBe(compact.context.candidates.length);
 expect(JSON.stringify(compact.context)).not.toMatch(/normalizedValue|accessEligibility|EvidenceBundle/);
 const last=await validate(read('last-unsaved-candidate.json'));expect(last.reasonCodes).toContain('insufficient_day_coverage');expect(last.reasonCodes).not.toContain('experience_scope_unbound');
 const report={identityReplacement:picked,selfSufficientCandidateCount:pool.byScope[0].options.filter(o=>o.repairViability==='SELF_SUFFICIENT').length,
  capturedCatalogVerified:offered.length,compactMultiScopeContextTokens:compact.telemetry.repairPromptTokens,compactCandidateCardTokens:compact.telemetry.candidateCardTokens,completePostIdentityFailures:projectPlan(merged.plan,{bundle}).days.filter(d=>d.codes.length),coverageAffectedDays:after.actionability.affectedDays,
  finalTerminalReason:last.reasonCodes[0],originalSameFamilyDispatchCount:dispatches.filter(d=>d.purpose==='insufficient_day_coverage_repair').length,
  repairBudget:require('../focusedRepairBudget').MAX_FOCUSED_REPAIRS,providerCalls:0};
 fs.mkdirSync(path.resolve(dir,'../trailie-downstream-repair-offline-2026-09-24'),{recursive:true});
 fs.writeFileSync(path.resolve(dir,'../trailie-downstream-repair-offline-2026-09-24/replay.json'),JSON.stringify(report,null,2)+'\n');
});
