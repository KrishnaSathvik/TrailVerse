'use strict';
const fs=require('fs');const path=require('path');const crypto=require('crypto');
const {parseConstraints}=require('../constraintEngine');
const {emptyPlanningState,planningStateToConstraintSeed,planningStateToTripStateLayer,normalizePersistedPlanningState}=require('../planningState');
const {parseTripDatesFromMessage,resolveAstroWindow}=require('../tripDateParser');
const {resolveRefinementScope}=require('../refinementScope');
const {assertTemporalConsistency}=require('../temporalState');
const reference=new Date('2026-09-25T12:00:00');
const base=()=>({...emptyPlanningState(),dates:{startDate:null,endDate:null,durationDays:4}});
const turn=(text,state=base(),now=reference)=>parseConstraints({planningState:state},text,{now,sourceTurnId:'fixture-turn'});
const pending=()=>turn('September 12–17');
const priorPlan={days:Array.from({length:4},(_,i)=>({dayNumber:i+1,stops:[{id:`s${i}`,name:`Experience ${i}`,type:'walk',duration:120}]}))};
const scope=(state,extra={})=>resolveRefinementScope({text:'Simplify tomorrow.',priorPlan,tripStart:state.dates.startDate,planDayCalendarBindings:state.planDayCalendarBindings,now:reference,...extra});
test('A: same-month past range is pending, not a confirmed date',()=>{
 const c=pending();expect(c.dates).toMatchObject({start:null,end:null,numDays:4,tripWindowDays:null});
 expect(c.temporalResolution).toMatchObject({status:'pending_confirmation',action:'clarify_year',conversationalOnly:true});
 expect(c.planningState.pendingTemporalResolution).toMatchObject({candidateStartDate:'2027-09-12',candidateEndDate:'2027-09-17',yearSource:'inferred',sourceTurnId:'fixture-turn'});
});
test('B: future same-month range is unambiguous',()=>expect(turn('September 12–17',base(),new Date('2026-09-10T12:00:00')).dates).toMatchObject({start:'2026-09-12',end:'2026-09-17',numDays:4,tripWindowDays:6}));
test('C: future month does not require confirmation',()=>expect(turn('October 10–14').dates.start).toBe('2026-10-10'));
test('D: past-month range follows the same pending policy',()=>expect(turn('August 10–14').planningState.pendingTemporalResolution.candidateStartDate).toBe('2027-08-10'));
test('E: explicit past year is preserved, not rolled forward',()=>expect(turn('September 12–17, 2026').dates.start).toBe('2026-09-12'));
test('F: matching year confirmation promotes atomically with provenance',()=>{
 const c=turn('Yes, 2027.',pending().planningState);expect(c.dates).toMatchObject({start:'2027-09-12',end:'2027-09-17'});
 expect(c.planningState.pendingTemporalResolution).toBeNull();expect(c.planningState.temporalProvenance.source).toBe('confirmed_in_followup');
});
test.each(['No, 2028.','No, I meant September 12–17, 2028.'])('G: correction supersedes pending: %s',text=>{
 const c=turn(text,pending().planningState);expect(c.dates.start).toBe('2028-09-12');expect(c.planningState.pendingTemporalResolution).toBeNull();
});
test.each(['No.',"No, those dates aren't right."])('H: rejection preserves previous confirmed dates: %s',text=>{
 const old=turn('October 10–14, 2026').planningState;const p=turn('September 12–17',old).planningState;
 const c=turn(text,p);expect(c.dates.start).toBe('2026-10-10');expect(c.planningState.pendingTemporalResolution).toBeNull();
});
test('I: pending cannot project to weather, seasonality, or trip-state dates',()=>{
 const c=pending();expect(planningStateToConstraintSeed(c.planningState).startDate).toBeNull();
 expect(planningStateToTripStateLayer(c.planningState).dates.startDate).toBeNull();
 expect(resolveAstroWindow(null,'September 12–17',reference)).toBeNull();
});
test('J/K: six-day window does not stretch a four-day plan or bind its calendar',()=>{
 const before=JSON.stringify(priorPlan);const c=turn('Yes, 2027.',pending().planningState);
 expect(c.dates).toMatchObject({tripWindowDays:6,numDays:4});expect(c.planningState.dates.durationDays).toBe(4);
 expect(c.planningState.planDayCalendarBindings).toEqual([]);expect(JSON.stringify(priorPlan)).toBe(before);
});
test('L: tomorrow cannot resolve against pending dates',()=>expect(scope(pending().planningState).resolved).toBe(false));
test('M: confirmed window alone cannot bind tomorrow',()=>{
 const c=turn('September 25–30, 2026');expect(scope(c.planningState).resolved).toBe(false);
 const binding=[{dayNumber:3,date:'2026-09-26',confirmed:true}];
 expect(scope(c.planningState,{planDayCalendarBindings:binding})).toMatchObject({resolved:true,dayNumber:3});
});
test('N: unrelated exposure preference preserves unresolved temporal state',()=>{
 const c=turn("I don't like exposed hikes.",pending().planningState);
 expect(c.planningState.preferences.avoidExposure).toBe(true);expect(c.planningState.pendingTemporalResolution).not.toBeNull();expect(c.dates.start).toBeNull();
});
test('confirmed window and itinerary count remain independent without an existing count',()=>{
 const c=turn('October 10–14, 2026',emptyPlanningState());expect(c.dates.tripWindowDays).toBe(5);expect(c.dates.numDays).toBeNull();
});
test('model prose cannot confirm: projecting or normalizing pending never promotes it',()=>{
 const s=pending().planningState;expect(normalizePersistedPlanningState({...s,lastAssistantText:'Confirmed for 2027.'}).state.dates.startDate).toBeNull();
});
test('consistency invariant rejects candidate leakage at state and constraint boundaries',()=>{
 const s=pending().planningState;expect(()=>assertTemporalConsistency(s,{start:s.pendingTemporalResolution.candidateStartDate})).toThrow(expect.objectContaining({code:'temporal_state_confirmation_conflict'}));
 expect(()=>planningStateToConstraintSeed({...s,dates:{...s.dates,startDate:s.pendingTemporalResolution.candidateStartDate}})).toThrow();
});
test('ISO explicit range supersedes pending; previous confirmed day bindings are invalidated',()=>{
 const c=turn('2028-10-10 to 2028-10-14',{...pending().planningState,planDayCalendarBindings:[{dayNumber:1,date:'2026-10-10',confirmed:true}]});
 expect(c.dates.start).toBe('2028-10-10');expect(c.planningState.pendingTemporalResolution).toBeNull();expect(c.planningState.planDayCalendarBindings).toEqual([]);
});
test('candidate is not inferred from an unrelated year or affirmative sentence',()=>{
 for(const text of ['Yes, sunrise photography matters.','I visited in 2028.'])expect(turn(text,pending().planningState).planningState.pendingTemporalResolution).not.toBeNull();
});
test('captured Turn 1 static replay and confirmation preserve canonical/day hashes',()=>{
 const root=path.resolve(__dirname,'../../../../artifacts');const capture=JSON.parse(fs.readFileSync(path.join(root,'trailie-zion-continuity-2026-09-25/turn-1-capture.json')));
 const state=capture.before.planningState;const plan=[...capture.before.messages].reverse().find(m=>m.canonicalPlan).canonicalPlan;
 const hash=v=>crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');const before=hash(plan),dayHashes=plan.days.map(hash);
 const first=turn(capture.prompt,state,reference);const second=turn('Yes, 2027.',first.planningState,reference);
 expect(first.dates.start).toBeNull();expect(second.dates.tripWindowDays).toBe(6);expect(second.dates.numDays).toBe(plan.days.length);
 expect(hash(plan)).toBe(before);expect(plan.days.map(hash)).toEqual(dayHashes);
 const report={providerCalls:0,referenceDate:'2026-09-25',first:{decision:first.temporalResolution.action,confirmedDates:first.dates,pending:first.planningState.pendingTemporalResolution,canonicalChanged:false,dayHashesChanged:false,planDayCount:plan.days.length},confirmation:{confirmedDates:second.dates,pending:second.planningState.pendingTemporalResolution,planDayCount:plan.days.length,calendarBindings:second.planningState.planDayCalendarBindings,canonicalChanged:false},beforeHash:before,afterHash:hash(plan),dayHashes};
 const out=path.join(root,'trailie-temporal-continuity-offline-2026-09-25');fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'captured-replay.json'),JSON.stringify(report,null,2)+'\n');
});
test('assistant history and stale summary dates cannot leak into runtime trip state',()=>{
 const c=pending();const {buildTripState}=require('../tripStateBuilder');
 const state=buildTripState({constraints:c,lastUserMessage:'September 12–17',metadata:{planningState:c.planningState},conversationSummary:{dates:{startDate:'2027-09-12',endDate:'2027-09-17'}}});
 expect(state.dates.startDate).toBeNull();expect(state.dates.endDate).toBeNull();expect(state.durationDays).toBe(4);
});
test.each(['September 12–17','Yes, 2027.'])('temporal turn %s reaches model as semantic context with zero retrieval and no mutation',async text=>{
 const {executeTrailieTurn}=require('../../services/trailieExecutionService');
 const c=text.startsWith('Yes')?turn(text,pending().planningState):pending();const planRequirements=jest.fn(()=>{throw new Error('retrieval_not_allowed');});
 const resolveEvidence=jest.fn(()=>{throw new Error('retrieval_not_allowed');});const seen=[];
 const result=await executeTrailieTurn({userMessage:text,constraints:c,planningState:c.planningState,
   tripState:{existingCanonicalPlan:priorPlan},conversationContext:{history:[]},metadata:{},resolvedContext:{}},{
   enabled:true,streamGeneration:false,responseAdapters:{},resolveDeterministicRender:()=>({eligible:false}),
   classifyIntent:()=>({version:'trailie-intent-v2.0.0',source:'deterministic',primaryIntent:'general_qa',verticals:[],depth:'quick',freshness:'stable',scope:'single_destination',entities:[],confidence:1,reasonCodes:[],structurePolicy:'optional',travelerJob:'general_advice'}),
   planRequirements,resolveEvidence,executeResponses:async request=>{seen.push(request);return {text:'Which year did you intend?',outputText:'Which year did you intend?',toolCalls:[],completionStatus:'complete',stopReason:'stop',usage:{inputTokens:10,outputTokens:10}};},
 });
 expect(planRequirements).not.toHaveBeenCalled();expect(resolveEvidence).not.toHaveBeenCalled();
 expect(result.status).toBe('complete');expect(result.canonicalPlan).toBeNull();
 expect(result.telemetrySummary.temporalResolutionStatus).toBe(c.temporalResolution.status);
 expect(JSON.stringify(seen)).toContain(c.temporalResolution.status);expect(JSON.stringify(seen)).toContain('2027-09-12');
 expect(seen).toHaveLength(1);expect(c.planningState.dates.startDate).toBe(text.startsWith('Yes')?'2027-09-12':null);
});
test('runtime rejects contaminated confirmed constraints before retrieval or dispatch',async()=>{
 const {executeTrailieTurn}=require('../../services/trailieExecutionService');const c=pending();
 c.dates.start=c.planningState.pendingTemporalResolution.candidateStartDate;
 const executeResponses=jest.fn();const resolveEvidence=jest.fn();
 const r=await executeTrailieTurn({userMessage:'September 12–17',constraints:c,planningState:c.planningState,metadata:{},conversationContext:{history:[]}},
 {enabled:true,streamGeneration:false,executeResponses,resolveEvidence});
 expect(r.status).toBe('failed');expect(r.terminalReason).toBe('temporal_state_confirmation_conflict');
 expect(executeResponses).not.toHaveBeenCalled();expect(resolveEvidence).not.toHaveBeenCalled();
});

test('tomorrow uses the local calendar and requires a unique confirmed day',()=>{
 const state=turn('September 25–30, 2026').planningState;
 const binding={dayNumber:3,date:'2026-09-26',confirmed:true};
 expect(scope(state,{now:new Date(2026,8,25,23,30),planDayCalendarBindings:[binding]})).toMatchObject({resolved:true,dayNumber:3});
 expect(scope(state,{planDayCalendarBindings:[binding,{...binding,dayNumber:4}]}).resolved).toBe(false);
});
