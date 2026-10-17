/**
 * Stage 14.8H.1 — message ownership: what is conversation, and what is chrome.
 *
 * THE DEFECT THIS EXISTS TO FIX
 *
 * `showWelcomeMessage()` seeded the Trailie welcome copy into `messages` as an
 * ordinary assistant message — `{ id: Date.now(), role: 'assistant', content }`
 * with nothing to mark it as UI copy. Everything downstream treated it as a real
 * turn, so the first authenticated turn persisted TWO assistant documents: the
 * greeting and the actual response. On restore the greeting came back as
 * conversation history, which offsets turn counts and feeds UI copy into future
 * context, exports and reasoning as if Trailie had said it.
 *
 * WHY NOT MATCH THE TEXT
 *
 * The codebase already had `stripWelcomeBackMessages`, a regex over message
 * content. That approach fails in both directions: welcome copy is
 * personalised and localised so it drifts out of the pattern, and a genuine
 * assistant answer that happens to contain the phrase gets deleted. Ownership
 * has to be declared at creation and carried, not guessed at read time.
 *
 * THE MODEL
 *
 *   messageKind        what a message IS
 *   persistenceScope   whether it belongs in the canonical conversation
 *
 * Canonical persistence includes exactly the real logical turns. UI chrome is
 * rendered and never written.
 */

export const MESSAGE_KIND = Object.freeze({
  USER_TURN: 'user_turn',
  ASSISTANT_RESPONSE: 'assistant_response',
  UI_WELCOME: 'ui_welcome',
  SYSTEM_CHROME: 'system_chrome',
});

export const PERSISTENCE_SCOPE = Object.freeze({
  CANONICAL: 'canonical',
  UI_ONLY: 'ui_only',
});

const UI_ONLY_KINDS = new Set([MESSAGE_KIND.UI_WELCOME, MESSAGE_KIND.SYSTEM_CHROME]);

/**
 * Stamps a message as UI-only chrome. Every site that seeds presentation copy
 * into message state must use this, so the marker cannot be forgotten.
 */
export function markUiOnly(message, kind = MESSAGE_KIND.UI_WELCOME) {
  return {
    ...message,
    messageKind: kind,
    persistenceScope: PERSISTENCE_SCOPE.UI_ONLY,
    includedInCanonicalConversation: false,
  };
}

/** Builds the welcome placeholder as declared chrome. */
export function createUiWelcomeMessage({ id, content, timestamp = null }) {
  return markUiOnly({ id, role: 'assistant', content, timestamp }, MESSAGE_KIND.UI_WELCOME);
}

/** Explicitly declared chrome. Used on the WRITE path, where strictness is right. */
export function isDeclaredUiOnly(message) {
  if (!message || typeof message !== 'object') return false;
  if (message.persistenceScope === PERSISTENCE_SCOPE.UI_ONLY) return true;
  if (message.includedInCanonicalConversation === false) return true;
  return UI_ONLY_KINDS.has(message.messageKind);
}

/**
 * Best-effort classification for a message that predates the ownership model.
 * Declared kinds always win.
 */
export function classifyMessageKind(message) {
  if (!message || typeof message !== 'object') return null;
  if (message.messageKind) return message.messageKind;
  if (message.role === 'user') return MESSAGE_KIND.USER_TURN;
  if (message.role === 'assistant') return MESSAGE_KIND.ASSISTANT_RESPONSE;
  return MESSAGE_KIND.SYSTEM_CHROME;
}

/** Does this message carry any response identity from the generation pipeline? */
function hasResponseOwnership(message) {
  return Boolean(
    message
    && (message.responseId != null
      || message.responseVersion != null
      || message.responseRevision != null
      || message.lifecycleStatus != null
      || message.itineraryHash != null
      || message.itineraryPlan != null)
  );
}

/**
 * Stage 14.8H.1 §5 — legacy recognition, for trips written BEFORE the marker
 * existed. Deliberately conservative and structural: it never inspects content,
 * and it only ever fires on a leading assistant message that has no response
 * ownership at all.
 *
 * The safety argument: an assistant message positioned before the first user
 * turn is not a reachable conversation shape — nothing could have prompted it —
 * and every assistant message produced by the generation pipeline carries
 * response identity. A genuine answer therefore cannot satisfy both conditions.
 *
 * This is a READ-side exclusion. It does not rewrite stored records.
 */
export function isLegacyLeadingUiWelcome(messages, index) {
  const message = messages?.[index];
  if (!message || message.role !== 'assistant') return false;
  if (message.messageKind && !UI_ONLY_KINDS.has(message.messageKind)) return false;
  if (hasResponseOwnership(message)) return false;

  const firstUserTurnIndex = messages.findIndex((m) => m && m.role === 'user');
  // No user turn at all means nothing canonical exists yet, so a lone assistant
  // message here is the welcome placeholder rather than history.
  if (firstUserTurnIndex === -1) return true;
  return index < firstUserTurnIndex;
}

/**
 * The canonical conversation: real turns only.
 *
 * @param {Array} messages
 * @param {object} [options]
 * @param {boolean} [options.includeLegacyRecognition]
 *        On the READ path, also exclude unmarked legacy leading chrome. On the
 *        WRITE path this stays false: new writes carry markers, and a write-time
 *        heuristic could drop a real turn.
 */
export function selectCanonicalConversation(messages = [], { includeLegacyRecognition = false } = {}) {
  return messages.filter((message, index) => {
    if (isDeclaredUiOnly(message)) return false;
    if (includeLegacyRecognition && isLegacyLeadingUiWelcome(messages, index)) return false;
    return true;
  });
}

/** Bounded, non-mutating summary — used by acceptance evidence and tests. */
export function describeConversationOwnership(messages = []) {
  const canonical = selectCanonicalConversation(messages, { includeLegacyRecognition: true });
  return {
    totalMessages: messages.length,
    canonicalMessages: canonical.length,
    canonicalUserTurnCount: canonical.filter((m) => m.role === 'user').length,
    canonicalAssistantTurnCount: canonical.filter((m) => m.role === 'assistant').length,
    declaredUiOnlyCount: messages.filter(isDeclaredUiOnly).length,
    legacyRecognisedUiOnlyCount: messages.filter(
      (m, i) => !isDeclaredUiOnly(m) && isLegacyLeadingUiWelcome(messages, i)
    ).length,
    kinds: messages.map(classifyMessageKind),
  };
}
