'use strict';

const REQUIRED_IDENTITY_SOURCES = Object.freeze([
  'revision_1_persistence_payload',
  'stored_revision_1_trip',
  'revision_2_persistence_payload',
  'stored_revision_2_trip',
  'authenticated_restore',
  'frontend_selected_restored_state',
]);

function normalizeTimestamp(value) {
  if (value == null) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function captureAssistantIdentitySnapshot({ source, conversation, responseId = null } = {}) {
  const messages = Array.isArray(conversation) ? conversation : [];
  const index = messages.findIndex((message) => message?.role === 'assistant'
    && (responseId == null || message.responseId === responseId));
  const assistant = index >= 0 ? messages[index] : null;
  return {
    source,
    responseId: assistant?.responseId ?? null,
    responseVersion: Number.isFinite(assistant?.responseVersion) ? assistant.responseVersion : null,
    assistantMessageId: assistant?.id ?? null,
    assistantMessageIdType: assistant == null ? null : typeof assistant.id,
    assistantMessageTimestamp: normalizeTimestamp(assistant?.timestamp),
    assistantSlotIndex: index >= 0 ? index : null,
  };
}

function allEqual(values) {
  return values.length > 0 && values.every((value) => value != null && value === values[0]);
}

function evaluateIdentityEvidence({ snapshots = [] } = {}) {
  const bySource = new Map((Array.isArray(snapshots) ? snapshots : []).map((row) => [row?.source, row]));
  const required = REQUIRED_IDENTITY_SOURCES.map((source) => bySource.get(source)).filter(Boolean);
  const allSourcesPresent = required.length === REQUIRED_IDENTITY_SOURCES.length;
  const responseIdentityStable = allSourcesPresent
    && allEqual(required.map((row) => row.responseId))
    && allEqual(required.map((row) => row.responseVersion));
  const numericMessageIdStable = allSourcesPresent
    && required.every((row) => row.assistantMessageIdType === 'number'
      && Number.isFinite(row.assistantMessageId))
    && allEqual(required.map((row) => row.assistantMessageId));
  const messageTimestampStable = allSourcesPresent
    && allEqual(required.map((row) => row.assistantMessageTimestamp));
  const assistantSlotStable = allSourcesPresent
    && allEqual(required.map((row) => row.assistantSlotIndex));
  const identityEvidenceComplete = responseIdentityStable && numericMessageIdStable
    && messageTimestampStable && assistantSlotStable;
  return {
    responseIdentityStable,
    numericMessageIdStable,
    messageTimestampStable,
    assistantSlotStable,
    identityEvidenceComplete,
    snapshots: Array.isArray(snapshots) ? snapshots : [],
    missingSources: REQUIRED_IDENTITY_SOURCES.filter((source) => !bySource.has(source)),
  };
}

module.exports = {
  REQUIRED_IDENTITY_SOURCES,
  captureAssistantIdentitySnapshot,
  evaluateIdentityEvidence,
};
