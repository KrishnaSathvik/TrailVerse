'use strict';

/**
 * The single production email-format contract used by the User schema and all
 * evaluation fixtures. Keep the existing production syntax deliberately: this
 * repair removes drift without broadening signup behavior.
 */
const PRODUCTION_EMAIL_REGEX = /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/;
const MAX_EMAIL_LENGTH = 254;

function validateProductionEmail(value) {
  if (typeof value !== 'string' || value.length === 0) {
    return { ok: false, code: 'email_required' };
  }
  if (value.length > MAX_EMAIL_LENGTH) {
    return { ok: false, code: 'email_too_long' };
  }
  if (!PRODUCTION_EMAIL_REGEX.test(value)) {
    return { ok: false, code: 'invalid_email_format' };
  }
  return { ok: true, code: null };
}

module.exports = {
  PRODUCTION_EMAIL_REGEX,
  MAX_EMAIL_LENGTH,
  validateProductionEmail,
};
