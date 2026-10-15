#!/usr/bin/env node
// Local rendering only: no database, environment file, or email delivery service.
const fs = require('node:fs/promises');
const path = require('node:path');
const renderer = require('../src/services/reactEmailRenderer');

const templates = [
  ['welcome', 'renderWelcomeEmail'],
  ['email-verification', 'renderVerificationEmail'],
  ['password-reset', 'renderPasswordResetEmail'],
  ['blog-notification', 'renderNewBlogEmail'],
  ['unsubscribe', 'renderUnsubscribeEmail'],
  ['admin-notification', 'renderAdminNotificationEmail'],
  ['account-deletion', 'renderAccountDeletionEmail'],
  ['feature-announcement', 'renderFeatureAnnouncementEmail'],
  ['newsletter-confirm', 'renderNewsletterConfirmEmail'],
];

async function main() {
  for (const [name, method] of templates) {
    const html = await renderer[method]({ username: 'Alex', firstName: 'Alex', userEmail: 'alex@example.com' });
    if (!html.includes('<!DOCTYPE') || !html.includes('TrailVerse')) {
      throw new Error(`Invalid rendered email: ${name}`);
    }
    await fs.writeFile(path.join(__dirname, '../templates/emails', `preview-${name}.html`), html);
    console.log(`Rendered ${name}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
