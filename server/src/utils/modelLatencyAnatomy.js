'use strict';

/**
 * MODEL LATENCY ANATOMY — measurement, not optimization.
 *
 * With `zero_duration_stops` fixed, a clean THRO turn is ~28.3s: ~24.1s model,
 * ~4.2s evidence, ~19ms deterministic validation. The remaining question is why
 * ONE successful architect inference takes 24 seconds, and the current data
 * cannot distinguish two shapes that lead to opposite fixes:
 *
 *   front_loaded   20s to first token +  4s producing  -> input size, routing, provider
 *   output_bound    5s to first token + 19s producing  -> artifact size, output budget
 *
 * Nothing here changes behavior. `null` means unmeasured and is never replaced
 * with a plausible number.
 *
 * ── `firstEventAtMs` IS NOT FIRST TOKEN ──────────────────────────────────────
 *
 * `timeToFirstEventMs` measures the first normalized stream event OF ANY KIND.
 * For the OpenAI Responses stream that is `response.created`, which fires when
 * the connection opens — before a single reasoning or output token exists. The
 * 2026-08-27 THRO run read 1,915 ms there and it was taken to mean "the model
 * starts producing at ~1.9 s". It does not mean that, and with every route tier
 * being a reasoning model (luna/terra/sol at effort low or medium) the gap
 * between stream-open and first output token is exactly the unknown that decides
 * whether progressive delivery is possible at all.
 *
 * So the artifact clock is measured separately and honestly:
 *
 *   responseCreatedDelayMs          dispatch -> stream open        (was "TTFE")
 *   timeToFirstTextDeltaMs          dispatch -> first prose token
 *   timeToFirstToolArgumentDeltaMs  dispatch -> FIRST ITINERARY BYTE
 *   toolArgumentStreamingMs         first -> last itinerary byte
 *   postArtifactCompletionMs        last itinerary byte -> dispatch complete
 *
 * Itinerary turns dispatch with a tool and no forced text, so a null
 * `timeToFirstTextDeltaMs` is the CORRECT reading for them, not a gap.
 *
 * ── SHAPE, NOT JUST FIRST BYTE ───────────────────────────────────────────────
 *
 * A single first-byte timestamp can mislead: "2.4 s, then nothing until 14 s" and
 * "2.4 s, streaming continuously" have the same first byte and opposite
 * architectural consequences. `toolArgumentSamples` carries a bounded
 * (time, cumulativeBytes) curve so the two can be told apart.
 *
 * PRIVACY: byte COUNTS only. No tool-argument content, no plan text, no field
 * names, ever enters this projection.
 */

/** Above this share of model time spent before the first token, the wait is the problem. */
const FRONT_LOADED_THRESHOLD = 0.6;

/**
 * Bounded sampling of the tool-argument byte curve. A sample is taken when
 * EITHER threshold is crossed, and the series is hard-capped — a long artifact
 * must not turn telemetry into a transcript of its own size.
 */
const TOOL_ARGUMENT_SAMPLE_INTERVAL_MS = 250;
const TOOL_ARGUMENT_SAMPLE_BYTES = 4096;
const MAX_TOOL_ARGUMENT_SAMPLES = 32;

/**
 * Accumulate the tool-argument byte curve for one dispatch.
 *
 * Deliberately takes only `byteLength` — never the delta string — so there is no
 * code path by which plan content could reach telemetry. The first and last
 * deltas are always sampled; everything between is thresholded and capped.
 */
