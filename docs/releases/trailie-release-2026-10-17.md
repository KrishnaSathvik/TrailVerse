# Trailie release candidate — 2026-10-17

Prepared on `release/trailie-acceptance-2026-10-17` from integration baseline `6392da99f61246c4043ba8f87fddbd299d40cc1c`. At preparation, master was `324faaaf68334db41ded82b8d8c777f6fd5de76a`, 26 commits behind that baseline. This is a release of the assembled model-first Trailie baseline plus acceptance fixes, not merely a hotel-adapter PR.

## Included acceptance changes

- General duration feedback and multi-destination identity/recovery; safe commit and hotel-change constraints.
- Guest-to-login recovery and trip preservation, existing five-user-message allowance and single guest conversation.
- Single contextual Things to Know section, verified campground/permit/travel links and strict URL evidence checks.
- Hotel shortlist preservation using structured addresses, count-only discovery diagnostics, and bounded exact-property extraction ranking.
- Chat page scrolling/composer, account dialog and trip-guidance presentation fixes.
- Regression fixtures and tests. One test now creates its output directory, so clean checkouts do not depend on prior generated artifacts.

The original development worktree remains intact. The [scope manifest](trailie-release-scope-2026-10-17.json) lists included and excluded uncommitted paths. Mixed runtime/chat files were edited in the isolated candidate to remove only the conversational answer-stream experiment. Existing draft-preview switches remain unchanged and default-off.

Excluded: the uncommitted answer-stream experiment and its tests; My Trips redesign and related list changes; homepage/landing changes; park-tab scrollbar CSS; generated test artifacts; unapproved CI/security-exception changes. Existing committed CI and dependency controls remain unchanged. No dependency audit waiver is implied by this release request.

## Acceptance evidence and limits

Previously captured five-day Zion/Bryce live itinerary preserved both parks, one hotel change and identical returned/saved plans with no correction rounds. RIDB authentication and campground/permit lookup passed. Exact Upper Pines reservation-page delivery and one named hotel booking page have live provider evidence. The latest hotel shortlist/ranking fix is **offline-verified only**. Do not describe broad hotel discovery as freshly verified against Serper. Links do not prove date-specific inventory or prices.

The isolated candidate passed the full One-Brain gate, including canonical commit, MCP parity and public export. Selected backend suites passed 194 unique tests after restoring their required captured fixture; frontend selected suites passed 91 tests. No live model/provider requests were made during candidate preparation.

## Permitted publication and deployment

Current master protection requires an up-to-date `security` status and one independent approval, dismisses stale approvals, requires approval of the latest push and applies to administrators. Publish this branch as a PR. Do not bypass checks, self-approve or change branch protection. Earlier audit reports record unresolved development findings; this release does not activate the separate uncommitted exception proposal.

Read-only Render inspection confirmed backend `srv-d3il0cpr0fns73cvjq0g` uses master with manual deployment and MCP `srv-d7kql4navr4c73e3gth0` auto-deploys master commits. Both have previews off. Before an approved merge, coordinate MCP auto-deploy with the backend rollout so the services use the intended commit. The committed MCP blueprint already specifies `PLAN_TRIP_TIMEOUT=180` and `BACKEND_TIMEOUT=30`; saved/live runtime settings must still be verified during rollout. Do not assume a blueprint value is the running setting.

After required review/checks: deploy the exact approved backend/MCP revision in the coordinated order, verify effective planning timeout 180, then confirm Vercel's frontend revision and production status. Run only a brief bounded smoke on the deployed candidate and record immutable deployment IDs. Until then, production and hosted settings remain unchanged.
