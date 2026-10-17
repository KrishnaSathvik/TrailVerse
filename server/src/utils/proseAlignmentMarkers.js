'use strict';

/**
 * Stage 12 — internal Phase B alignment markers.
 *
 *   <!--TRAILIE_DAY:day-1-->
 *   <!--TRAILIE_STOP:stop-1-->
 *   <!--TRAILIE_INTRO-->        (optional leading introduction)
 *
 * Markers are INTERNAL verification metadata — never itinerary data, never shown
 * to the user, never hashed, never persisted, never in the review snapshot.
 */

const MARKER_RE = /<!--\s*TRAILIE_(DAY|STOP|INTRO)(?::([^>]*?))?\s*-->/gi;

/** Remove every alignment marker (and any stray marker-like comment). */
function stripAlignmentMarkers(text) {
  if (typeof text !== 'string') return '';
  return text.replace(MARKER_RE, '').replace(/[ \t]+\n/g, '\n');
}

/**
 * Parse the ordered marker structure. Groups stop markers under the day marker
 * that precedes them. Reports malformed structure (a stop before any day marker,
 * an unparseable marker id) without throwing.
 *
 * @returns {{intro: string|null, days: Array, markerSequence: Array,
 *   malformed: boolean, malformedReasons: string[]}}
 */
function parseAlignmentMarkers(text) {
  const src = typeof text === 'string' ? text : '';
  const tokens = [...src.matchAll(MARKER_RE)].map((match) => ({
    type: match[1].toLowerCase(),
    id: (match[2] || '').trim(),
    index: match.index,
    end: match.index + match[0].length,
  }));

  const markerSequence = tokens.map((t) => ({ type: t.type, id: t.id || null }));
  const malformedReasons = [];

  // Text slice belonging to a token = from its end to the next token (or EOF).
  const sliceAfter = (i) => {
    const start = tokens[i].end;
    const end = i + 1 < tokens.length ? tokens[i + 1].index : src.length;
    return src.slice(start, end);
  };

  let intro = null;
  const days = [];
  let currentDay = null;

  for (let i = 0; i < tokens.length; i += 1) {
    const t = tokens[i];
    if (t.type === 'intro') {
      intro = (intro || '') + sliceAfter(i);
      continue;
    }
    if (t.type === 'day') {
      if (!t.id) malformedReasons.push('day_marker_missing_id');
      currentDay = { dayId: t.id || null, text: sliceAfter(i), stops: [] };
      days.push(currentDay);
      continue;
    }
    if (t.type === 'stop') {
      if (!t.id) malformedReasons.push('stop_marker_missing_id');
      if (!currentDay) {
        malformedReasons.push('stop_before_day');
        continue;
      }
      currentDay.stops.push({ stopId: t.id || null, text: sliceAfter(i) });
    }
  }

  // Any prose before the first marker (that is not an intro) is a contract break
  // unless an intro marker is present.
  const firstMarkerIndex = tokens.length ? tokens[0].index : src.length;
  const preamble = src.slice(0, firstMarkerIndex).trim();
  if (preamble && !(tokens[0] && tokens[0].type === 'intro')) {
    malformedReasons.push('text_before_first_marker');
  }

  return {
    intro: intro != null ? intro.trim() : null,
    days,
    markerSequence,
    malformed: malformedReasons.length > 0,
    malformedReasons,
  };
}

module.exports = { MARKER_RE, stripAlignmentMarkers, parseAlignmentMarkers };
