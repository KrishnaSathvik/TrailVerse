'use strict';

// Loaded by Jest before every ordinary test module and before any test-local
// dotenv call. Later key loading cannot override this fail-closed policy.
process.env.TRAILIE_TEST_PROVIDER_MODE = 'deny_live';
delete process.env.TRAILIE_ALLOW_LIVE_TESTS;
delete process.env.TRAILIE_LIVE_TEST_ACK;
// Beehiiv is delivery-only; tests must not inherit production keys from a local .env.
delete process.env.BEEHIIV_API_KEY;
delete process.env.BEEHIIV_PUBLICATION_ID;
delete process.env.BEEHIIV_WEBHOOK_SECRET;

