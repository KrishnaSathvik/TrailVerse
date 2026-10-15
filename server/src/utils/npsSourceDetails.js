'use strict';

// Preserve source meaning before budgets apply. These are complete source
// fields, not generated summaries or a keyword-selected set of safety excerpts.
const TEXT_FIELDS = Object.freeze(['longDescription', 'bodyText', 'shortDescription',
  'description', 'listingDescription', 'locationDescription', 'seasonDescription',
  'accessibilityInformation', 'accessibility', 'reservationDescription',
  'petsDescription', 'ageDescription', 'durationDescription', 'timeOfDayDescription',
  'feeDescription', 'activityDescription', 'audioDescription']);
const STRUCTURED_FIELDS = Object.freeze(['season', 'isReservationRequired',
  'arePetsPermitted', 'arePetsPermittedWithRestrictions', 'age', 'duration',
  'timeOfDay', 'doFeesApply', 'isOpenToPublic']);

function sourceText(value) {
  return String(value || '')
    .replace(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, '$2 [$1]')
    .replace(/<br\s*\/?>|<\/(?:p|li|div|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, ' ').replace(/&nbsp;|\u00a0/g, ' ')
    .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .split('\n').map(s => s.replace(/\s+/g, ' ').trim()).filter(Boolean).join('\n');
}

function npsSourceDetails(item = {}) {
  const details = {};
  for (const field of TEXT_FIELDS) if (typeof item[field] === 'string' && item[field].trim()) {
    details[field] = sourceText(item[field]);
  }
  for (const field of STRUCTURED_FIELDS) if (item[field] != null && item[field] !== ''
    && (!Array.isArray(item[field]) || item[field].length)) details[field] = structuredClone(item[field]);
  return details;
}

// Only unqualified, present-tense closure statements about this record become
// blocking facts. Seasonal/conditional/history/other-place statements remain
// intact in sourceDetails; they never become an invented current status.
function explicitCurrentClosure(item = {}) {
  const name = item.title || item.name;
  if (!name) return null;
  const escape = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const trail = /\b(?:trail|hike|walk)\b/i.test(name)
    || (item.activities || []).some(a => /hiking/i.test(a.name || ''));
  const road = /\broad\b/i.test(name);
  const ownSubject = `${escape(name)}${trail ? '|trail|path' : ''}${road ? '|road' : ''}`;
  for (const field of TEXT_FIELDS) {
    if (!item[field]) continue;
    for (const sentence of sourceText(item[field]).split(/\n|(?<=[.!?])\s+/)) {
      const subject = field === 'locationDescription' ? `${ownSubject}|area` : ownSubject;
      const pattern = new RegExp(`^(?:(?:the|this)\\s+)?(?:${subject})\\s+(?:(?:is|remains)\\s+)?(?:currently\\s+)?closed(?:[.!]|\\s+(?:due to|because of|following|until further notice)\\b.*)?$`, 'i');
      if (!pattern.test(sentence) || /\b(?:was|were|will|may|might|could|would|if|when|during|seasonally|winter|summer|previously|formerly|reopened|20\d{2})\b/i.test(sentence)) continue;
      return { field, excerpt: sentence, type: road ? 'road_closed' : trail ? 'trail_closed' : 'access_uncertain' };
    }
  }
  return null;
}

module.exports = { TEXT_FIELDS, npsSourceDetails, sourceText, explicitCurrentClosure };