function createToolArgumentStreamRecorder({
  dispatchStartedAtMs = null,
  intervalMs = TOOL_ARGUMENT_SAMPLE_INTERVAL_MS,
  byteStep = TOOL_ARGUMENT_SAMPLE_BYTES,
  maxSamples = MAX_TOOL_ARGUMENT_SAMPLES,
} = {}) {
  const started = Number.isFinite(dispatchStartedAtMs) ? dispatchStartedAtMs : null;
  const samples = [];
  let count = 0;
  let bytes = 0;
  let firstAtMs = null;
  let lastAtMs = null;
  let lastSampleAtMs = null;
  let lastSampleBytes = 0;
  let truncated = false;

  const push = (atMs) => {
    if (samples.length >= maxSamples) { truncated = true; return; }
    samples.push(Object.freeze({
      tMs: started == null ? null : Math.max(0, atMs - started),
      cumulativeBytes: bytes,
    }));
    lastSampleAtMs = atMs;
    lastSampleBytes = bytes;
  };

  return {
    /** @param {number} byteLength bytes in this delta. @param {number} atMs wall clock. */
    record(byteLength, atMs) {
      const size = Number.isFinite(byteLength) ? Math.max(0, byteLength) : 0;
      count += 1;
      bytes += size;
      if (firstAtMs == null) { firstAtMs = atMs; push(atMs); return; }
      lastAtMs = atMs;
      if (atMs - (lastSampleAtMs ?? firstAtMs) >= intervalMs
        || bytes - lastSampleBytes >= byteStep) push(atMs);
    },
    /** Always sample the final point, so the curve ends where the artifact ends. */
    seal() {
      if (firstAtMs != null && lastAtMs != null && lastSampleBytes !== bytes) {
        // Replacing rather than appending keeps the cap honest at the tail.
        if (samples.length >= maxSamples) samples.pop();
        push(lastAtMs);
      }
      return this.snapshot();
    },
    snapshot() {
      return {
        toolArgumentDeltaCount: count,
        toolArgumentBytes: bytes,
        firstToolArgumentDeltaAtMs: firstAtMs,
        lastToolArgumentDeltaAtMs: lastAtMs ?? firstAtMs,
        toolArgumentSamples: Object.freeze(samples.slice()),
        toolArgumentSamplesTruncated: truncated,
      };
    },
  };
}

function summarizeModelDispatch({
  dispatchStartedAtMs = null,
  firstEventAtMs = null,
  completedAtMs = null,
  outputTokens = null,
  responseCreatedAtMs = null,
  firstTextDeltaAtMs = null,
  firstToolArgumentDeltaAtMs = null,
  lastToolArgumentDeltaAtMs = null,
  toolArgumentDeltaCount = null,
  toolArgumentBytes = null,
  toolArgumentSamples = null,
  toolArgumentSamplesTruncated = false,
  shadowStructure = null,
} = {}) {
  const started = Number.isFinite(dispatchStartedAtMs) ? dispatchStartedAtMs : null;
  const completed = Number.isFinite(completedAtMs) ? completedAtMs : null;
  const first = Number.isFinite(firstEventAtMs) ? firstEventAtMs : null;
  /** Elapsed from dispatch to `at`, or null when either end is unmeasured. */
  const since = (at) => (started != null && Number.isFinite(at) ? Math.max(0, at - started) : null);
  const firstToolArg = Number.isFinite(firstToolArgumentDeltaAtMs) ? firstToolArgumentDeltaAtMs : null;
  const lastToolArg = Number.isFinite(lastToolArgumentDeltaAtMs) ? lastToolArgumentDeltaAtMs : null;

  const totalModelMs = started != null && completed != null
    ? Math.max(0, completed - started) : null;
  const timeToFirstEventMs = started != null && first != null
    ? Math.max(0, first - started) : null;
  const generationAfterFirstEventMs = first != null && completed != null
    ? Math.max(0, completed - first) : null;

  let shape = 'unmeasured';
  if (totalModelMs != null && timeToFirstEventMs != null && totalModelMs > 0) {
    shape = (timeToFirstEventMs / totalModelMs) >= FRONT_LOADED_THRESHOLD
      ? 'front_loaded' : 'output_bound';
  }

  // Only meaningful over the producing half; dividing by total would flatter a
  // dispatch that spent most of its time waiting.
  const outputTokensPerSecond = generationAfterFirstEventMs != null
    && generationAfterFirstEventMs > 0
    && Number.isFinite(outputTokens)
    ? Number(((outputTokens / generationAfterFirstEventMs) * 1000).toFixed(2))
    : null;

  return {
    totalModelMs,
    // Retained under its existing name for continuity, but see the module note:
    // this is stream-open, NOT first token.
    timeToFirstEventMs,
    generationAfterFirstEventMs,
    outputTokensPerSecond,
    shape,

    // ── Artifact clock ──────────────────────────────────────────────────────
    responseCreatedDelayMs: since(responseCreatedAtMs),
    timeToFirstTextDeltaMs: since(firstTextDeltaAtMs),
    timeToFirstToolArgumentDeltaMs: since(firstToolArg),
    toolArgumentStreamingMs: firstToolArg != null && lastToolArg != null
      ? Math.max(0, lastToolArg - firstToolArg) : null,
    postArtifactCompletionMs: lastToolArg != null && completed != null
      ? Math.max(0, completed - lastToolArg) : null,
    toolArgumentDeltaCount: Number.isFinite(toolArgumentDeltaCount) ? toolArgumentDeltaCount : null,
    toolArgumentBytes: Number.isFinite(toolArgumentBytes) ? toolArgumentBytes : null,
    toolArgumentSamples: Array.isArray(toolArgumentSamples) ? toolArgumentSamples : null,
    toolArgumentSamplesTruncated: toolArgumentSamplesTruncated === true,

    // ── Structural milestones ───────────────────────────────────────────────
    // WHEN structure becomes available, never WHETHER it may be shown. A
    // structurally complete streamed day is not a validated day: whole-plan
    // completeness, cross-day pacing, traveler fit and later repair can all
    // still reject it. Ordinals and timestamps only — no artifact content.
    structureMilestones: projectShadowStructure(shadowStructure),
  };
}

