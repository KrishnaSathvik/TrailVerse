/**
 * Pick the assistant message that should show "Want a day-by-day plan?"
 * Server sets `showDayByDayPlanCta` only after open-ended discovery answers.
 */

function hasUserReplyAfter(messages, assistantIndex) {
  return messages.slice(assistantIndex + 1).some((m) => m.role === 'user' && !m.hiddenFromUi);
}

/**
 * @param {Array<{ role: string, id?: number|string, showDayByDayPlanCta?: boolean, isStreaming?: boolean, isFinalizing?: boolean, isConversionMessage?: boolean, hiddenFromUi?: boolean }>} messages
 * @returns {typeof messages[number] | null}
 */
export function findDiscoveryPlanCtaMessage(messages) {
  if (!Array.isArray(messages) || messages.length === 0) return null;

  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const msg = messages[i];
    if (msg.role !== 'assistant' || msg.isStreaming || msg.isFinalizing || msg.isConversionMessage) {
      continue;
    }
    if (hasUserReplyAfter(messages, i)) continue;
    if (msg.showDayByDayPlanCta === true) return msg;
  }

  return null;
}

export function messageMatchesDiscoveryPlanCta(message, target) {
  if (!message || !target) return false;
  if (message.id != null && target.id != null) return message.id === target.id;
  return message === target;
}
