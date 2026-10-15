'use strict';
const assert = require('assert/strict');

// Preview transport parser. Parse complete plan.days elements from a JSON prefix;
// quoted braces/escapes and nested objects cannot create false boundaries.
function completeDays(text) {
  let i = 0; const days = []; const incomplete = Symbol('incomplete');
  const ws = () => { while (/\s/.test(text[i] || '') && i < text.length) i++; };
  function string() {
    const start = i++;
    while (i < text.length) {
      if (text[i] === '\\') { i += 2; continue; }
      if (text[i++] === '"') return JSON.parse(text.slice(start, i));
    }
    throw incomplete;
  }
  function value(path) {
    assert(path.length <= 64, 'Preview nesting limit exceeded');
    ws(); const start = i, c = text[i];
    if (!c) throw incomplete;
    if (c === '"') return string();
    if (c === '{' || c === '[') {
      const object = c === '{', close = object ? '}' : ']'; i++; ws(); let index = 0;
      while (text[i] !== close) {
        let key = index++;
        if (object) {
          if (i >= text.length) throw incomplete;
          assert.equal(text[i], '"'); key = string(); ws();
          if (i >= text.length) throw incomplete;
          assert.equal(text[i++], ':');
        }
        value([...path, key]); ws();
        if (i >= text.length) throw incomplete;
        if (text[i] === close) break;
        assert.equal(text[i++], ','); ws();
      }
      i++;
      const parsed = JSON.parse(text.slice(start, i));
      if (object && path.length === 3 && path[0] === 'plan' && path[1] === 'days') days.push({index:path[2], end:i, day:parsed});
      return parsed;
    }
    while (i < text.length && !/[\s,}\]]/.test(text[i])) i++;
    if (i === text.length) throw incomplete;
    return JSON.parse(text.slice(start,i));
  }
  try { value([]); } catch (e) { if (e !== incomplete) throw e; }
  return days;
}

function createCollector({ onDay = () => {} } = {}) {
  const items = new Map(), dayTimes = []; let final = null, failed = false, seq = -1;
  const metrics = {firstEventMs:null,firstArgumentDeltaMs:null,firstTextDeltaMs:null,completedMs:null,dayTimes};
  return {
    metrics,
    push(event, ms) {
      if (Number.isInteger(event.sequence_number)) { assert(event.sequence_number > seq); seq=event.sequence_number; }
      if (metrics.firstEventMs === null) metrics.firstEventMs=ms;
      if (['error','response.failed','response.incomplete'].includes(event.type)) failed=true;
      if (event.type === 'response.output_item.added' && event.item?.type === 'function_call') {
        assert(!items.has(event.item.id)); items.set(event.item.id,{name:event.item.name,text:event.item.arguments || '',done:false,days:[]});
      }
      if (event.type === 'response.output_text.delta' && metrics.firstTextDeltaMs === null) metrics.firstTextDeltaMs=ms;
      if (event.type === 'response.function_call_arguments.delta') {
        if (metrics.firstArgumentDeltaMs === null) metrics.firstArgumentDeltaMs=ms;
        const item=items.get(event.item_id); assert(item && !item.done); item.text+=event.delta;
        assert(item.text.length <= 262144, 'Preview argument size limit exceeded');
        if(item.name==='propose_trip_update') for(const d of completeDays(item.text)) {
          if(item.days[d.index]) assert.deepStrictEqual(item.days[d.index],d.day);
          else {assert(d.index < 60, 'Preview day limit exceeded'); item.days[d.index]=d.day; onDay(d.day, d.index); dayTimes.push({itemId:event.item_id,index:d.index,dayNumber:d.day.dayNumber,ms,endOffset:d.end});}
        }
      }
      if (event.type === 'response.function_call_arguments.done') {
        const item=items.get(event.item_id); assert(item); assert.equal(item.text,event.arguments); item.done=true;
      }
      if (event.type === 'response.completed') { assert(!final); final=event.response; metrics.completedMs=ms; }
    },
    finish() {
      assert(!failed && final?.status === 'completed','Stream failed, incomplete, or interrupted; no proposal released');
      const calls=final.output.filter(x=>x.type==='function_call');
      assert.equal(calls.length,items.size);
      for(const call of calls) {
        const item=items.get(call.id); assert(item?.done); assert.equal(item.name,call.name); assert.equal(item.text,call.arguments);
        if(call.name==='propose_trip_update' && Array.isArray(JSON.parse(call.arguments).plan?.days)) assert.deepStrictEqual(item.days,JSON.parse(call.arguments).plan.days);
      }
      return final;
    },
  };
}
module.exports={completeDays,createCollector};
