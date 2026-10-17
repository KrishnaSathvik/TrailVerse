# Archive/restore deployment compatibility

The production frontend bundle inspected on October 17 sends status-only PUT requests to `/api/trips/:id`. The release frontend's trip service uses PATCH `/api/trips/:id/metadata` with the same status values. Both formats are covered by focused controller regression tests.

The compatibility branch accepts only an exact one-field body containing status `active` or `archived`, from a trip already in either state. It retains the route's authentication and controller ownership check, and atomically predicates the update on trip ID, owner and observed status. Only status is written. Deleted trips and concurrent state changes cannot be restored through this branch. Repeating the current status is allowed.

Mixed response/status bodies do not use this branch. Canonical identity/revision gates, stale response rejection and rejection of plan-only PUT writes remain intact. The dedicated metadata route is unchanged.

Validation: 38 focused controller/manual-mutation tests passed, including old-format archive/restore, invalid status, non-owner access, deleted-state rejection, concurrent state change, stale itinerary writes and the new metadata contract. Provider counters were zero. The complete local One-Brain runner passed. The bounded compatibility claim is for these status-management API contracts; it does not assert that arbitrary old itinerary editors can bypass the release's canonical mutation protections.

Rollout: manually deploy the corrected backend commit, confirm health, then merge PR #48. Keep MCP auto-deploy enabled and let MCP/Vercel deploy from master. No hosted settings were changed and no deployment was initiated for this fix.
