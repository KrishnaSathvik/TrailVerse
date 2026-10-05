'use strict';

/**
 * Stage 14.8G §3 — local authenticated test-account fixture.
 *
 * The account is materialized by calling the REAL signup route on the isolated
 * acceptance backend, not by hand-writing a document. That is the point: the
 * password hashing contract, the User schema, the email validator and the
 * controller's own persistence order are all the production ones, so a later
 * login proves the production mechanism rather than a fixture that happens to
 * agree with it.
 *
 * No verification email leaves the machine: RESEND_API_KEY is absent from the
 * acceptance backend's environment, so the email client accessor fails closed
 * at construction and signup tolerates the failure exactly as it does in
 * production. Zero network attempts, no Atlas, no real mailbox.
 *
 * SECRET HANDLING
 *   The credential is read from the environment at runtime and never leaves it:
 *   not into a source file, not into an artifact, not into a log line, not into
 *   a report. Everything this script emits is a boolean, a count or a hash
 *   algorithm identifier.
 *
 *     STAGE14_8G_TEST_EMAIL     required
 *     STAGE14_8G_TEST_PASSWORD  required
 *
 *   `--ephemeral` generates a random password instead of requiring one, for the
 *   case where no operator credential is supplied. The generated value is used
 *   in-process only and written to a 0600 runtime file outside the repository
 *   so the browser driver can read it back within the same run.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const BACKEND = process.env.STAGE14_8G_BACKEND || 'http://127.0.0.1:5101';
const MONGODB_URI = process.env.MONGODB_URI;
const OUT_DIR = process.env.STAGE14_8G_OUT_DIR
  || path.resolve(__dirname, '..', '..', 'artifacts', 'stage14_8G-auth-login');
const SECRET_FILE = process.env.STAGE14_8G_SECRET_FILE;
const EPHEMERAL = process.argv.includes('--ephemeral');

if (!/^mongodb:\/\/127\.0\.0\.1:\d+\//.test(MONGODB_URI || '')) {
  console.error('[stage14_8G] refusing to run: MONGODB_URI is not an isolated loopback database');
  process.exit(1);
}

const email = process.env.STAGE14_8G_TEST_EMAIL;
let password = process.env.STAGE14_8G_TEST_PASSWORD;

if (!email) {
  console.error('[stage14_8G] STAGE14_8G_TEST_EMAIL is required');
  process.exit(1);
}
if (!password && EPHEMERAL) {
  // Base64url of 24 random bytes: satisfies the 6-character schema minimum with
  // a very wide margin and never appears in any persisted artifact.
  password = crypto.randomBytes(24).toString('base64url');
  if (SECRET_FILE) {
    fs.writeFileSync(SECRET_FILE, password, { mode: 0o600 });
  }
}
if (!password) {
  console.error('[stage14_8G] STAGE14_8G_TEST_PASSWORD is required (or pass --ephemeral)');
  process.exit(1);
}

const write = (name, data) =>
  fs.writeFileSync(path.join(OUT_DIR, name), `${JSON.stringify(data, null, 2)}\n`);

/** Non-reversible label for an email, so artifacts can correlate without storing it. */
const emailFingerprint = crypto.createHash('sha256').update(email).digest('hex').slice(0, 16);

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  await mongoose.connect(MONGODB_URI);
  const users = mongoose.connection.db.collection('users');

  const before = {
    userDocuments: await users.countDocuments(),
    matchingUserExists: (await users.countDocuments({ email: email.toLowerCase() })) > 0,
  };

  let signup = { attempted: false, status: null, ok: null, bodyShape: null };

  if (!before.matchingUserExists) {
    signup.attempted = true;
    const response = await fetch(`${BACKEND}/api/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        firstName: 'Acceptance',
        lastName: 'Fixture',
        email,
        password,
      }),
    });
    signup.status = response.status;
    let body = null;
    try { body = await response.json(); } catch { /* shape recorded as null */ }
    signup.ok = response.ok;
    // Shape only: the response echoes the account's email, which is not retained.
    signup.bodyShape = body
      ? {
        success: body.success ?? null,
        emailSent: body.emailSent ?? null,
        hasEmailError: Boolean(body.emailError),
        error: body.error ?? null,
        code: body.code ?? null,
        // Field PATHS only — the handler is careful never to echo submitted values.
        invalidFields: body.fields ?? null,
        dataKeys: body.data ? Object.keys(body.data).sort() : null,
        isEmailVerified: body.data?.isEmailVerified ?? null,
      }
      : null;
  }

  const doc = await users.findOne({ email: email.toLowerCase() });

  // ── the password-at-rest contract, verified against the real hash ──
  const stored = doc?.password || '';
  const bcryptShape = /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/.test(stored);
  const comparesTrue = stored ? await bcrypt.compare(password, stored) : false;

  const evidence = {
    testId: 'stage14_8G-auth-login',
    step: 'fixture',
    generatedAt: new Date().toISOString(),
    mongoUri: MONGODB_URI,
    backend: BACKEND,

    fixtureMethod: signup.attempted
      ? 'real_signup_route_on_isolated_acceptance_backend'
      : 'preexisting_local_user_reused',
    signup,

    localTestUserCreated: Boolean(doc),
    credentialSource: EPHEMERAL && !process.env.STAGE14_8G_TEST_PASSWORD
      ? 'runtime_generated_ephemeral_secret'
      : 'operator_supplied_runtime_secret',
    emailFingerprintSha256Prefix: emailFingerprint,

    userDocument: doc
      ? {
        idPresent: Boolean(doc._id),
        namePresent: Boolean(doc.name),
        firstNamePresent: Boolean(doc.firstName),
        lastNamePresent: Boolean(doc.lastName),
        emailStoredLowercase: doc.email === email.toLowerCase(),
        role: doc.role,
        isEmailVerified: doc.isEmailVerified,
        emailVerificationTokenPresent: Boolean(doc.emailVerificationToken),
        savedParksCount: (doc.savedParks || []).length,
        tokenUsagePresent: Boolean(doc.tokenUsage),
      }
      : null,

    passwordContract: {
      passwordPersistedInPlaintext: stored === password,
      storedValueIsBcryptHash: bcryptShape,
      hashAlgorithm: bcryptShape ? stored.slice(0, 4) : null,
      bcryptCostFactor: bcryptShape ? Number(stored.slice(4, 6)) : null,
      // The property that actually matters: the production comparison method
      // accepts the runtime credential against what was persisted.
      comparePasswordAcceptsCredential: comparesTrue,
    },

    databaseBefore: before,
    databaseAfter: {
      userDocuments: await users.countDocuments(),
      tripPlanDocuments: await mongoose.connection.db.collection('tripplans').countDocuments(),
      anonymousSessionDocuments: await mongoose.connection.db
        .collection('anonymoussessions').countDocuments(),
    },
  };

  write('fixture-evidence.json', evidence);
  console.log(JSON.stringify(evidence, null, 2));

  await mongoose.disconnect();

  if (!evidence.localTestUserCreated || !comparesTrue) {
    console.error('[stage14_8G] STAGE14_8G_BLOCKED_AUTH_FIXTURE — local account is not usable for login');
    process.exitCode = 2;
  }
}

main().catch((error) => {
  // The message is the library's, never the credential.
  console.error('[stage14_8G] fixture failed:', error.message);
  process.exitCode = 1;
});
