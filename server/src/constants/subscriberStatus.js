'use strict';

const SUBSCRIBER_STATUSES = ['pending', 'subscribed', 'unsubscribed', 'suppressed'];
const BLOCKED_SUBSCRIBER_STATUSES = ['unsubscribed', 'suppressed'];

const CONSENT_VERSION_WHERE_NEXT_V1 = 'where-next-v1';
const CONFIRM_TOKEN_TTL_MS = 48 * 60 * 60 * 1000;

const GENERIC_SUBSCRIBE_MESSAGE =
  'If this email is not yet subscribed, a confirmation link has been sent.';

function isBlockedSubscriberStatus(status) {
  return BLOCKED_SUBSCRIBER_STATUSES.includes(status);
}

function isSubscribedStatus(status) {
  return status === 'subscribed';
}

module.exports = {
  SUBSCRIBER_STATUSES,
  BLOCKED_SUBSCRIBER_STATUSES,
  CONSENT_VERSION_WHERE_NEXT_V1,
  CONFIRM_TOKEN_TTL_MS,
  GENERIC_SUBSCRIBE_MESSAGE,
  isBlockedSubscriberStatus,
  isSubscribedStatus,
};
