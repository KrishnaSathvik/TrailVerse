'use strict';

/** Must match next-frontend/src/lib/anonymousChatLimits.js ANONYMOUS_MESSAGE_LIMIT */
const ANONYMOUS_USER_MESSAGE_LIMIT = 5;

const ANONYMOUS_SESSION_TTL_SECONDS = 48 * 60 * 60;

module.exports = {
  ANONYMOUS_USER_MESSAGE_LIMIT,
  ANONYMOUS_SESSION_TTL_SECONDS,
};
