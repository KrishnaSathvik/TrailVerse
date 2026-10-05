# Trailie conversation continuity

A conversation visible to the traveler must be the same conversation available to the model. The UI must never display a restored message history while continuing against an unrelated or empty backend conversation.

## Authority and restoration

- Guest `AnonymousSession.messages` and authenticated `TripPlan.conversation` are authoritative. Browser storage is a cache, not an independent model-history source.
- Startup reconnects using the session/trip ID and reads fresh server history. Sending is blocked during restoration and after a failed fetch. Server messages replace cached messages; they are not merged by text.
- Server retention controls guest continuity. A browser timestamp must not discard a still-valid server conversation.
- A stale subset of server history needs no recovery. Device-only messages are kept in a local recovery archive, shown for review, and require a choice before sending resumes.
- Explicit guest recovery imports a bounded, alternating user/assistant text prefix once. It requires the expected server history hash, preserves an exact existing server suffix, and atomically rejects concurrent changes, pending turns, converted sessions, and repeated imports.
- Recovery never imports browser plans, coordinates, provenance, response identities, traveler state, system roles, or quota claims. Existing server state and quota are untouched. Imported text is marked `historyOrigin: device_recovery`; it is historical conversation, not verified travel evidence.
- An authenticated cache without a conversation ID is archived and explicitly identified as an unlinked backup; it is not shown as the active conversation. It is not automatically imported.

## Login handoff

Guest conversation, verified canonical plan/hash, and planning state migrate in one MongoDB transaction. The guest conversion stores the resulting trip ID. Retries by the same owner return that ID; another owner cannot claim it. A pending response blocks migration. Failed writes roll back both documents.

This requires transaction-capable MongoDB (replica set/Atlas). There is no non-atomic fallback.

## Model input

The existing runtime reads recent server history (at most 40 messages and 24,000 characters), alongside canonical trip and traveler memory once. History remains available when neither canonical trip nor traveler memory exists. Older visible messages can be outside that documented context window; this patch does not promise unlimited model memory.

## Verification boundary

Offline tests exercise recovery persistence, concurrency, model input with/without a trip, atomic migration/rollback, frontend send gating, and existing auth/render regressions. Real browser reload/login clicks and a live follow-up are separate acceptance checks; no live model/provider call is needed for these tests.
