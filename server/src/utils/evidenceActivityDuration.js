'use strict';
// Parse only explicit, unit-bearing source activity durations. These describe
// supported visit ranges, not opening hours or a guaranteed traveler pace.
function activityDurationRange(value) {
  if (typeof value !== 'string') return null;
  const match=value.trim().match(/^(\d+(?:\.\d+)?)\s*(?:(?:-|–|—|to)\s*(\d+(?:\.\d+)?))?\s*(hours?|hrs?|minutes?|mins?)$/i);
  if(!match)return null;
  const multiplier=/^h/i.test(match[3])?60:1;
  const minMinutes=Number(match[1])*multiplier;
  const maxMinutes=Number(match[2] || match[1])*multiplier;
  if(!(minMinutes>0 && maxMinutes>=minMinutes) || !Number.isInteger(minMinutes) || !Number.isInteger(maxMinutes))return null;
  return {minMinutes,maxMinutes,sourceText:value};
}
function supportedDurationMaximum(value={}) {
  const explicit=[value.groundedDurationMinutes,value.maxExperienceDurationMinutes,value.maxVisitDurationMinutes,value.durationMinutes].map(Number).filter(n=>Number.isFinite(n) && n>0);
  const range=activityDurationRange(value.duration);
  const supported=[...explicit,...(range?[range.maxMinutes]:[])];
  return supported.length ? Math.min(...supported) : null;
}
module.exports={activityDurationRange,supportedDurationMaximum};
