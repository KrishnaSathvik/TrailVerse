'use strict';

/**
 * SHADOW STREAM STRUCTURE TRACKER — measurement only.
 *
 * The 2026-08-27 first-artifact-byte run established the shape of the model
 * window:
 *
 *   0 ──► 2,459 ms   stream opens
 *   2,459 ──► 9,424  no tool bytes at all
 *   9,424 ──► 28,122 continuous itinerary streaming (1,440 deltas, ~98 tok/s)
 *   28,122 ──► 28,322 completion
 *
 * 18.7 seconds of continuous construction is a lot of potentially usable work,
 * and nothing currently knows WHEN inside it a structural unit first exists.
 * This answers exactly that one question:
 *
 *     when does Day 1 actually exist?
 *
 * ── WHAT THIS IS NOT ────────────────────────────────────────────────────────
 *
 * It is NOT a parser whose output anyone consumes. It never produces plan data.
 * It never persists. It never reaches the browser. It never calls a validator.
 * A completed streamed day is NOT canonical and NOT validated — whole-plan
 * completeness, cross-day pacing, traveler fit, requested-experience coverage
 * and later repair can all still reject it. This module answers "when does
 * structure become available", never "can we show it".
 *
 * ── WHY POSITIONAL, NOT SEMANTIC ────────────────────────────────────────────
 *
 * Milestones carry ordinals, timestamps and byte offsets — never names, notes,
 * labels or any other value. Values are SKIPPED, not buffered: the scanner
 * reads string values only far enough to find their closing quote. The only
 * text it ever retains is the current object KEY (schema field names like
 * `days`/`stops`), in a hard-capped buffer. There is no code path by which a
 * traveler-visible string can enter a milestone.
 *
 * ── WHY PATH-AWARE, NOT DEPTH-AWARE ─────────────────────────────────────────
 *
 * `days[].stops[].alternatives[]` and plan-level `alternatives[]` and
 * `narrativeSections[]` are all arrays of objects. A depth counter would report
 * a stop's alternative as a stop and a narrative section as a day. Milestones
 * are therefore matched on the exact container path, not on nesting depth.
 */

/** Milestone kinds. Fixed vocabulary — nothing else may be recorded. */
const MILESTONE = Object.freeze({
  FIRST_BYTE: 'first_tool_byte',
  OPENING_BRACE: 'first_opening_brace',
  SECTION_START: 'section_start',
  STOP_COMPLETE: 'stop_complete',
  DAY_COMPLETE: 'day_complete',
  ALL_DAYS_COMPLETE: 'all_days_structurally_complete',
  TOOL_COMPLETE: 'tool_complete',
});

/**
 * Hard caps. A pathological artifact must not turn telemetry into a transcript
 * of its own size, and a malformed stream must not grow memory without bound.
 */
/**
 * TOP-LEVEL SECTIONS, ALLOWLISTED.
 *
 * JSON property order is model-controlled, so where `days` begins relative to
 * `intro` and the other plan-level fields is an observation worth having: if the
 * prose sections eat a large share of the stream before any day starts, that
 * matters later. These are SCHEMA FIELD NAMES, never values, and anything not on
 * this list is not recorded at all.
 *
 * Observation only. Nothing here proposes reordering the schema.
 */
const TOP_LEVEL_SECTIONS = Object.freeze(new Set([
  'intro', 'narrativeSections', 'days', 'alternatives',
]));

const MAX_MILESTONES = 128;
const MAX_KEY_CHARS = 64;
const MAX_DEPTH = 64;

/**
 * @param {Object} p
 * @param {number|null} p.dispatchStartedAtMs  origin for relative timestamps
 */
