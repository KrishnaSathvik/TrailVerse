'use strict';

// Compatibility endpoint adapter. All planning and validation belong to the
// canonical executor; this module does not schedule destination-specific stops.
function createPlanError(code, message) {
  return Object.assign(new Error(message), { code, statusCode: 400 });
}

async function executePlanItineraryRequest(req, { preparedContext, runTurn = require('./trailieRouteBridge').runTrailieFromPreparedContext } = {}) {
  if (!preparedContext) throw createPlanError('CANONICAL_CONTEXT_REQUIRED', 'The planner requires canonical trip context.');
  const { result, content } = await runTurn({ preparedContext, messages: req.body?.messages || [], signal: req.signal });
  if (result.status !== 'complete' && !require('../utils/trailieV2TerminalOutcome').isCompletedSemanticTerminal(result, content)) {
    const error = new Error(content || 'The requested plan could not be completed.');
    error.code = result.terminalReason || 'canonical_plan_failed';
    error.statusCode = 422;
    throw error;
  }
  const itinerary = result.canonicalPlan || null;
  return { content, itinerary, canonicalPlan: itinerary,
    planningState: require('../utils/planningState').finalizePlanningStateForTurn(
      preparedContext.planningState || preparedContext.constraints?.planningState || null, result),
    parkCode: preparedContext.resolvedMetadata?.parkCode || null,
    parkName: preparedContext.resolvedMetadata?.parkName || null,
    hasItinerary: Boolean(itinerary), plannerMode: 'canonical',
    criticalNotices: itinerary?.warnings || [], unverified: [],
    itineraryHash: result.itineraryHash, trailie: result.telemetrySummary };
}

module.exports = { executePlanItineraryRequest };
