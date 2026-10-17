/**
 * Playback schema for /trailie-demo.
 *
 * The demo replays approved Trailie answers. It is NOT the /plan-ai starter-chip
 * set (`@/lib/trailieDemoPrompts`) — these are the demo's own scenarios, with
 * their own identity, order and intent, and the two sets must stay independent.
 *
 * WHY A SECOND SCHEMA
 * The legacy fixture (`trailieDemoResponses.json`) was captured against the old
 * non-streaming `/api/ai/chat`: one question, one blob of prose. Current Trailie
 * answers an itinerary request in two visible beats — the plan lands first, then
 * the prose is written around it — and answers everything else conversationally.
 * A single-blob fixture cannot express that, so playback needs a shape that
 * carries the plan separately from the prose.
 *
 * TWO SCENARIO KINDS
 *   'itinerary'    → thinking → itinerary card revealed → writing → prose
 *   'conversation' → thinking → prose
 *
 * `kind` is the scenario's declared INTENT. Whether a card actually renders is
 * decided by `turnHasItinerary()` — i.e. by whether a real plan was captured.
 * An itinerary scenario awaiting re-capture therefore plays conversationally
 * rather than showing an invented card. Nothing here fabricates a plan.
 *
 * PUBLIC SURFACE ONLY
 * This file is imported into the browser bundle, so every field in it is public.
 * Response ids, revisions, provider/model names, token counts, costs, hashes,
 * persistence and lifecycle metadata are not part of the schema — see
 * `trailieDemoCapture.js`, which enforces that by allowlist when importing.
 */

export const PLAYBACK_SCHEMA_VERSION = 2;

export const SCENARIO_KIND = Object.freeze({
  ITINERARY: 'itinerary',
  CONVERSATION: 'conversation',
});

export const SCENARIO_KINDS = Object.freeze([SCENARIO_KIND.ITINERARY, SCENARIO_KIND.CONVERSATION]);

/**
 * Playback beats, in milliseconds. Presentation timing only — it is not a
 * measurement of how long the real turn took, and must never be presented as one.
 */
export const PLAYBACK_TIMING = Object.freeze({
  /** Delay before the demo starts "typing" the question. */
  leadInMs: 400,
  followUpLeadInMs: 550,
  charMs: 32,
  charSpaceMs: 46,
  charPunctMs: 72,
  /** Thinking beat before anything is revealed. */
  thinkingMs: 1000,
  /** How long the spoken intro stays alone before the day card arrives. */
  writingMs: 1400,
  /** Gap between turns of a multi-turn scenario. */
  turnGapMs: 700,
});

/** Per-character typing delay, so the demo types like a person rather than a ticker. */
export function typingDelayMs(char) {
  if (char === ' ' || char === '\n') return PLAYBACK_TIMING.charSpaceMs;
  if (/[.,!?;:]/.test(char)) return PLAYBACK_TIMING.charPunctMs;
  return PLAYBACK_TIMING.charMs;
}

/** True when this turn has a real captured plan and may render an itinerary card. */
export function turnHasItinerary(turn) {
  return Array.isArray(turn?.plan?.days) && turn.plan.days.length > 0;
}

/** True when the scenario intends to demonstrate the early-itinerary experience. */
export function isItineraryScenario(scenario) {
  return scenario?.kind === SCENARIO_KIND.ITINERARY;
}

/** Scenarios whose declared intent is not yet backed by a captured plan. */
export function scenarioAwaitsRecapture(scenario) {
  return (scenario?.turns || []).some((turn) => turn.awaitingRecapture === true);
}

/**
 * The beats this turn will play, in order. Drives both the engine and the tests.
 * An itinerary turn shows the spoken intro before the day card, matching the
 * finished answer: intro, then the plan.
 */
export function playbackBeatsForTurn(turn) {
  if (turnHasItinerary(turn)) {
    return ['thinking', 'intro', 'prose'];
  }
  return ['thinking', 'prose'];
}

/**
 * The live-data hint shown while thinking. Deliberately coarse: it names the
 * kind of source, never the provider, the model or an internal stage id.
 */
export function thinkingLabelForTurn(turn) {
  if (turn?.liveData?.web) return 'Reviewing captured search results…';
  if (turn?.liveData?.nps) return 'Reviewing captured park data…';
  return 'Trailie is thinking…';
}

/** Normalizes a stored scenario into the shape the player consumes. */
export function normalizePlaybackScenario(raw) {
  const turns = (raw?.turns || []).map((turn) => ({
    question: String(turn.question || ''),
    prose: String(turn.prose || turn.content || ''),
    content: turn.content || turn.prose || '',
    plan: turn.canonicalPlan || turn.plan || null,
    canonicalPlan: turn.canonicalPlan || turn.plan || null,
    travelLogistics: turn.travelLogistics || null,
    responseArtifacts: turn.responseArtifacts || null,
    intent: turn.intent || null,
    presentation: turn.presentation || null,
    source: turn.source || null,
    liveData: {
      nps: turn.liveData?.nps === true,
      web: turn.liveData?.web === true,
    },
    awaitingRecapture: turn.awaitingRecapture === true,
    questionUpdated: turn.questionUpdated === true,
  }));

  return {
    id: String(raw?.id || ''),
    label: String(raw?.label || ''),
    chatTitle: String(raw?.chatTitle || ''),
    kind: SCENARIO_KINDS.includes(raw?.kind) ? raw.kind : SCENARIO_KIND.CONVERSATION,
    turns,
  };
}

/**
 * Structural validation. Returns a list of human-readable problems — empty means
 * valid. Used by tests and by the importer so a malformed fixture is caught
 * before it reaches the page.
 */
export function validatePlaybackScenario(scenario) {
  const problems = [];
  if (!scenario?.id) problems.push('scenario is missing an id');
  if (!scenario?.label) problems.push(`${scenario?.id || 'scenario'}: missing label`);
  if (!SCENARIO_KINDS.includes(scenario?.kind)) {
    problems.push(`${scenario?.id || 'scenario'}: kind must be one of ${SCENARIO_KINDS.join(', ')}`);
  }
  if (!scenario?.turns?.length) problems.push(`${scenario?.id || 'scenario'}: has no turns`);

  (scenario?.turns || []).forEach((turn, index) => {
    const where = `${scenario.id} turn ${index}`;
    if (!turn.question?.trim()) problems.push(`${where}: missing question`);
    if (!turn.awaitingRecapture && !turn.prose?.trim()) problems.push(`${where}: missing prose`);
    if (turn.plan && !Array.isArray(turn.plan.days)) problems.push(`${where}: plan.days must be an array`);
    if (scenario.kind === SCENARIO_KIND.CONVERSATION && turnHasItinerary(turn)) {
      problems.push(`${where}: conversation scenarios must not carry a plan`);
    }
  });

  return problems;
}
