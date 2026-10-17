# Application index provisioning

Automatic Mongoose index and collection creation remain disabled (`autoIndex: false`, `autoCreate: false`). Required indexes come from every model in `server/src/models/*.js`, including models not imported by the current routes.

## Startup contract

- **Production and remote databases:** startup only verifies indexes. Missing or incompatible indexes reject `connectDB()` before HTTP/WebSocket listening, schedulers, or provider warm-up start. Provision indexes explicitly before deploying this server change.
- **Local non-production databases:** startup explicitly creates missing schema indexes, verifies them, then accepts traffic. A remote development-host override does not permit automatic index provisioning.
- Verification uses installed Mongoose's read-only `diffIndexes()` to check ordered compound keys, uniqueness, sparse/partial filters, TTL duration and normalized text indexes. Existing extra indexes are preserved. Verification runs once at startup, not per request.

## Commands

From `server/`:

```bash
npm run indexes:inventory   # no DB connection; full schema key/options inventory
npm run indexes:check       # read-only DB inspection; nonzero exit if not ready
npm run indexes:apply       # explicitly create missing indexes, then verify
```

`--check` and `--apply` use `MONGODB_URI` from the process or existing server `.env` and enforce the existing Mongo target guard. They do not write environment files or call providers. Use the intended environment explicitly; no production provisioning was performed as part of this correction.

Review the check output before applying to an existing database. Creating a unique index can fail on duplicate data. Creating a missing TTL index enables expiration of old records. An existing incompatible index (including a changed TTL duration) can require a separately reviewed migration. This tool does **not** delete duplicate documents, drop/rebuild indexes, call `syncIndexes`, or use `collMod` to change retention. Failure exits nonzero; any earlier successfully created indexes remain, so the additive operation can be rerun after resolving the conflict.

The inventory removes one conflicting redundant plain `AnonymousSession.anonymousId` declaration; the field-level unique declaration remains. Analytics' two differently filtered TTL indexes are intentionally distinct. All existing retention values and business indexes are preserved.

## Inventory

This snapshot has **35 models and 161 declared indexes**, excluding implicit `_id` indexes. Run `indexes:inventory` for exact ordered keys and all options; the executable inventory is generated from the schemas rather than a separately maintained index allowlist. New model files are included automatically.

| Model | Index count | Unique constraints | TTL constraints (seconds) |
| --- | ---: | --- | --- |
| AccountErasureJob | 4 | `erasureId` | `auditExpiresAt`: 0 |
| Analytics | 4 | — | `timestamp`: 604800 (partial: analytics_api_call_ttl); `timestamp`: 604800 (partial: analytics_general_ttl) |
| AnalyticsSnapshot | 1 | `grain, periodKey` | — |
| AnonymousSession | 2 | `anonymousId` | `lastActivity`: 172800 |
| BlogPost | 9 | `slug` | — |
| Comment | 7 | — | — |
| Conversation | 5 | — | — |
| DailyFeed | 6 | `userId, date`; `date, isShared` (partial) | `expiresAt`: 0 |
| DestinationPick | 4 | `sessionId` | — |
| Event | 9 | — | — |
| Favorite | 7 | `user, parkCode` | — |
| Feedback | 9 | — | — |
| ImageUpload | 6 | `filename` | — |
| NpsSnapshot | 1 | `key` | — |
| ParkReview | 6 | `parkCode, userId` (partial) | — |
| ParkSnapshot | 1 | `key` | — |
| SiteSettings | 0 | — | — |
| Subscriber | 4 | `email` | — |
| Testimonial | 9 | — | — |
| TrailieAiTurn | 6 | `responseId` | `createdAt`: 2592000 |
| TrailieConversationPlan | 2 | `userId` | `updatedAt`: 604800 |
| TrailieEntity | 8 | `entityId` | — |
| TrailieEvidence | 8 | `evidenceId`; `canonicalKey`; `logicalKey, isCurrent` (partial) | `retention.deleteAfter`: 0 |
| TrailieEvidenceConflict | 3 | `conflictId` | — |
| TrailieEvidenceRaw | 3 | `rawId` | `deleteAfter`: 0 |
| TrailieEvidenceRefreshEvent | 3 | `refreshEventId` | — |
| TrailieEvidenceRefreshLease | 2 | `leaseKey` | `expiresAt`: 0 |
| TrailieProseRecoveryLease | 2 | `userId, responseId` | `expiresAt`: 0 |
| TrailieReviewJob | 7 | `jobId`; `idempotencyKey` | `payloadExpiresAt`: 0 |
| TrailieReviewTelemetry | 3 | `responseId, contentHash, itineraryHash, reviewerVersion` | — |
| TrailieTurnPersistence | 2 | `responseId` | `observedAt`: 2592000 |
| TripPlan | 5 | `shareId` (sparse) | — |
| User | 5 | `email` | — |
| UserPreferences | 3 | `user` | — |
| VisitedPark | 5 | `user, parkCode` | — |

The remaining indexes cover query paths, including text search on BlogPost/Event/Testimonial and sparse provider identifiers plus geospatial location on TrailieEntity. No schema index is excluded from provisioning or readiness verification.

## Qualification

The unchanged post-merge audit probe, rerun against disposable MongoDB 7.0.14, confirms unique `DestinationPick.sessionId`, unique `AnonymousSession.anonymousId`, and `lastActivity` TTL of 172800 seconds. Both duplicate inserts fail with code 11000; eight concurrent calls to the existing `findOrCreateSession()` method leave exactly one stored session. Racing callers may still receive duplicate-key errors, as before the merge; changing that method's retry behavior is outside this correction.

Tests additionally cover idempotence (zero create calls on a provisioned DB), read-only refusal of a fresh DB, wrong unique/sparse/partial/TTL options, duplicate existing data, preservation of extra indexes, local/remote permissions, and the real startup module's listener/scheduler ordering. Tests use disposable databases and block live providers. Existing production index inventory and browser/ChatGPT acceptance remain unverified.
