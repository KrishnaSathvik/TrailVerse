'use strict';

const VALID_ID = /^[a-zA-Z0-9_-]{1,80}$/;
function validateConversationId(value) {
  if (value == null || value === '') return null;
  if (typeof value !== 'string' || !VALID_ID.test(value)) {
    throw Object.assign(new Error('Invalid guest conversation ID'), { status: 400 });
  }
  return value;
}
function selectGuestConversation(session, conversationId = null) {
  const id = validateConversationId(conversationId);
  const messages = (session.messages || []).filter(m => (m.conversationId || null) === id);
  const turns = (session.turns || []).filter(t => (t.userMessage?.conversationId || null) === id);
  const latestState = [...messages].reverse().find(m => m.planningState)?.planningState;
  return { messages, turns, planningState: id ? latestState || null : session.planningState || null };
}
module.exports = { validateConversationId, selectGuestConversation };
