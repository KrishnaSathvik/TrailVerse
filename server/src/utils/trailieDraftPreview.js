'use strict';

// Isolated prototype: impossible to activate in a production process.
function previewEnabled(req, env = process.env) {
  return env.NODE_ENV === 'development' && env.TRAILIE_DRAFT_PREVIEW === 'true'
    && req.get('x-trailie-draft-preview') === '1';
}
const text = (s, max) => typeof s === 'string' ? s.slice(0, max) : '';
function projectDraftDay(day, index) {
  if (!day || !Number.isInteger(index) || index < 0 || index >= 60
    || day.dayNumber !== index + 1 || !Array.isArray(day.stops)) return null;
  return { index, dayNumber: day.dayNumber, label: text(day.label, 160),
    summary: text(day.dayStructure?.summary, 600),
    activities: day.stops.slice(0, 50).map(s => ({ name: text(s.name, 160), note: text(s.note, 1000) })) };
}
module.exports = { previewEnabled, projectDraftDay };
