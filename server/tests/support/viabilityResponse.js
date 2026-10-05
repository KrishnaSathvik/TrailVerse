'use strict';
// Scripted model output for offline wiring tests, not a runtime selection policy.
function viabilityResponse(request) {
  const context=JSON.parse(request.input[0].content);const used=new Set();
  const operations=context.scope.map(day=>{
    const target=context.candidateEligibility.find(t=>t.dayNumber===day.dayNumber && t.eligibleCandidateRefs.some(ref=>!used.has(ref)));
    if(!target){const removal=context.removals?.find(t=>t.dayNumber===day.dayNumber);if(removal)return {op:'remove_stop',dayNumber:day.dayNumber,stopIndex:removal.stopIndex,placeRef:null,durationMinutes:null,note:null,why:null};throw Error('fixture has no distinct assignment');}
    const ref=target.eligibleCandidateRefs.find(ref=>!used.has(ref));used.add(ref);
    const card=context.candidates.find(c=>c.ref===ref);const projection=(target.projections || target.projectionRefs.map(i=>context.projectedOutcomes[i])).find(p=>p[0]===ref);
    return {op:target.operation,dayNumber:day.dayNumber,stopIndex:target.stopIndex,placeRef:ref,durationMinutes:projection[context.viabilityFields.indexOf('projectedDurationMinutes')],note:card.canonicalName,why:card.canonicalName};
  });
  return {text:'',outputText:'',completionStatus:'complete',stopReason:'stop',toolCalls:[{id:'viability-test',name:'repair_plan_viability',input:{operations}}],usage:{inputTokens:100,outputTokens:100}};
}
module.exports={viabilityResponse};
