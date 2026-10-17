'use strict';

const normalize = (value) => String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

function planSummary(itineraryData) {
  return (itineraryData?.days || []).map((day, index) =>
    `Day ${day.dayNumber || index + 1}: ${(day.stops || []).map((stop) => stop.displayName || stop.name).filter(Boolean).join('; ')}.`
  ).join('\n\n');
}

/**
 * Rebuild only narration when it introduces an activity outside the plan.
 * Never mutate the canonical itinerary to make prose true.
 * When changedDays is explicitly empty, reject rewritten-itinerary narration.
 */
function reconcileCanonicalNarrative({
  itineraryData,
  text = '',
  evidenceBundle = null,
  changedDays = null,
  afterRepair = false,
} = {}) {
  const stops = (itineraryData?.days || []).flatMap((day) => day.stops || []);
  const accepted = new Set(stops.flatMap((stop) => [
    normalize(stop.name),
    normalize(stop.displayName),
    normalize(stop.canonicalPlaceName),
  ]).filter(Boolean));
  const prose = [text, itineraryData?.intro, ...(itineraryData?.narrativeSections || []).map((s) => s.markdown)].join(' ');
  const normalized = ` ${normalize(prose)} `;
  const mentions = (evidenceBundle?.evidence || [])
    .filter((row) => ['activities', 'visitor_services'].includes(row.topic))
    .map((row) => row?.claim?.normalizedValue?.name)
    .filter((name) => typeof name === 'string' && normalize(name).length > 5
      && normalized.includes(` ${normalize(name)} `) && !accepted.has(normalize(name)));
  const planText = stops.map((stop) => `${stop.name || ''} ${stop.displayName || ''} ${stop.type || ''} ${stop.note || ''} ${stop.why || ''}`).join(' ');
  const unsupportedActivity = ['waterfall', 'overlook', 'hike'].some((word) =>
    new RegExp(`\\b${word}s?\\b`, 'i').test(prose) && !new RegExp(`\\b${word}s?\\b`, 'i').test(planText));

  const emptyChangeClaim = Array.isArray(changedDays)
    && changedDays.length === 0
    && /\b(?:rewrote|rebuilt|redesigned|new (?:itinerary|plan)|updated (?:the )?(?:whole|entire) (?:trip|itinerary))\b/i.test(prose);

  if (!afterRepair && !mentions.length && !unsupportedActivity && !emptyChangeClaim) {
    return { itineraryData, text, regenerated: false };
  }
  const summary = planSummary(itineraryData);
  return {
    itineraryData: { ...itineraryData, intro: summary, narrativeSections: [],
      days: (itineraryData?.days || []).map((day, index) => afterRepair
        && (!changedDays || changedDays.includes(Number(day.dayNumber || day.day || index + 1)))
        ? { ...day, label: (day.stops || []).map(s => s.displayName || s.name).filter(Boolean).join(' · '), title: '', notes: '' }
        : day),
    },
    text: summary,
    regenerated: true,
  };
}

module.exports = { reconcileCanonicalNarrative };