function createShadowStructureTracker({ dispatchStartedAtMs = null, maxMilestones = MAX_MILESTONES } = {}) {
  const started = Number.isFinite(dispatchStartedAtMs) ? dispatchStartedAtMs : null;

  const milestones = [];
  let truncated = false;
  let bytes = 0;
  let sawFirstByte = false;
  let sawOpeningBrace = false;
  let malformed = null;

  // Scanner state. Persists across consume() calls, so a chunk may split
  // anywhere — mid-key, mid-string, mid-escape sequence.
  const stack = [];
  let inString = false;
  let escaped = false;
  let expectKey = false;
  let keyBuffer = '';
  let keyTruncated = false;
  let pendingKey = null;
  const sectionsSeen = new Set();

  const record = (kind, detail, atMs) => {
    if (milestones.length >= maxMilestones) { truncated = true; return; }
    milestones.push(Object.freeze({
      kind,
      tMs: started == null ? null : Math.max(0, atMs - started),
      byteOffset: bytes,
      ...(detail || {}),
    }));
  };

  /**
   * Which structural unit, if any, does the container currently on top of the
   * stack represent? Matched on the exact path from the root.
   *
   *   [root]                                             -> the artifact
   *   [root, days(array), obj]                           -> a day
   *   [root, days(array), obj, stops(array), obj]        -> a stop
   */
  const unitForClosingFrame = () => {
    const top = stack[stack.length - 1];
    if (!top) return null;
    if (top.type === 'object' && stack.length === 1) return { kind: MILESTONE.TOOL_COMPLETE };
    if (top.type === 'array' && stack.length === 2 && stack[1].key === 'days') {
      return { kind: MILESTONE.ALL_DAYS_COMPLETE, detail: { dayCount: top.childObjectCount } };
    }
    if (top.type === 'object' && stack.length === 3
      && stack[1].type === 'array' && stack[1].key === 'days') {
      return { kind: MILESTONE.DAY_COMPLETE, detail: { dayOrdinal: top.ordinal } };
    }
    if (top.type === 'object' && stack.length === 5
      && stack[1].type === 'array' && stack[1].key === 'days'
      && stack[3].type === 'array' && stack[3].key === 'stops') {
      return {
        kind: MILESTONE.STOP_COMPLETE,
        detail: { dayOrdinal: stack[2].ordinal, stopOrdinal: top.ordinal },
      };
    }
    return null;
  };

  const openContainer = (type, atMs) => {
    if (stack.length >= MAX_DEPTH) { malformed = malformed || 'max_depth_exceeded'; return; }
    const parent = stack[stack.length - 1] || null;
    const ordinal = parent && parent.type === 'array' ? parent.childObjectCount + 1 : null;
    const key = parent && parent.type === 'object' ? pendingKey : null;
    pendingKey = null;
    stack.push({ type, key, ordinal, childObjectCount: 0 });
    if (type === 'object') {
      expectKey = true;
      if (!sawOpeningBrace && stack.length === 1) {
        sawOpeningBrace = true;
        record(MILESTONE.OPENING_BRACE, null, atMs);
      }
    } else {
      expectKey = false;
    }
  };

  const closeContainer = (type, atMs) => {
    const top = stack[stack.length - 1];
    if (!top || top.type !== type) { malformed = malformed || 'unbalanced_container'; return; }
    const unit = unitForClosingFrame();
    if (unit) record(unit.kind, unit.detail, atMs);
    stack.pop();
    const parent = stack[stack.length - 1] || null;
    if (parent && parent.type === 'array' && type === 'object') parent.childObjectCount += 1;
    expectKey = false;
  };

  return {
    /**
     * Feed one `tool_argument_delta`. Only the delta's characters are read; the
     * delta itself is never stored.
     *
     * @param {string} delta
     * @param {number} atMs wall clock at receipt
     */
    consume(delta, atMs) {
      const text = typeof delta === 'string' ? delta : '';
      if (!text) return;
      if (!sawFirstByte) { sawFirstByte = true; record(MILESTONE.FIRST_BYTE, null, atMs); }

      for (let i = 0; i < text.length; i += 1) {
        const ch = text[i];
        bytes += Buffer.byteLength(ch, 'utf8');

        if (inString) {
          if (escaped) {
            // The escaped character is literal. `\uXXXX`'s four hex digits are
            // ordinary characters too, so no extra state is needed.
            if (expectKey && !keyTruncated) {
              if (keyBuffer.length < MAX_KEY_CHARS) keyBuffer += ch; else keyTruncated = true;
            }
            escaped = false;
            continue;
          }
          if (ch === '\\') { escaped = true; continue; }
          if (ch === '"') {
            inString = false;
            if (expectKey) {
              pendingKey = keyTruncated ? null : keyBuffer;
              keyBuffer = ''; keyTruncated = false;
              // A top-level section has just been named. Only keys at the root
              // object qualify, so a stop's `alternatives` cannot masquerade as
              // the plan-level one.
              if (pendingKey && stack.length === 1 && stack[0].type === 'object'
                && TOP_LEVEL_SECTIONS.has(pendingKey) && !sectionsSeen.has(pendingKey)) {
                sectionsSeen.add(pendingKey);
                record(MILESTONE.SECTION_START, { section: pendingKey }, atMs);
              }
            }
            continue;
          }
          // A brace or bracket INSIDE a string is data, not structure.
          // Key characters are buffered; VALUE characters are skipped entirely.
          if (expectKey && !keyTruncated) {
            if (keyBuffer.length < MAX_KEY_CHARS) keyBuffer += ch; else keyTruncated = true;
          }
          continue;
        }

        switch (ch) {
          case '"':
            inString = true;
            if (expectKey) { keyBuffer = ''; keyTruncated = false; }
            break;
          case '{': openContainer('object', atMs); break;
          case '[': openContainer('array', atMs); break;
          case '}': closeContainer('object', atMs); break;
          case ']': closeContainer('array', atMs); break;
          case ':': expectKey = false; break;
          case ',': {
            const top = stack[stack.length - 1];
            expectKey = Boolean(top && top.type === 'object');
            break;
          }
          default: break; // whitespace, numbers, true/false/null — no structure
        }
      }
    },

    /**
     * Bounded projection. Ordinals, timestamps and byte offsets only — never a
     * name, note, label, or any other value from the artifact.
     */
    snapshot() {
      const at = (kind, pred) => {
        const m = milestones.find((x) => x.kind === kind && (!pred || pred(x)));
        return m ? m.tMs : null;
      };
      const days = milestones.filter((m) => m.kind === MILESTONE.DAY_COMPLETE);
      const sectionStartMs = {};
      for (const m of milestones) {
        if (m.kind === MILESTONE.SECTION_START && !(m.section in sectionStartMs)) {
          sectionStartMs[m.section] = m.tMs;
        }
      }
      return {
        firstToolByteMs: at(MILESTONE.FIRST_BYTE),
        firstOpeningBraceMs: at(MILESTONE.OPENING_BRACE),
        sectionStartMs,
        daysStartMs: sectionStartMs.days ?? null,
        firstCompleteStopMs: at(MILESTONE.STOP_COMPLETE),
        firstCompleteDayMs: at(MILESTONE.DAY_COMPLETE),
        secondCompleteDayMs: at(MILESTONE.DAY_COMPLETE, (m) => m.dayOrdinal === 2),
        allDaysStructurallyCompleteMs: at(MILESTONE.ALL_DAYS_COMPLETE),
        toolCompleteMs: at(MILESTONE.TOOL_COMPLETE),
        dayCompletionMs: days.map((m) => ({ dayOrdinal: m.dayOrdinal, tMs: m.tMs })),
        stopCompletionCount: milestones.filter((m) => m.kind === MILESTONE.STOP_COMPLETE).length,
        milestones: Object.freeze(milestones.slice()),
        milestonesTruncated: truncated,
        structurallyComplete: stack.length === 0 && sawOpeningBrace && !malformed,
        malformedReason: malformed,
        bytesScanned: bytes,
      };
    },
  };
}

module.exports = {
  MILESTONE,
  TOP_LEVEL_SECTIONS,
  MAX_MILESTONES,
  MAX_KEY_CHARS,
  MAX_DEPTH,
  createShadowStructureTracker,
};
