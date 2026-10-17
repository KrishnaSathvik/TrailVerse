'use strict';

/**
 * Stage 13.7 §7 — offline replay of the Stage 13.6 representative probes.
 *
 * Compares the OLD context-blind detection (any difficulty word; the first time
 * expression in the segment) against the corrected context-aware detectors, and
 * reports before/after issue codes. Pure and model-free — makes ZERO provider
 * calls. Run: `node src/eval/trailie/stage13_7ProbeReplay.js` from server/.
 */

const {
  DIFFICULTY_SYNONYMS,
  parseDurationToMinutes,
  detectActivityDifficulty,
  detectActivityDuration,
} = require('../../utils/proseTextNormalize');

// The representative probes named in the Stage 13.7 spec (plus the negative
// examples the detectors must not regress on). Each carries the stop ground
// truth it is evaluated against.
const PROBES = [
  { text: 'Permits can be difficult to obtain.', difficulty: 'easy', note: 'permits — must NOT be a difficulty conflict' },
  { text: 'Parking is hard to find.', difficulty: 'easy', note: 'parking — must NOT be a difficulty conflict' },
  { text: 'It may be challenging to arrive before sunrise.', difficulty: 'easy', note: 'arrival — must NOT be a difficulty conflict' },
  { text: 'This is a challenging hike.', difficulty: 'easy', note: 'challenging hike — context-bound difficulty' },
  { text: 'The trail is strenuous.', difficulty: 'moderate', note: 'strenuous trail — real conflict' },
  { text: 'The shuttle runs every 15 minutes.', duration: 120, note: 'frequency — must NOT be an activity-duration conflict' },
  { text: 'Arrive 30 minutes early.', duration: 120, note: 'offset — must NOT be an activity-duration conflict' },
  { text: 'The drive is 45 minutes.', duration: 120, note: 'drive — must NOT be an activity-duration conflict' },
  { text: 'Spend 4 hours at this stop.', duration: 240, note: 'spend 4 hours — context-bound duration (matches 240)' },
  { text: 'The hike takes 3 hours.', duration: 30, note: 'takes 3 hours — real conflict vs 30m' },
];

// --- OLD (Stage 12) context-blind detection, reproduced for the "before" column.
function oldDifficultyConflict(seg, stopDifficulty) {
  if (!stopDifficulty) return null;
  const s = seg.toLowerCase();
  const claimed = Object.keys(DIFFICULTY_SYNONYMS).find((w) => new RegExp(`\\b${w}\\b`).test(s));
  if (claimed && DIFFICULTY_SYNONYMS[claimed] !== stopDifficulty) return DIFFICULTY_SYNONYMS[claimed];
  return null;
}
function oldDurationConflict(seg, stopDuration) {
  if (!Number.isFinite(stopDuration) || stopDuration <= 0) return null;
  const claimed = parseDurationToMinutes(seg.toLowerCase());
  if (claimed == null) return null;
  const tol = Math.max(20, stopDuration * 0.3);
  return Math.abs(claimed - stopDuration) > tol ? claimed : null;
}

// --- NEW context-aware detection.
function newCodes(probe) {
  const codes = [];
  if (probe.difficulty) {
    const d = detectActivityDifficulty(probe.text);
    if (d.difficulty && d.difficulty !== probe.difficulty) codes.push('conflicting_difficulty');
    else if (!d.difficulty && d.ambiguous) codes.push('ambiguous_difficulty_context');
  }
  if (probe.duration) {
    const du = detectActivityDuration(probe.text);
    if (du.minutes != null) {
      const tol = Math.max(20, probe.duration * 0.3);
      if (Math.abs(du.minutes - probe.duration) > tol) codes.push('conflicting_duration');
    } else if (du.ambiguous) codes.push('ambiguous_duration_context');
  }
  return codes;
}
function oldCodes(probe) {
  const codes = [];
  if (probe.difficulty && oldDifficultyConflict(probe.text, probe.difficulty) != null) codes.push('conflicting_difficulty');
  if (probe.duration && oldDurationConflict(probe.text, probe.duration) != null) codes.push('conflicting_duration');
  return codes;
}

function replay() {
  return PROBES.map((p) => ({
    text: p.text,
    note: p.note,
    before: oldCodes(p),
    after: newCodes(p),
  }));
}

if (require.main === module) {
  const rows = replay();
  /* eslint-disable no-console */
  console.log('Stage 13.7 §7 — representative probe replay (offline, zero provider calls)\n');
  for (const r of rows) {
    console.log(`• ${r.text}`);
    console.log(`    ${r.note}`);
    console.log(`    before: [${r.before.join(', ') || 'none'}]   after: [${r.after.join(', ') || 'none'}]`);
  }
  const fixedFalsePositives = rows.filter((r) => r.before.some((c) => c.startsWith('conflicting_')) && !r.after.some((c) => c.startsWith('conflicting_')));
  console.log(`\nFalse positives removed: ${fixedFalsePositives.length}`);
  /* eslint-enable no-console */
}

module.exports = { PROBES, replay, oldCodes, newCodes };
