import { selectCanonicalConversation } from './messageOwnership';
import { selectCompletedGuestHistory } from './guestTurnLifecycle';

const sameMessage = (a, b) => a?.role === b?.role && a?.content === b?.content;

// Keep order and multiplicity. A missing row must not make all later rows
// appear missing too; exact text matching intentionally avoids fuzzy merging.
export function deviceOnlyMessages(cached = [], server = []) {
  let cursor = 0;
  return cached.filter(message => {
    const match = server.findIndex((row, index) => index >= cursor && sameMessage(row, message));
    if (match === -1) return true;
    cursor = match + 1;
    return false;
  });
}
export function hasDeviceOnlyHistory(cached = [], server = []) {
  return deviceOnlyMessages(cached, server).length > 0;
}

// Legacy caches have no scope stamp: keep them eligible for explicit review.
// Only a proven different owner/conversation is excluded from this chat.
export function guestCacheScope(cache, { anonymousId, conversationId = null }) {
  if (!cache) return 'empty';
  if (cache.currentTripId && !String(cache.currentTripId).startsWith('temp-')) return 'account_chat';
  if (cache.guestSessionId && cache.guestSessionId !== anonymousId) return 'different_session';
  if (Object.hasOwn(cache, 'guestConversationId') && (cache.guestConversationId || null) !== conversationId) return 'different_conversation';
  const scopedMessages = (cache.messages || []).filter(m => m?.conversationId != null);
  if (scopedMessages.some(m => m.conversationId !== conversationId)) return 'different_conversation';
  return 'matching_or_legacy';
}

export function completedRecoveryHistory(messages = []) {
  const canonical = selectCanonicalConversation(Array.isArray(messages) ? messages : [], { includeLegacyRecognition: true })
    .filter(m => m && !m.uiOnly && !m.isConversionMessage);
  return selectCompletedGuestHistory(canonical);
}

// Unsaved user text is worth preserving even without a completed reply. It
// remains backup-only; the bounded restore check still requires complete turns.
export function localRecoveryHistory(messages = []) {
  return selectCanonicalConversation(Array.isArray(messages) ? messages : [], { includeLegacyRecognition: true })
    .filter(m => m && !m.uiOnly && !m.isConversionMessage && ['user', 'assistant'].includes(m.role)
      && typeof m.content === 'string' && m.content.trim()
      && (m.role === 'user' || (!m.isStreaming && !m.isFinalizing && !m.guestTurnFailed)));
}

// The existing endpoint only prepends complete missing turns. Do not offer a
// restore that would overwrite, reorder, or splice server-owned messages.
export function canRestoreHistoryPrefix(cached = [], server = []) {
  if (!cached.length || cached.length > 40 || cached.length <= server.length) return false;
  const text = cached.map(m => ({ role: m.role, content: m.content }));
  if (JSON.stringify(text).length > 60000 || text[0].role !== 'user') return false;
  if (text.some((m, i) => !['user', 'assistant'].includes(m.role) || typeof m.content !== 'string'
    || !m.content.trim() || m.content.length > 12000 || (i && text[i - 1].role === m.role))) return false;
  const prefixLength = cached.length - server.length;
  return cached[prefixLength - 1].role === 'assistant'
    && server.every((m, i) => sameMessage(m, cached[prefixLength + i]));
}

export async function historyFingerprint(messages = []) {
  if (!globalThis.crypto?.subtle) return null;
  const text = JSON.stringify(messages.map(m => ({ role: m.role, content: m.content })));
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), n => n.toString(16).padStart(2, '0')).join('');
}

export function conversationSendBlocked({ generating, recovering, recoveryPending, restoreStatus }) {
  return Boolean(generating || recovering || recoveryPending?.blocking === true || ['pending', 'error'].includes(restoreStatus));
}

// Local-only ledger: acknowledgement belongs to the exact archived set, never
// to a whole session. A different set must still be reviewable.
export function preserveRecoverySet(storage, archiveKey, id, messages) {
  const key = `${archiveKey}:sets`;
  const records = JSON.parse(storage.getItem(key) || '[]');
  const existing = records.find(record => record.id === id);
  if (!existing) {
    records.push({ id, messages, acknowledged: false });
    storage.setItem(key, JSON.stringify(records));
  }
  return existing?.acknowledged === true;
}
export function acknowledgeRecoverySet(storage, archiveKey, id) {
  const key = `${archiveKey}:sets`;
  const records = JSON.parse(storage.getItem(key) || '[]');
  storage.setItem(key, JSON.stringify(records.map(record => record.id === id ? { ...record, acknowledged: true } : record)));
}
export function shouldOfferRecovery(messages = [], acknowledged = false) {
  return !acknowledged && messages.some(m => m.role === 'user' && m.content?.trim() && !m.hiddenFromUi);
}