/** Bounded, content-free projection of the shadow tracker's snapshot. */
function projectShadowStructure(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') return null;
  return {
    firstOpeningBraceMs: snapshot.firstOpeningBraceMs ?? null,
    // Where `days` begins relative to the prose sections. Property order is
    // model-controlled; this observes it without changing it.
    daysStartMs: snapshot.daysStartMs ?? null,
    sectionStartMs: snapshot.sectionStartMs && typeof snapshot.sectionStartMs === 'object'
      ? snapshot.sectionStartMs : {},
    firstCompleteStopMs: snapshot.firstCompleteStopMs ?? null,
    firstCompleteDayMs: snapshot.firstCompleteDayMs ?? null,
    secondCompleteDayMs: snapshot.secondCompleteDayMs ?? null,
    allDaysStructurallyCompleteMs: snapshot.allDaysStructurallyCompleteMs ?? null,
    toolCompleteMs: snapshot.toolCompleteMs ?? null,
    dayCompletionMs: Array.isArray(snapshot.dayCompletionMs) ? snapshot.dayCompletionMs : [],
    stopCompletionCount: snapshot.stopCompletionCount ?? null,
    structurallyComplete: snapshot.structurallyComplete === true,
    malformedReason: snapshot.malformedReason ?? null,
    milestonesTruncated: snapshot.milestonesTruncated === true,
  };
}

/**
 * What we are actually shipping to the model, by section.
 *
 * `buildTrailiePromptV2` has computed this per turn all along and nothing has
 * ever surfaced it, so "we send about 6k tokens" has been an assumption.
 * Sorted largest-first: the census should name its own suspect.
 */
function summarizePromptPayload({ accounting = null, toolSchemaTokens = null } = {}) {
  if (!accounting) {
    return { tokenizerId: null, sections: [], totalTokens: null, unmeasuredSections: [] };
  }
  const measured = [
    ['core_policy', accounting.coreTokens],
    ['task_contract', accounting.contractTokens],
    ['evidence', accounting.evidenceTokens],
    ['trip_state', accounting.tripStateTokens],
    ['history', accounting.historyTokens],
    ['user_message', accounting.userTokens],
    ['tool_schema', Number.isFinite(toolSchemaTokens) ? toolSchemaTokens : null],
  ];
  const total = measured.reduce((sum, [, tokens]) => sum + (Number.isFinite(tokens) ? tokens : 0), 0);
  const sections = measured
    .map(([section, tokens]) => ({
      section,
      tokens: Number.isFinite(tokens) ? tokens : null,
      share: Number.isFinite(tokens) && total > 0 ? Number((tokens / total).toFixed(4)) : null,
    }))
    .sort((a, b) => (b.tokens ?? -1) - (a.tokens ?? -1));

  return {
    tokenizerId: accounting.tokenizerId || null,
    sections,
    totalTokens: total,
    unmeasuredSections: sections.filter((s) => s.tokens == null).map((s) => s.section),
  };
}

module.exports = {
  FRONT_LOADED_THRESHOLD,
  TOOL_ARGUMENT_SAMPLE_INTERVAL_MS,
  TOOL_ARGUMENT_SAMPLE_BYTES,
  MAX_TOOL_ARGUMENT_SAMPLES,
  createToolArgumentStreamRecorder,
  projectShadowStructure,
  summarizeModelDispatch,
  summarizePromptPayload,
};
