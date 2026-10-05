'use strict';

const { canonicalExperienceKey: key, structuredDaypart } = require('./canonicalExperience');
const { evidenceForStop } = require('./semanticDayValue');

// Facets describe actions at an anchor, not separate place identities. Both
// the planned action and its source support are required; new prose is not proof.
function groundedVisitFacet(stop, records) {
  const planned = `${stop.name || ''} ${stop.note || ''}`;
  const facts = records.map(r => `${r.claim?.text || ''} ${r.claim?.normalizedValue?.description || ''}`).join(' ');
  const structured = records.flatMap(r => r.claim?.normalizedValue?.visitFacets || []);
  const explicit = structured.find(f => f.kind && f.action && key(planned).includes(key(f.action)));
  if (explicit) return { kind: explicit.kind, subject: explicit.subject || '', evidenceRef: stop.evidenceRef };
  const exterior = /\b(outside|exterior|terrace|grounds)\b/i;
  const viewing = /\b(views?|viewing|photograph\w*)\b/i;
  if (['viewpoint', 'photography', 'wildlife'].includes(stop.type) && exterior.test(planned) && viewing.test(planned) && exterior.test(facts) && viewing.test(facts)) {
    const subjects = [...facts.matchAll(/\bviews? of\s+([^.!?]+?)(?:\s+outside|\s+from|[.!?]|$)/gi)].map(m => m[1].trim());
    // A named landscape in the request must be supported. Generic exterior
    // viewing is allowed only as a facet of the verified anchor, never a POI.
    const namedRequest = String(stop.name || '').replace(/\s+(?:views?|viewing|photography)\s+(?:outside|at|from)\b.*$/i, '').trim();
    const mentionsNamedSubject = /\s+(?:views?|viewing|photography)\s+(?:outside|at|from)\b/i.test(stop.name || '');
    if (mentionsNamedSubject && !subjects.some(s => key(s).includes(key(namedRequest)))) return null;
    return { kind: 'exterior_viewing', subject: subjects.join('; '), evidenceRef: stop.evidenceRef };
  }
  const cultural = /\b(exhibits?|galleries|historic interior|interior tour|cultural displays?)\b/i;
  if (cultural.test(planned) && cultural.test(facts)) return { kind: 'cultural_interior', subject: '', evidenceRef: stop.evidenceRef };
  return null;
}
function sameAnchorRelationship(a, b, { sameDay = true, adjacent = true } = {}) {
  if (!a.canonicalPlaceName || key(a.canonicalPlaceName) !== key(b.canonicalPlaceName)) return null;
  if (['exposureLevel','difficulty','walkingDistanceMiles','wheelchairAccessible'].some(field => (a[field] ?? null) !== (b[field] ?? null))) return 'REDUNDANT_DUPLICATE';
  const fa = a.experienceFacet;const fb = b.experienceFacet;
  if (!fa || !fb || fa.kind === fb.kind && fa.subject === fb.subject) return 'REDUNDANT_DUPLICATE';
  const pa = structuredDaypart(a);const pb = structuredDaypart(b);
  if (sameDay && adjacent && pa && pa === pb) {
    const minute = stop => { const m = /^(\d{1,2}):(\d{2})$/.exec(stop.startTime || ''); return m ? Number(m[1])*60+Number(m[2]) : null; };
    const startA=minute(a);const startB=minute(b);
    if(startA != null && startB != null && (startB < startA || startB > startA+Number(a.duration || 0))) return 'DISTINCT_REVISIT';
    return 'COMPOUND_SAME_VISIT';
  }
  if (!sameDay || pa && pb && pa !== pb) return 'DISTINCT_REVISIT';
  return 'REDUNDANT_DUPLICATE';
}
function normalizeCompoundVisits({ itineraryData, bundle, touchedDayNumbers = null }) {
  const changedDays = [];const relationships = [];
  const days = (itineraryData?.days || []).map((day,index) => {
    const number = Number(day.dayNumber || day.day || index+1);
    if (touchedDayNumbers && !touchedDayNumbers.includes(number)) return day;
    const merged=[];const redirect=new Map();
    for(const original of day.stops || []) {
      const facet=groundedVisitFacet(original,evidenceForStop(original,bundle));
      const stop={...original,experienceFacet:facet};
      const left=merged[merged.length-1];
      const relation=left && sameAnchorRelationship(left,stop);
      if(relation)relationships.push({dayNumber:number,relationship:relation});
      if(relation !== 'COMPOUND_SAME_VISIT' || left.compoundVisit || !(left.duration > 0 && stop.duration > 0)) {merged.push(stop);continue;}
      const facets=[left,stop].map(s=>({sourceStopId:s.id || null,name:s.name,type:s.type,duration:s.duration,note:s.note || '',why:s.why || '',...s.experienceFacet}));
      const clock = s => /^(\d{1,2}):(\d{2})$/.exec(s.startTime || '');
      const ca=clock(left);const cb=clock(stop);
      let duration=Number(left.duration)+Number(stop.duration);
      if(ca && cb) {
        const a=Number(ca[1])*60+Number(ca[2]);const b=Number(cb[1])*60+Number(cb[2]);
        duration -= Math.max(0,Math.min(a+Number(left.duration),b+Number(stop.duration))-Math.max(a,b));
      }
      const combined={...left,duration,
        note:[left.note,stop.note].filter(Boolean).join('\n'),
        compoundVisit:{facets,distinctExperienceCount:1},experienceFacet:null};
      merged[merged.length-1]=combined;if(stop.id)redirect.set(stop.id,left.id);
      if(!changedDays.includes(number))changedDays.push(number);
    }
    if(!redirect.size && !changedDays.includes(number))return {...day,stops:merged};
    const edges=(day.travelEdges || []).map(e=>({...e,sourceStopId:redirect.get(e.sourceStopId)||e.sourceStopId,targetStopId:redirect.get(e.targetStopId)||e.targetStopId}))
      .filter(e=>e.sourceStopId!==e.targetStopId);
    return {...day,stops:merged,...(day.travelEdges?{travelEdges:edges}:{})};
  });
  return {itineraryData:{...itineraryData,days},changedDays,relationships};
}

