'use strict';

/**
 * TURN TIMELINE — attribution before optimization.
 *
 * Today a turn reports two numbers and neither is a stage:
 *
 *   generationMs    SUM of attempt windows, each spanning generation AND
 *                   validation (finalizeItinerary, Maps route bridge,
 *                   completeness, traveler fit).
 *   preGenerationMs totalMs - generationMs. A residual holding HTTP, auth,
 *                   understanding, evidence, persistence and finalization.
 *
 * "28.4s pre-generation" therefore names a bucket, and "7.6s generation"
 * includes deterministic work. Neither can point at a bottleneck, which is why
 * this exists before any optimization does.
 *
 * WALL CLOCK vs WORK. Evidence acquisition fans out concurrently, so summing
 * spans overstates what the traveler waited for. Both are kept, separately:
 * `criticalPathMs` is union-of-intervals (what was waited for),
 * `accumulatedWorkMs` is the sum (what was done).
 *
 * Bounded slugs and integers only. No prompts, no plan content, no free text.
 */

const STAGE_SLUG = /^[a-z0-9_]{1,40}$/;
const MAX_STAGES = 32;

/**
 * BOUNDED SPAN PROJECTION.
 *
 * The aggregate answers "how much work"; it cannot answer "in what shape".
 * The 2026-08-26 evidence audit needed the second question — are the three
 * broker waves serialised, and which branch is longest — and could not answer
 * it, because the intervals were discarded at snapshot time.
 *
 * They are kept now, capped and slug-bounded. Integers and short slugs only:
 * no prompts, no plan content, no URLs, no free text.
 */
const MAX_SPANS = 64;
const META_SLUG = /^[a-z0-9_]{1,40}$/;
const SPAN_META_KEYS = Object.freeze(['wave', 'provider', 'requirement']);
/**
 * Provider dedupe keys — `nps|alerts|thro`, `weather|forecast|46.979|-103.538|imperial`,
 * `brave|search|<hash>`. Structured identifiers only: no spaces, no scheme, no
 * query string, so a URL or a free-text query can never ride along.
 */
const GROUP_KEY = /^[a-z0-9_|:.-]{1,120}$/i;
const MAX_GROUP_REQUIREMENTS = 12;

function boundedMeta(meta) {
  if (!meta || typeof meta !== 'object') return null;
  const out = {};
  for (const key of SPAN_META_KEYS) {
    const value = meta[key];
    if (typeof value === 'string' && META_SLUG.test(value)) out[key] = value;
  }
  // A refresh serves the whole deduplicated GROUP, so naming one member
  // misattributes the rest. The group key and its membership describe what was
  // actually fetched; lookup spans keep their single `requirement`.
  if (typeof meta.groupKey === 'string' && GROUP_KEY.test(meta.groupKey)) {
    out.groupKey = meta.groupKey;
  }
  if (Array.isArray(meta.requirements)) {
    const topics = meta.requirements
      .filter((topic) => typeof topic === 'string' && META_SLUG.test(topic))
      .slice(0, MAX_GROUP_REQUIREMENTS);
    if (topics.length > 0) out.requirements = topics;
  }
  if (typeof meta.blocking === 'boolean') out.blocking = meta.blocking;
  return Object.keys(out).length > 0 ? out : null;
}

function createTurnTimeline({ now = () => Date.now() } = {}) {
  const spans = [];
  const open = new Map();
  let sequence = 0;
  const originMs = now();

  /**
   * @param {string} stage bounded slug
   * @param {Object} [meta] optional bounded {wave, provider, requirement, blocking}
   * @returns {Function} call to close the span. Safe to call twice.
   */
  function begin(stage, meta = null) {
    const name = String(stage || '');
    if (!STAGE_SLUG.test(name)) return () => {};
    const id = (sequence += 1);
    const startedAt = now();
    const bounded = boundedMeta(meta);
    open.set(id, { stage: name, startedAt });
    let closed = false;
    return function end() {
      if (closed) return;
      closed = true;
      open.delete(id);
      spans.push({ stage: name, startedAt, endedAt: now(), meta: bounded });
    };
  }

  /** Union of intervals: the time actually spent waiting, overlaps counted once. */
  function unionMs(intervals) {
    if (intervals.length === 0) return 0;
    const sorted = [...intervals].sort((a, b) => a.startedAt - b.startedAt);
    let total = 0;
    let [current] = sorted;
    let start = current.startedAt;
    let end = current.endedAt;
    for (const span of sorted.slice(1)) {
      if (span.startedAt > end) {
        total += end - start;
        start = span.startedAt;
        end = span.endedAt;
      } else if (span.endedAt > end) {
        end = span.endedAt;
      }
    }
    return total + (end - start);
  }

  function snapshot({ totalMs = null } = {}) {
    const byStage = new Map();
    for (const span of spans) {
      const row = byStage.get(span.stage) || { stage: span.stage, totalMs: 0, calls: 0 };
      row.totalMs += Math.max(0, span.endedAt - span.startedAt);
      row.calls += 1;
      byStage.set(span.stage, row);
    }
    const stages = [...byStage.values()].slice(0, MAX_STAGES);
    const criticalPathMs = unionMs(spans);
    const accumulatedWorkMs = stages.reduce((n, row) => n + row.totalMs, 0);
    // Chronological, so the emitted list reads as the turn's actual shape.
    const ordered = [...spans].sort((a, b) => a.startedAt - b.startedAt);
    const projected = ordered.slice(0, MAX_SPANS).map((span) => ({
      stage: span.stage,
      startMs: Math.max(0, span.startedAt - originMs),
      durationMs: Math.max(0, span.endedAt - span.startedAt),
      ...(span.meta || {}),
      ...(span.meta?.requirements ? { requirements: [...span.meta.requirements] } : {}),
    }));
    return {
      stages,
      spans: projected,
      spansTruncated: ordered.length > MAX_SPANS,
      criticalPathMs,
      accumulatedWorkMs,
      openStages: [...new Set([...open.values()].map((row) => row.stage))].slice(0, MAX_STAGES),
      unattributedMs: Number.isFinite(totalMs) ? Math.max(0, totalMs - criticalPathMs) : null,
      // INSTRUMENTATION HEALTH, not a product metric. If a live turn attributes
      // 9s of 20s, no architecture decision should be made from it. Aim >0.95
      // before optimizing anything.
      coverageRatio: Number.isFinite(totalMs) && totalMs > 0
        ? Math.min(1, Number((criticalPathMs / totalMs).toFixed(4)))
        : null,
    };
  }

  return { begin, snapshot };
}

module.exports = { createTurnTimeline, STAGE_SLUG };
