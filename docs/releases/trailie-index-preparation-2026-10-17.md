# Approved production index preparation

Owner approval covered exactly 13 missing definitions from the read-only production inventory, while preserving existing analytics retention, blog search weights and all extra indexes.

Before creating any index, the production connection was retrieved directly from the Render backend configuration without printing credentials. All three target collections were rechecked as empty; their existing indexes and the release definitions matched the inventory exactly. No blanket provisioning command was used.

Created:
- `trailie_conversation_plans`: unique `userId`; seven-day TTL on `updatedAt` (2).
- `trailie_entities`: unique `entityId`; `aliases/entityType`; `aliasesNormalized/entityType`; sparse `providerIds.npsParkCode`, `providerIds.ridbRecAreaId`, `providerIds.googlePlaceId`, `providerIds.gtfsAgencyId`; sparse 2dsphere `location` (8).
- `trailie_evidence_conflicts`: unique `conflictId`; `entityId/topic/scopeHash/status`; `evidenceIds` (3).

Every pre-existing index was compared after creation and remained identical. No data update/delete, index drop/rebuild, collMod, deployment, merge or hosted-setting change was performed.

Release schema alignment preserves general analytics TTL at 30 days and its existing event-type filter (excluding crowd_calendar_view), API-call TTL at seven days, and blog text weights at 1/1/1. The manual purge script shares the aligned 30-day default and TTL scope. No scheduled analytics deletion job was found in application code. The separate explicit seven-day retention migration preview remains read-only and unapplied; this release does not approve its proposal.

The post-change production `npm run indexes:check` exited 0 with `ready: true, missing: []`. Extra pre-existing indexes remain in place. Focused index/schema tests: 13 passed, zero live provider calls. Full local One-Brain verification: PASS.

The next backend deployment must use this schema-alignment commit rather than e6989505. Deployment and merging remain paused for owner review of the post-change result.
