# Real authenticated Trailie demo recordings

Scope: replace the existing `/trailie-demo` recordings with five real, three-turn local conversations. No homepage changes, deployment, new playback architecture, or generation on demo views.

## Capture and selection

All conversations started through the authenticated browser at `/plan-ai?entry=new-trip&ask=...`, using the local development database. Follow-ups were submitted through the real chat UI. Raw conversations, per-message canonical plans, final plan/map coordinates and planning state are retained locally under `artifacts/trailie-demo-real-2026-10-06/` (not public fixtures).

The public fixture preserves assistant text verbatim. Its plan fields are allowlisted for the existing playback renderer; private account/conversation identifiers, provider metadata and credentials are excluded. `selected-provenance.json` in the local capture directory records answer SHA-256 digests.

Selected conversations:

- Discovery: the broad October question initially selected June Lake, but its plan failed place resolution/duplicate-stop validation. A fresh run explicitly requesting a U.S. national park selected Shenandoah. The final prompt explicitly supplies a rental car.
- Zion + Bryce: the first attempt could not save a driving plan without authorized car transportation. A fresh run explicitly supplies a rental car in the final question.
- Realistic road trip: retains the three original questions. Trailie warns against the rushed trip, then accommodates the user's insistence with a limited three-park sampler and a return day. It does not claim this is an ideal full visit.
- Yellowstone: the original Lamar Valley request could not save because the structured lookup returned Lamar River, which correctly failed identity matching. The replacement questions focus on Hayden Valley, an established mapped stop, to demonstrate preference continuity and a relaxed final-day edit. One Hayden retry also hit an 8-second place-provider deadline and was rerun fresh. This does not fix or conceal the unresolved Lamar lookup; original captures remain in the local archive.
- Glacier: retains the three original questions. The final edit was retried after fixing the version conflict described below.

## Local quota override

Added `dailyTokenLimitFor` with an explicitly targeted development override. It requires `NODE_ENV=development`, matching `TRAILIE_DAILY_TOKEN_LIMIT_EMAIL`, a loopback MongoDB host, and a positive integer `TRAILIE_DAILY_TOKEN_LIMIT`. Ordinary product limits remain 5,000/day for users. No role promotion, user-record quota change, or production database access.

The temporary 500,000-token environment allowance is used only for these recordings and removed when capture completes. Seven tests cover override eligibility and fallback behavior.

## Save bug found during real capture

An itinerary at response version 1 followed by a plain-text response at version 2 could not accept the next itinerary edit: the store compared against the older plan identity instead of the latest conversation identity. The simple-runtime store now validates against the newer conversation identity in that case, while retaining the real saved plan for write validation and keeping MongoDB compare-and-swap guards unchanged.

The real Glacier retry saved successfully. Five persistence tests pass, including creation → plain answer → bounded plan edit and concurrent-write conflict protection, with zero live provider calls in tests.

## Final validation and cleanup

- Five selected recordings contain three real user/assistant turns each, with final saved plans of 4, 5, 3, 4 and 5 days. Public questions and answers were compared directly against local database exports: all 15 match verbatim.
- 57 frontend tests pass, covering fixture privacy, playback, all recorded turns, zero generation calls, and incomplete-cache recovery. Seven quota override tests and five persistence tests pass.
- Browser playback displayed three assistant answers for each of the five scenarios; no AI requests were made during playback. Desktop (1440px) and mobile (390px) checks found no horizontal overflow.
- Fixed existing playback hydration so an incomplete cached conversation replays its follow-ups instead of being considered complete.
- Removed both temporary environment entries and restarted the local backend. The authenticated token-usage endpoint confirms a 5,000-token daily limit again. The capture account has exhausted today's normal allowance; static demo viewing remains unrestricted. Production policy is unchanged.
- Local capture credentials were deleted after login. No deployment or homepage changes in this pass.
