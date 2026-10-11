'use strict';
// Complete baseline for model-first integration fixtures. Individual coherence
// failures are tested separately in dayCompleteness.test.js.
const dayStructure = stops => ({ type: 'rest', startPeriod: 'morning', endPeriod: 'evening', summary: 'A short outing with a quiet afternoon.', blocks: [
 {kind:'outing',periods:['morning'],label:'Morning outing',note:'Take time at the viewpoints.',stopIds:stops.map(s=>s.id)},
 {kind:'downtime',periods:['midday','evening'],label:'Lunch and rest',note:'Lunch, a free afternoon and dinner.',stopIds:[]},
] });
const withDayStructure = plan => { for (const day of plan.days) { day.dayStructure=dayStructure(day.stops);for(const stop of day.stops) if(!stop.startTime)stop.timeWindow='Morning'; } return plan; };
module.exports={dayStructure,withDayStructure};
