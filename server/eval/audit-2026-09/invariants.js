'use strict';
const fs=require('fs');
const path=require('path');
const {emptyPlanningState}=require('../../src/utils/planningState');
const {commitUnderstoodTripChange,persistCommittedTripMutation}=require('../../src/services/tripMutationCommit');
const {resolveRefinementScope,evaluateScopedOwnership}=require('../../src/utils/refinementScope');
const {itineraryImpacts}=require('../../src/utils/itineraryImpact');
const {bindDerivedSurfaces,isPlanDerivedCurrent}=require('../../src/utils/planDerivedState');
const {applyPlanPatch}=require('../../src/utils/itineraryPlanPatch');
const OUT=path.resolve(__dirname,'../../../docs/eval/trailie-audit-2026-09-23');
const rows=[];
function check(id,expectation,actual,pass){rows.push({id,expectation,actual,pass:Boolean(pass)});}
const plan={days:[1,2,3,4].map(n=>({dayNumber:n,stops:[{id:`s${n}`,name:n===2?'Canyon road scenic hike':`Trail ${n}`,type:'trail',duration:90,drivingTimeFromPreviousMin:20}],totalDriveMinutes:20}))};
async function main(){
  for(const [message,want] of [['We booked a hotel in Springdale.',true],['What if we stayed in Springdale?',false],['Maybe Springdale would be easier.',false],['We booked Springdale.',true],['I do not want sunrise photography.',false],['Maybe we can hike later, but we booked a hotel in Springdale.',true]]){
    const r=commitUnderstoodTripChange({message,planningState:emptyPlanningState()});
    check(`commit:${message}`,want,r.committed,r.committed===want);
  }
  for(const failure of ['model_failure','routing_exhaustion','evidence_failure','invalid_structure','render_failure']){
    for(const guest of [true,false]){
      let saved=null;
      const session={markModified(){},async save(){saved=structuredClone(this.planningState);}};
      const ctx={planningState:emptyPlanningState(),constraints:{},resolvedMetadata:{}};
      await persistCommittedTripMutation({message:'I really want sunrise photography.',preparedContext:ctx,...(guest?{session}:{})});
      try{throw new Error(failure);}catch{}
      check(`${guest?'guest':'authenticated'}:${failure}`,'durable sunrise fact before downstream failure',saved?.activityPreferences||null,saved?.activityPreferences?.photographyTiming==='sunrise');
    }
  }
  for(const [message,start,expected] of [['tomorrow','2026-09-12',null],['tomorrow',null,null],['today',null,null],['morning after we arrive','2026-09-23',2],['Friday','2026-09-23',3]]){
    const r=resolveRefinementScope({text:`Make ${message} easier`,priorPlan:plan,tripStart:start,now:new Date('2026-09-23T12:00:00Z')});
    check(`temporal:${message}:${start}`,expected,r,expected===null?r?.resolved===false:r?.dayNumber===expected);
  }
  for(const message of ['No exposed hikes','My parents are joining',"It's raining tomorrow morning",'Our permit was cancelled',"We can't start before 10",'The canyon road is closed']){
    const r=itineraryImpacts({text:message,plan});
    check(`impact:${message}`,'identify affected scope or explicit unresolved analysis',r,r.length>0);
  }
  const scope=resolveRefinementScope({text:'Redo day two',priorPlan:plan});
  const applied=applyPlanPatch({priorPlan:plan,planPatch:{response:'Updated day two',operations:[{op:'update_day',dayNumber:2,day:{...plan.days[1],stops:[{id:'new2',name:'Replacement',duration:60,drivingTimeFromPreviousMin:99}]}}]}});
  check('patch_unaffected_days','days 1,3,4 unchanged',applied.ok,applied.ok&&[0,2,3].every(i=>JSON.stringify(plan.days[i])===JSON.stringify(applied.plan.days[i])));
  check('patch_changed_drives','stale drive cleared',applied.plan?.days[1],applied.plan?.days[1]?.stops[0]?.drivingTimeFromPreviousMin===null);
  const escaped=structuredClone(plan);escaped.days[0].stops[0].name='Illegal edit';
  const ownership=evaluateScopedOwnership({priorPlan:plan,nextPlan:escaped,scope});
  check('scope_escape','reject unauthorized day',ownership,ownership.ok===false||ownership.valid===false||ownership.status==='fail');
  const rebound=bindDerivedSurfaces({planHash:'new',travelLogistics:{planHash:'old',routeLegs:[{minutes:123,from:'old stop'}]}});
  check('derived_old_hash','old artifact must not become current merely by stamping',rebound,!isPlanDerivedCurrent(rebound.travelLogistics,'new'));
  fs.writeFileSync(path.join(OUT,'architecture-probes.json'),JSON.stringify({scope:'targeted production-helper probes; simulated downstream exceptions, not full HTTP persistence',rows,passed:rows.filter(r=>r.pass).length,failed:rows.filter(r=>!r.pass).length},null,2));
  console.log(JSON.stringify({passed:rows.filter(r=>r.pass).length,failed:rows.filter(r=>!r.pass).length,failures:rows.filter(r=>!r.pass).map(r=>r.id)}));
}
main().catch(e=>{console.error(e);process.exitCode=1;});
