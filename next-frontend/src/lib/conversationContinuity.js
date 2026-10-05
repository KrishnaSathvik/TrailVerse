// Server history wins. A stale subset of it is not a recovery conflict.
export function hasDeviceOnlyHistory(cached = [], server = []) {
  let cursor = 0;
  for (const message of cached) {
    while (cursor < server.length && (server[cursor].role !== message.role || server[cursor].content !== message.content)) cursor++;
    if (cursor === server.length) return true;
    cursor++;
  }
  return false;
}
export function conversationSendBlocked({ generating, recovering, recoveryPending, restoreStatus }) {
  return Boolean(generating || recovering || recoveryPending || ['pending','error'].includes(restoreStatus));
}
