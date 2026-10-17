/**
 * Stage 8.3 — the response auto-save payload for PUT /trips/:id.
 *
 * Carries ONLY response-coupled fields. It deliberately never includes `status`
 * or `title`: a routine or delayed auto-save must not reactivate an archived
 * trip or rename it. Those are changed through the narrow metadata command
 * (PATCH /trips/:id/metadata).
 */
export function buildResponseSavePayload({
  conversation,
  summary,
  plan,
  entryContext = null,
  provider = 'auto',
  // Stage 14.3 — intra-turn compare-and-swap. Present ONLY on a revision-2 write
  // that succeeds a stored revision 1; a direct-terminal write must omit it, or
  // the server rejects it with `expected_revision_but_none_stored`.
  expectedPreviousRevision = null,
} = {}) {
  const payload = { conversation, summary, plan, provider };
  if (entryContext) payload.entryContext = entryContext;
  if (plan && plan.responseVersion != null) {
    payload.expectedPreviousVersion = plan.responseVersion - 1;
  }
  if (expectedPreviousRevision != null) {
    payload.expectedPreviousRevision = expectedPreviousRevision;
  }
  return payload;
}
