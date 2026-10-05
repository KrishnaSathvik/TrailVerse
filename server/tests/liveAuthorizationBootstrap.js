'use strict';

const { assertLiveTestsAuthorized } = require('../src/config/providerTestPolicy');

assertLiveTestsAuthorized(process.env);
process.env.TRAILIE_TEST_PROVIDER_MODE = 'allow_live';

