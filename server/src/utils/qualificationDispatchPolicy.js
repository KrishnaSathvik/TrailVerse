'use strict';

// Safety ceiling only: it never chooses a route or initiates a dispatch.
// Compatibility purposes resolve to a canonical operator before counting.
const { PURPOSE_OPERATORS: FAMILIES } = require('./repairOperators');
const { MAX_FOCUSED_MODEL_REPAIRS, MAX_FOCUSED_REPAIRS } = require('./focusedRepairBudget');
function createQualificationDispatchPolicy() {
 let primary=false;const families=new Set();const denied=[];
 function authorize({model,purpose}) {
  let reason=null;
  if(model!=='gpt-6-sol')reason='model_not_authorized';
  else if(!primary && purpose!=='primary_generation')reason='primary_required';
  else if(primary && purpose==='primary_generation')reason='whole_plan_regeneration';
  else if(primary && !FAMILIES[purpose])reason='unknown_or_unclassified_retry';
  else if(primary && families.size>=MAX_FOCUSED_MODEL_REPAIRS)reason='focused_repair_cap';
  else if(primary && families.has(FAMILIES[purpose]))reason='same_operator_repeat';
  if(reason) {
   denied.push({purpose,model,reason,classification:'qualification_harness_block'});
   throw Object.assign(new Error(`qualification_harness_block:${reason}`),{code:'qualification_harness_block',reason,retryability:'deterministic_blocker'});
  }
  if(!primary)primary=true;else families.add(FAMILIES[purpose]);
  return {authorized:true,remainingFocusedRepairs:MAX_FOCUSED_REPAIRS-families.size};
 }
 return {authorize,snapshot:()=>({primaryAuthorized:primary,repairOperators:[...families],repairFamilies:[...families],focusedModelRepairDispatches:families.size,remainingFocusedRepairs:MAX_FOCUSED_REPAIRS-families.size,denied:[...denied]})};
}
function harnessBlockTelemetry(error) {
 const blocked=error?.code==='qualification_harness_block' || error?.cause?.code==='qualification_harness_block'
  || String(error?.message || '').includes('qualification_harness_block');
 return blocked?{dispatched:false,mergeStatus:'qualification_harness_block',reasonCodes:['qualification_harness_block'],retryability:'deterministic_blocker'}:null;
}
module.exports={MAX_FOCUSED_MODEL_REPAIRS,FAMILIES,MAX_FOCUSED_REPAIRS,createQualificationDispatchPolicy,harnessBlockTelemetry};