function areaActionability(stop, bundle) {
  // A picnic/parking/rest area is a supporting facility, not a geographic outing.
  const supportingFacility = /\b(?:picnic|parking|rest) area\b/i.test(stop.name || '');
  if (supportingFacility) return { applicable: false, actionable: true };
  const records = evidenceForStop(stop, bundle);
  const grounding = require('./experienceActionability').assessExecutionGrounding({
    records, name: stop.canonicalPlaceName || stop.name, modelType: stop.type, modelDuration: stop.duration,
  });
  const namedBroad = ['area', 'region'].includes(grounding.experienceKind) || Boolean(stop.areaExperienceName);
  const modelOuting = require('./experienceActionability').OUTING_TYPES.has(String(stop.type || '').toLowerCase());
  const facilityLabel = /\b(visitor center|nature center|lodge|picnic|campground)\b/i.test(stop.name || '');
  // A facility label does not erase an explicit areaExperienceName claim.
  if (facilityLabel && !modelOuting && !stop.areaExperienceName) {
    return { applicable: false, actionable: true };
  }
  const broadClaim = namedBroad || grounding.broadEntity;
  // A model outing label does not turn a broad place into a walk.
  if (modelOuting && broadClaim && !grounding.walkable) {
    return { applicable: true, actionable: false, canonicalAnchor: stop.canonicalPlaceName || stop.name,
      experienceType: stop.type, duration: stop.duration, travelerAction: null, locationScope: null,
      executionEvidence: null, conditionalDependencies: [], reasonCode: 'experience_not_actionable' };
  }
  const typeIsArea = /^(area|region|district)$/i.test(String(stop.type || ''));
  const landmarkArea = /^(landmark|activity)$/i.test(String(stop.type || '')) && namedBroad;
  const area = stop.areaExperienceName || ((typeIsArea || landmarkArea || (modelOuting && broadClaim && grounding.walkable))
    ? (stop.canonicalPlaceName || stop.name) : null);
  if (!area) return { applicable: false, actionable: true };
  const planned=String(stop.note || '');
  let execution=null;
  for(const row of records) {
    const v=row.claim?.normalizedValue || {};
    const specification=v.experienceExecution || v.execution;
    if(specification?.action && specification?.scope && key(planned).includes(key(specification.action)) && key(planned).includes(key(specification.scope))) {
      execution={travelerAction:specification.action,scope:specification.scope,evidenceRef:row.evidenceId};break;
    }
    const text=`${row.claim?.text || ''} ${v.description || ''}`;
    const action=planned.match(/\b(walk|drive|cycle|paddle|view|watch|explore)\b/i)?.[1]?.toLowerCase();
    const definedScope=v.routeName || v.walkingArea || v.viewingZone || v.shoreSection || v.boundaries;
    const groundedPattern=/\b(marked (?:loop|route)|scenic loop|walkable (?:historic )?district|defined (?:beach|shore|wildlife)|viewing corridor)\b/i.test(text);
    const scopedPlan = definedScope ? key(planned).includes(key(String(definedScope))) : groundedPattern && /\b(marked (?:loop|route)|scenic loop|walkable (?:historic )?district|defined (?:beach|shore|wildlife)|viewing corridor)\b/i.test(planned);
    if(action && scopedPlan && /\b(walk\w*|driv\w*|cycl\w*|paddl\w*|view\w*|watch\w*|explor\w*)\b/i.test(text)) {
      execution={travelerAction:action,scope:definedScope || area,evidenceRef:row.evidenceId};break;
    }
  }
  const deferred=/\b(ask (?:a |the )?(?:ranger|someone|locally)|check locally|whatever works|where to go|no particular (?:trail|route|viewpoint))\b/i.test(planned);
  return {applicable:true,actionable:Boolean(execution)&&!deferred,canonicalAnchor:stop.canonicalPlaceName || area,
    experienceType:stop.type,duration:stop.duration,travelerAction:execution?.travelerAction || null,
    locationScope:execution?.scope || null,executionEvidence:execution?.evidenceRef || null,
    conditionalDependencies:records.flatMap(r => r.claim?.normalizedValue?.operationalFacts || []),
    reasonCode:execution&&!deferred?null:'experience_not_actionable'};
}
module.exports={groundedVisitFacet,sameAnchorRelationship,normalizeCompoundVisits,areaActionability};
