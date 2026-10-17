/**
 * Approved real Trailie result → /trailie-demo playback fixture.
 *
 * The demo fixture ships to every visitor in the client bundle, so this is the
 * boundary where a private answer becomes public content. It is built as an
 * ALLOWLIST, not a denylist: a field reaches the fixture only because it is
 * named here. A future server change that adds `traceId` or `costUsd` to the
 * result therefore cannot leak by being forgotten — the default is to drop it.
 *
 * Dropped by construction: user ids, trip ids, response ids, message ids,
 * provider request ids, JWT/auth data, token usage, cost, provider and model
 * names, content/itinerary hashes, response versions and revisions, lifecycle
 * status, persistence metadata, and every debug field.
 *
 * Deterministic: same input → same output, no clock, no randomness, no network.
 * That is what lets the fixture be reviewed as a diff.
 *
 * The importer never publishes on its own. `buildPlaybackScenario` returns a
 * candidate; replacing the live fixture is a separate, explicit operator step.
 */

import {
  PLAYBACK_SCHEMA_VERSION,
  SCENARIO_KIND,
  normalizePlaybackScenario,
  validatePlaybackScenario,
} from './trailieDemoPlaybackSchema';
import { exportPublicPlan } from './publicItineraryExport.mjs';

/**
 * Fields that must never appear anywhere in a fixture. Asserted by
 * `assertNoInternalFields` and by tests — a second line of defence behind the
 * allowlist, so a bug in the allowlist is still caught.
 */
export const FORBIDDEN_FIXTURE_FIELDS = Object.freeze([
  'userId', 'user', 'tripId', 'responseId', 'messageId', 'clientTurnId',
  'requestId', 'providerRequestId', 'provider', 'model', 'token', 'tokens',
  'usage', 'inputTokens', 'outputTokens', 'costUsd', 'cost',
  'contentHash', 'itineraryHash', 'responseVersion', 'responseRevision',
  'lifecycleStatus', 'persistence', 'persistenceWrites', 'captureAs',
  'authorization', 'jwt', 'bearer', 'password', 'email', 'anonymousId',
  '_id', '__v', 'createdAt', 'updatedAt', 'sourceNote', 'capturedAt',
]);

/**
 * Use the same public canonical boundary as Samples / share / PDF.
 * Demo playback additionally omits feasibilityIssues — those are owner-facing
 * diagnostics, not Demo travel advice (still no second planner).
 */
export function sanitizePlan(rawPlan) {
  if (!rawPlan?.days?.length) return null;
  const plan = exportPublicPlan(rawPlan);
  if (plan && Object.prototype.hasOwnProperty.call(plan, 'feasibilityIssues')) {
    delete plan.feasibilityIssues;
  }
  return plan;
}

/**
 * Reduces one approved turn to a playback turn.
 *
 * @param {object} approved - the operator-approved real result
 * @param {string} approved.question - the scenario question, verbatim
 * @param {string} approved.content - the final assistant prose
 * @param {object|null} approved.canonicalPlan - the structured plan, when the turn produced one
 * @param {boolean} approved.hasLiveData
 * @param {boolean} approved.hasWebSearch
 */
export function sanitizeApprovedTurn(approved) {
  const prose = String(approved?.content || '');
  const plan = sanitizePlan(approved?.canonicalPlan || approved?.plan || null);

  return {
    question: String(approved?.question || ''),
    prose,
    plan,
    liveData: {
      nps: approved?.hasLiveData === true,
      web: approved?.hasWebSearch === true,
    },
  };
}

/**
 * Builds a complete playback scenario from approved turns, preserving the
 * scenario's existing identity (id, label, chatTitle, order).
 *
 * `kind` follows the captured reality: a scenario is an itinerary scenario only
 * if some turn actually produced a plan. That is what keeps §3's "do not force
 * an itinerary card onto every scenario" true by construction.
 *
 * @returns {{ scenario: object, problems: string[] }}
 */
export function buildPlaybackScenario({ id, label, chatTitle, approvedTurns }) {
  const turns = (approvedTurns || []).map(sanitizeApprovedTurn);
  const anyPlan = turns.some((turn) => turn.plan?.days?.length);

  const scenario = normalizePlaybackScenario({
    id,
    label,
    chatTitle,
    kind: anyPlan ? SCENARIO_KIND.ITINERARY : SCENARIO_KIND.CONVERSATION,
    turns,
  });

  return { scenario, problems: validatePlaybackScenario(scenario) };
}

/**
 * Deep scan for anything that must never ship. Returns the offending key paths.
 * Runs over the serialized fixture, so it catches nesting the allowlist missed.
 */
export function assertNoInternalFields(value, path = '$') {
  const found = [];

  const walk = (node, where) => {
    if (Array.isArray(node)) {
      node.forEach((item, index) => walk(item, `${where}[${index}]`));
      return;
    }
    if (!node || typeof node !== 'object') return;

    for (const [key, child] of Object.entries(node)) {
      if (FORBIDDEN_FIXTURE_FIELDS.includes(key) && !(key === 'provider' && /\.travelEdges\[\d+\]\.source$/.test(where) && child === 'google_maps')) found.push(`${where}.${key}`);
      walk(child, `${where}.${key}`);
    }
  };

  walk(value, path);
  return found;
}

/** Wraps scenarios into the shippable fixture document. */
export function buildPlaybackFixture(scenarios) {
  return {
    schemaVersion: PLAYBACK_SCHEMA_VERSION,
    scenarios,
  };
}
