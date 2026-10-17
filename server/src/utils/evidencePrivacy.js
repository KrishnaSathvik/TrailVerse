'use strict';

const SHARED_EVIDENCE_PRIVATE_DATA = 'shared_evidence_private_data';

const PRIVATE_FIELD_NAMES = new Set([
  'userid',
  'user',
  'accountid',
  'sessionid',
  'anonymousid',
  'browserfingerprint',
  'tripid',
  'tripstate',
  'conversationid',
  'conversation',
  'responseid',
  'rawquery',
  'userquery',
  'prompt',
  'messages',
  'formdata',
  'homeaddress',
  'exactorigin',
  'personalcontext',
  'personalconstraints',
  'accessibilityneeds',
  'medicalneeds',
  'hotelshortlist',
  'preferences',
  'email',
  'ipaddress',
  'useragent',
]);

const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;

function privacyError(path, reason) {
  const error = new Error(`Shared evidence rejected at ${path}: ${reason}`);
  error.code = SHARED_EVIDENCE_PRIVATE_DATA;
  error.path = path;
  return error;
}

function inspect(value, path, seen) {
  if (value == null) return;
  if (typeof value === 'string') {
    if (EMAIL_PATTERN.test(value)) throw privacyError(path, 'email-like value');
    return;
  }
  if (typeof value !== 'object') return;
  if (seen.has(value)) throw privacyError(path, 'cyclic object');
  seen.add(value);

  if (Array.isArray(value)) {
    value.forEach((entry, index) => inspect(entry, `${path}[${index}]`, seen));
  } else {
    for (const [key, entry] of Object.entries(value)) {
      if (PRIVATE_FIELD_NAMES.has(key.toLowerCase())) {
        throw privacyError(`${path}.${key}`, 'private field');
      }
      inspect(entry, `${path}.${key}`, seen);
    }
  }
  seen.delete(value);
}

function assertPublicEvidenceWrite({ item, sourceRequest } = {}) {
  if (!item || !sourceRequest) throw privacyError('write', 'item and sourceRequest are required');
  if (item.privacyScope !== 'public' || sourceRequest.privacyScope !== 'public') {
    throw privacyError('privacyScope', 'shared writes must be public');
  }
  inspect(item, 'item', new WeakSet());
  inspect(sourceRequest, 'sourceRequest', new WeakSet());
  return item;
}

module.exports = {
  SHARED_EVIDENCE_PRIVATE_DATA,
  assertPublicEvidenceWrite,
};
