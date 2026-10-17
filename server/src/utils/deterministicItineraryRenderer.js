'use strict';

/**
 * Stage 12 — deterministic itinerary renderer.
 *
 * Model-free. Renders the FROZEN itinerary directly into user-visible prose when
 * both model prose attempts fail (or prose generation fails after Phase A). Uses
 * only frozen itinerary fields + deterministic canonical values; invents
 * nothing, omits unavailable values, and never lists removed stops.
 */

function minutesToLabel(min) {
  if (!Number.isFinite(min) || min <= 0) return null;
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

/**
 * @param {Object} params
 * @param {Object} params.itinerary
 * @param {Object[]} [params.feasibilityIssues] structured issues
 * @param {string[]} [params.corrections]
 * @param {Object} [params.resolvedMetadata]
 * @returns {string} canonical-ready prose
 */
function renderDeterministicItineraryResponse({
  itinerary,
  feasibilityIssues = [],
  corrections = [],
  resolvedMetadata = {},
} = {}) {
  const lines = [];
  const title = resolvedMetadata.parkName
    ? `Your ${resolvedMetadata.parkName} trip plan`
    : 'Your trip plan';
  lines.push(`## ${title}`, '');

  for (const day of itinerary?.days || []) {
    const heading = day.label || `Day ${day.dayNumber}`;
    lines.push(`### ${day.date ? `${heading} — ${day.date}` : heading}`, '');

    let n = 0;
    for (const stop of day.stops || []) {
      n += 1;
      lines.push(`${n}. **${stop.name}**`);
      const meta = [];
      if (stop.timeWindow || stop.startTime) meta.push(stop.timeWindow || stop.startTime);
      const dur = minutesToLabel(stop.duration);
      if (dur) meta.push(dur);
      if (stop.difficulty) meta.push(stop.difficulty);
      if (meta.length) lines.push(`   ${meta.join(' · ')}`);
      if (stop.note) lines.push(`   ${stop.note}`);
      const drive = minutesToLabel(stop.drivingTimeFromPreviousMin);
      if (drive && n > 1) lines.push(`   Drive: ${drive}`);
    }
    if (day.overnightLocation) lines.push('', `Overnight: ${day.overnightLocation}`);
    lines.push('');
  }

  if (corrections && corrections.length) {
    lines.push('---', '**Adjusted to fit your constraints:**');
    for (const c of corrections.slice(0, 6)) lines.push(`- ${c}`);
    lines.push('');
  }

  const warnings = (feasibilityIssues || []).filter((i) => i && i.severity !== 'info' && i.message);
  if (warnings.length) {
    lines.push('**Things to double-check**');
    for (const w of warnings) lines.push(`- ${w.message}`);
    lines.push('');
  }

  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

module.exports = { renderDeterministicItineraryResponse };
