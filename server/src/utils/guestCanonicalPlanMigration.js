'use strict';

const { normalizeRevision } = require('./planPersistence');
const { mapGuestMessageToTripConversation } = require('./anonymousSessionStatusMessages');
const { hashPayload } = require('./canonicalResponse');
const { buildPlanDocument } = require('./trailiePipelineUtils');

function ownedPlan(message, { parkName = null, parkCode = null } = {}) {
  if (!message || message.role !== 'assistant' || !message.canonicalPlan?.days?.length) return null;
  if (!message.responseId || !Number.isInteger(message.responseVersion) || message.responseVersion < 1 || !message.itineraryHash) return null;
  let payload = message.canonicalPlan;
  if (hashPayload(payload) !== message.itineraryHash && payload.canonicalContract === 'trailie.itinerary.v2') {
    // Compatibility with model-first guest messages saved with document metadata.
    // Accept only if reconstructing the payload reproduces the original hash.
    payload = { ...payload };
    for (const key of ['type', 'version', 'generatedAt', 'createdFrom', 'responseId', 'responseVersion', 'contentHash', 'itineraryHash']) delete payload[key];
    if (payload.parkCode == null) delete payload.parkCode;
    if (payload.parkName == null) delete payload.parkName;
    if (Array.isArray(payload.feasibilityIssues) && !payload.feasibilityIssues.length) delete payload.feasibilityIssues;
  }
  const computedItineraryHash = hashPayload(payload);
  if (computedItineraryHash !== message.itineraryHash) return null;
  const computedContentHash = hashPayload(message.content || '');
  if (message.contentHash && message.contentHash !== computedContentHash) return null;
  const responseRevision = normalizeRevision(message.responseRevision);
  const plan = buildPlanDocument({
    itineraryData: payload,
    parkName: message.parkName || parkName,
    parkCode,
    reviewMeta: null,
    auditTrail: null,
    identity: {
      responseId: message.responseId,
      responseVersion: message.responseVersion,
      contentHash: computedContentHash,
      itineraryHash: computedItineraryHash,
    },
    feasibilityIssues: message.canonicalPlan.feasibilityIssues || [],
  });
  return {
    ...plan,
    responseId: message.responseId, responseVersion: message.responseVersion,
    itineraryHash: computedItineraryHash, contentHash: computedContentHash,
    responseRevision,
    lifecycleStatus: message.lifecycleStatus || 'prose_ready',
  };
}

function selectGuestCanonicalPlanForMigration(messages = [], destination = {}) {
  return messages.reduce((selected, message) => {
    const candidate = ownedPlan(message, destination);
    if (!candidate) return selected;
    if (!selected) return candidate;
    const candidateKey = [candidate.responseVersion, normalizeRevision(candidate.responseRevision)];
    const selectedKey = [selected.responseVersion, normalizeRevision(selected.responseRevision)];
    return candidateKey[0] > selectedKey[0]
      || (candidateKey[0] === selectedKey[0] && candidateKey[1] > selectedKey[1])
      ? candidate
      : selected;
  }, null);
}

function buildGuestTripMigrationPayload({ session, userId, keyTopics = [] } = {}) {
  const messages = Array.isArray(session?.messages) ? session.messages : [];
  const plan = selectGuestCanonicalPlanForMigration(messages, { parkName: session?.parkName, parkCode: session?.parkCode });
  return {
    userId,
    parkName: session?.parkName,
    parkCode: session?.parkCode,
    title: session?.parkName ? `${session.parkName} Trip Plan` : 'General Planning Session',
    formData: session?.formData || {},
    planningState: session?.planningState || undefined,
    entryContext: session?.entryContext || undefined,
    conversation: messages.map(mapGuestMessageToTripConversation),
    ...(plan ? { plan } : {}),
    status: 'active',
    summary: {
      totalMessages: messages.length,
      userQuestions: messages.filter((message) => message.role === 'user').slice(0, 3).map((message) => message.content),
      hasPlan: Boolean(plan),
      lastActivity: session?.lastActivity,
      keyTopics,
    },
  };
}

module.exports = { buildGuestTripMigrationPayload, selectGuestCanonicalPlanForMigration };
