'use strict';

const crypto = require('crypto');
const Subscriber = require('../models/Subscriber');
const resendEmailService = require('./resendEmailService');
const beehiivSync = require('./beehiivSync');
const { isValidNewsletterSource } = require('../constants/newsletterSources');
const {
  CONSENT_VERSION_WHERE_NEXT_V1,
  CONFIRM_TOKEN_TTL_MS,
  GENERIC_SUBSCRIBE_MESSAGE,
} = require('../constants/subscriberStatus');

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeEmail(email) {
  return String(email || '').toLowerCase().trim();
}

function isValidEmail(email) {
  return EMAIL_REGEX.test(email);
}

function clientBaseUrl() {
  return process.env.CLIENT_URL || 'https://www.nationalparksexplorerusa.com';
}

function confirmUrlFor(subscriber) {
  return `${clientBaseUrl()}/api/subscribers/confirm/${subscriber.confirmToken}`;
}

function effectiveStatus(doc) {
  return Subscriber.effectiveStatus(doc);
}

function isBlocked(doc) {
  const status = effectiveStatus(doc);
  return status === 'unsubscribed' || status === 'suppressed';
}

function isSubscribed(doc) {
  return effectiveStatus(doc) === 'subscribed';
}

function isPending(doc) {
  return effectiveStatus(doc) === 'pending';
}

function optionalString(value) {
  if (value == null) return undefined;
  const trimmed = String(value).trim();
  return trimmed.length ? trimmed : undefined;
}

function confirmTokenIsExpired(doc) {
  if (!doc.confirmTokenExpires) return false;
  return new Date(doc.confirmTokenExpires).getTime() < Date.now();
}

async function sendConfirmation(subscriber) {
  await resendEmailService.sendNewsletterConfirmation({
    firstName: subscriber.firstName || 'there',
    email: subscriber.email,
    confirmUrl: confirmUrlFor(subscriber),
  });
}

async function refreshConfirmToken(subscriber) {
  subscriber.confirmToken = crypto.randomUUID();
  subscriber.confirmTokenExpires = new Date(Date.now() + CONFIRM_TOKEN_TTL_MS);
  await subscriber.save();
  return subscriber;
}

function httpError(statusCode, message) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

async function subscribe(input) {
  const email = normalizeEmail(input.email);
  if (!email) {
    throw httpError(400, 'Email is required.');
  }
  if (!isValidEmail(email)) {
    throw httpError(400, 'Invalid email address.');
  }

  const source = input.source || 'blog-listing';
  if (!isValidNewsletterSource(source)) {
    throw httpError(400, 'Invalid source.');
  }

  const existing = await Subscriber.findOne({ email });
  if (existing) {
    if (isBlocked(existing) || isSubscribed(existing)) {
      return { created: false, resent: false, message: GENERIC_SUBSCRIBE_MESSAGE };
    }

    if (isPending(existing) && confirmTokenIsExpired(existing)) {
      await refreshConfirmToken(existing);
    }

    await sendConfirmation(existing);
    return { created: false, resent: true, message: GENERIC_SUBSCRIBE_MESSAGE };
  }

  const subscriber = await Subscriber.create({
    email,
    firstName: optionalString(input.firstName),
    source,
    sourceDetail: optionalString(input.sourceDetail),
    pagePath: optionalString(input.pagePath),
    parkCode: optionalString(input.parkCode),
    category: optionalString(input.category),
    utmSource: optionalString(input.utm_source || input.utmSource),
    utmMedium: optionalString(input.utm_medium || input.utmMedium),
    utmCampaign: optionalString(input.utm_campaign || input.utmCampaign),
    status: 'pending',
    confirmed: false,
    consentVersion: CONSENT_VERSION_WHERE_NEXT_V1,
    confirmTokenExpires: new Date(Date.now() + CONFIRM_TOKEN_TTL_MS),
  });

  await sendConfirmation(subscriber);
  return { created: true, resent: false, message: GENERIC_SUBSCRIBE_MESSAGE };
}

function confirmRedirect(query) {
  return `/newsletter?${query}`;
}

async function confirmByToken(token) {
  if (!token) {
    return { redirect: confirmRedirect('subscribe_error=invalid') };
  }

  const subscriber = await Subscriber.findOne({ confirmToken: token });
  if (!subscriber) {
    return { redirect: confirmRedirect('subscribe_error=invalid') };
  }

  if (isBlocked(subscriber)) {
    return { redirect: confirmRedirect('subscribe_error=invalid') };
  }

  if (isPending(subscriber) && confirmTokenIsExpired(subscriber)) {
    return { redirect: confirmRedirect('subscribe_error=expired') };
  }

  if (isSubscribed(subscriber)) {
    await beehiivSync.syncSubscriber(subscriber);
    return { redirect: confirmRedirect('subscribed=true') };
  }

  const now = new Date();
  subscriber.status = 'subscribed';
  subscriber.confirmed = true;
  if (!subscriber.confirmedAt) subscriber.confirmedAt = now;
  await subscriber.save();
  await beehiivSync.syncSubscriber(subscriber);

  return { redirect: confirmRedirect('subscribed=true') };
}

async function unsubscribeByToken(token) {
  if (!token) {
    return { redirect: '/newsletter?unsubscribe_error=invalid' };
  }

  const subscriber = await Subscriber.findOne({ unsubscribeToken: token });
  if (!subscriber) {
    return { redirect: '/newsletter?unsubscribe_error=invalid' };
  }

  if (effectiveStatus(subscriber) !== 'unsubscribed') {
    subscriber.status = 'unsubscribed';
    subscriber.unsubscribedAt = new Date();
    subscriber.confirmed = false;
    subscriber.confirmToken = crypto.randomUUID();
    subscriber.confirmTokenExpires = new Date(Date.now() - 1000);
    await subscriber.save();
  }

  await beehiivSync.unsubscribeSubscriber(subscriber);

  return { redirect: '/newsletter?unsubscribed=true' };
}

module.exports = {
  subscribe,
  confirmByToken,
  unsubscribeByToken,
  GENERIC_SUBSCRIBE_MESSAGE,
};
