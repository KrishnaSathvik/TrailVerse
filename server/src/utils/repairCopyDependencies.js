'use strict';
const { createHash } = require('crypto');
function copyContextHash(day) {
  return createHash('sha256').update(JSON.stringify((day.stops || []).map(s => [s.id,s.canonicalPlaceName || s.name,s.type,s.duration,s.order,s.timeWindow,s.experienceSubject]))).digest('hex').slice(0,24);
}
function reconcileRepairDayCopy({priorPlan, plan, affectedDays, updates = [], bundle}) {
  const next = JSON.parse(JSON.stringify(plan));
  const fail = () => ({ok:false,reasonCodes:['repair_copy_scope_invalid']});
  if(!Array.isArray(updates))return fail();
  const removed = (priorPlan.days || []).flatMap(d=>d.stops || []).map(s=>s.canonicalPlaceName || s.name)
    .filter(name=>!(plan.days || []).some(d=>(d.stops || []).some(s=>(s.canonicalPlaceName || s.name)===name)));
  const diagnostics=[];
  for(const [index,day] of next.days.entries()) {
    const number=Number(day.dayNumber || day.day || index+1);if(!affectedDays.includes(number))continue;
    const before=priorPlan.days.find((d,i)=>Number(d.dayNumber || d.day || i+1)===number);
    if(copyContextHash(before || {})===copyContextHash(day))continue;
    for(const stop of day.stops || []) {
      const old=(before?.stops || []).find(s=>s.id ? s.id===stop.id : s.name===stop.name);
      // All old sibling prose depends on the prior day structure. Preserve
      // only literal source-owned operational facts, never mixed model prose.
      if(old && old.name===stop.name) {
        const facts=require('./semanticDayValue').evidenceForStop(stop,bundle)
          .flatMap(r=>r.claim?.normalizedValue?.operationalFacts || []).map(f=>f.text).filter(t=>typeof t==='string');
        stop.note=facts.join(' ');stop.why='';
        diagnostics.push({dayNumber:number,stopId:stop.id || null,action:'invalidated_dependent_copy'});
      }
    }
    day.label='';day.title='';day.summary='';day.notes='';
  }
  for(const update of updates) {
    if(!update || Object.keys(update).some(k=>!['dayNumber','stopIndex','contextHash','dependsOn','why','note','label','summary'].includes(k)))return fail();
    if(!affectedDays.includes(update.dayNumber))return fail();
    const day=next.days.find((d,i)=>Number(d.dayNumber || d.day || i+1)===update.dayNumber);
    if(!day)return fail();
    const dependencies=update.dependsOn;
    const currentDependencies=Array.isArray(dependencies) && dependencies.length && dependencies.every(dep=>day.stops.some(stop=>stop.id===dep.stopId && stop.type===dep.experienceType));
    if(update.contextHash!==copyContextHash(priorPlan.days.find((d,i)=>Number(d.dayNumber || d.day || i+1)===update.dayNumber) || {}) || !currentDependencies) {
      diagnostics.push({dayNumber:update.dayNumber,action:'omitted_unverified_copy'});continue;
    }
    const fields=['why','note','label','summary'].filter(k=>Object.hasOwn(update,k) && update[k] != null);
    if(fields.some(k=>typeof update[k]!=='string'))return fail();
    if(fields.some(k=>removed.some(name=>name && update[k].toLowerCase().includes(name.toLowerCase())))) { diagnostics.push({dayNumber:update.dayNumber,action:'omitted_removed_experience_copy'});continue; }
    if(update.stopIndex != null) {
      if(!Number.isInteger(update.stopIndex) || !day.stops[update.stopIndex] || fields.some(k=>!['why','note'].includes(k)))return fail();
      for(const field of fields)day.stops[update.stopIndex][field]=update[field];
    } else {
      if(fields.some(k=>!['label','summary'].includes(k)))return fail();
      for(const field of fields)day[field]=update[field];
    }
  }
  return {ok:true,plan:next,diagnostics};
}
module.exports={copyContextHash,reconcileRepairDayCopy};
