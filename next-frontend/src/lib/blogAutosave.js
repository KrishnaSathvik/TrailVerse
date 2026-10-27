/**
 * Admin blog editor autosave policy.
 *
 * Autosave must never change a post's lifecycle (status / schedule / publish
 * date) and must never push half-finished edits to a live article.
 *
 * - New post (not yet created)      → browser draft slot (localStorage).
 * - Existing draft / scheduled post → server save of the editable fields only;
 *                                     `status` and `scheduledAt` are omitted so
 *                                     the server keeps the current lifecycle.
 * - Existing published post         → browser draft slot keyed by post id. The
 *                                     live article only changes on an explicit
 *                                     "Update", which saves while staying published.
 */

export const AUTOSAVE_TARGET = Object.freeze({
  LOCAL: 'local',
  SERVER: 'server',
});

const LIFECYCLE_KEYS = ['status', 'scheduledAt', 'publishedAt'];

export function resolveAutosaveTarget({ isEditMode, postId, serverStatus }) {
  if (!isEditMode || !postId) return AUTOSAVE_TARGET.LOCAL;
  if (serverStatus === 'published') return AUTOSAVE_TARGET.LOCAL;
  return AUTOSAVE_TARGET.SERVER;
}

/** Strip lifecycle fields so a server autosave cannot publish, unpublish or reschedule. */
export function toAutosavePayload(payload) {
  const next = { ...payload };
  for (const key of LIFECYCLE_KEYS) delete next[key];
  return next;
}
