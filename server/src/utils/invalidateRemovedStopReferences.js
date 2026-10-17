'use strict';

const key = v => String(v || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const stopsOf = plan => (plan?.days || []).flatMap(d => d.stops || []);

/** Invalidate derived references against this accepted revision, not chat history. */
function invalidateRemovedStopReferences({ priorPlan, itineraryData, text = '' }) {
  if (!priorPlan || !itineraryData) return { itineraryData, text };
  const current = stopsOf(itineraryData);
  const names = new Set(current.flatMap(s => [key(s.name), key(s.canonicalPlaceName)]).filter(Boolean));
  const ids = new Set(current.map(s => s.id).filter(Boolean));
  const removed = stopsOf(priorPlan).filter(s => !names.has(key(s.name)) && !names.has(key(s.canonicalPlaceName)));
  const removedNames = removed.flatMap(s => [key(s.name), key(s.canonicalPlaceName)]).filter(n => n.length > 3);
  const removedIds = new Set(removed.map(s => s.id).filter(id => id && !ids.has(id)));
  const stale = value => {
    if (typeof value !== 'string') return false;
    if (removedIds.has(value)) return true;
    let normalized = ` ${key(value)} `;
    // A retained distinct child place can contain its former parent's name.
    for (const name of [...names].sort((a,b) => b.length - a.length)) {
      normalized = normalized.split(` ${name} `).join(' ');
    }
    return removedNames.some(n => normalized.includes(` ${n} `));
  };
  if (!removed.length) return { itineraryData, text };
  function contains(value) {
    if (typeof value === 'string') return stale(value);
    return value && typeof value === 'object' && Object.values(value).some(contains);
  }
  function clean(value) {
    if (Array.isArray(value)) return value.filter(v => !contains(v)).map(clean);
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value)
      .filter(([,v]) => typeof v !== 'string' || !stale(v)).map(([k,v]) => [k,clean(v)]));
    return value;
  }
  // Keep accepted structural stops. Only their derived fields are invalidated.
  const { days, ...derived } = itineraryData;
  const result = clean(derived);
  result.days = days.map(day => {
    if (!contains(day)) return day;
    const { stops, ...dayDerived } = day;
    return { ...clean(dayDerived), stops: stops.map(stop => {
      if (!contains(stop)) return stop;
      const { id, name, canonicalPlaceName, type, ...stopDerived } = stop;
      return { ...clean(stopDerived), id, name, type, ...(canonicalPlaceName ? { canonicalPlaceName } : {}) };
    }) };
  });
  const summary = result.days.map((d,i) => `Day ${d.dayNumber || i+1}: ${d.stops.map(s => s.name).join('; ')}.`).join('\n\n');
  if (!result.intro) result.intro = summary;
  return { itineraryData: result, text: stale(text) ? summary : text };
}

module.exports = { invalidateRemovedStopReferences };
