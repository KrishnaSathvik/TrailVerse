'use strict';

/**
 * Stage 14.8G.2 §7/§8 — give the local acceptance fixture its own credential.
 *
 * Stage 14.8G materialized the local fixture with the operator's real account
 * password. That password is now revoked material: it sat in a published commit.
 * The local acceptance database must not depend on a real account secret at all,
 * so the fixture gets a freshly generated, acceptance-only password.
 *
 * The change goes through the REAL model path — load the document, assign
 * `password`, save — so the production hashing contract (and the hook repaired
 * in Stage 14.8G.1) is what produces the stored value. No hand-written hash, no
 * direct collection update.
 *
 * The new value is written to a 0600 file OUTSIDE the repository and is never
 * printed, never committed, and never placed in an artifact. Evidence is limited
 * to booleans, the bcrypt cost factor, and non-reversible fingerprints.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const MONGODB_URI = process.env.MONGODB_URI;
const OUT_DIR = process.env.STAGE14_8G2_OUT_DIR
  || path.resolve(__dirname, '..', '..', 'artifacts', 'stage14_8G2-credential-containment');
const NEW_SECRET_FILE = process.env.STAGE14_8G2_SECRET_FILE;
const OLD_SECRET_FILE = process.env.STAGE14_8G2_OLD_SECRET_FILE;
const EMAIL = process.env.STAGE14_8G_TEST_EMAIL;

if (!/^mongodb:\/\/127\.0\.0\.1:\d+\//.test(MONGODB_URI || '')) {
  console.error('[stage14_8G2] refusing to run: MONGODB_URI is not an isolated loopback database');
  process.exit(1);
}
if (!NEW_SECRET_FILE || !EMAIL) {
  console.error('[stage14_8G2] STAGE14_8G2_SECRET_FILE and STAGE14_8G_TEST_EMAIL are required');
  process.exit(1);
}

const User = require('../src/models/User');

/** Acceptance-only, generated here, never derived from any real credential. */
const newPassword = `acc-${crypto.randomBytes(24).toString('base64url')}`;
const oldPassword = OLD_SECRET_FILE && fs.existsSync(OLD_SECRET_FILE)
  ? fs.readFileSync(OLD_SECRET_FILE, 'utf8')
  : null;

const fingerprint = (value) =>
  crypto.createHash('sha256').update(`stage14_8G2:${value}`).digest('hex').slice(0, 16);

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  await mongoose.connect(MONGODB_URI);

  const email = EMAIL.toLowerCase();
  const before = await User.findOne({ email }).select('+password');
  if (!before) {
    console.error('[stage14_8G2] local fixture user not found');
    process.exitCode = 2;
    await mongoose.disconnect();
    return;
  }

  const hashBefore = before.password;
  const oldAcceptedBeforeRotation = oldPassword
    ? await bcrypt.compare(oldPassword, hashBefore)
    : null;

  // ── the real password-change path ──
  before.password = newPassword;
  await before.save();

  const after = await User.findOne({ email }).select('+password');
  const hashAfter = after.password;
  const bcryptShape = /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/.test(hashAfter);

  const oldStillAccepted = oldPassword ? await after.comparePassword(oldPassword) : null;
  const newAccepted = await after.comparePassword(newPassword);

  // Runtime-only handoff for the Stage 14.8H driver.
  fs.writeFileSync(NEW_SECRET_FILE, newPassword, { mode: 0o600 });
  const mode = (fs.statSync(NEW_SECRET_FILE).mode & 0o777).toString(8);

  const evidence = {
    testId: 'stage14_8G2-credential-containment',
    step: 'local-acceptance-credential',
    generatedAt: new Date().toISOString(),
    mongoUri: MONGODB_URI,

    credentialScope: 'local_stage14_8_acceptance_only',
    reusedProductionCredential: false,
    reusedExposedCredential: false,
    generatedAtRuntime: true,
    persistedPlaintext: hashAfter === newPassword,
    storedValueIsBcryptHash: bcryptShape,
    bcryptCostFactor: bcryptShape ? Number(hashAfter.slice(4, 6)) : null,

    changeMechanism: 'real model path — document.password assignment followed by save(), exercising the repaired pre(save) hook',
    directCollectionUpdateUsed: false,
    handWrittenHashUsed: false,

    hashChanged: hashAfter !== hashBefore,
    exposedCredentialAcceptedBeforeRotation: oldAcceptedBeforeRotation,
    exposedCredentialAcceptedAfterRotation: oldStillAccepted,
    newCredentialAccepted: newAccepted,

    // Compared against the resolved repository root. A substring test on the
    // project name gave a false negative here, because the session temp
    // directory embeds the project name in its own path.
    secretFileOutsideRepo: !path.resolve(NEW_SECRET_FILE)
      .startsWith(`${path.resolve(__dirname, '..', '..')}${path.sep}`),
    secretFileMode: mode,
    secretStoredInRepository: false,
    secretPrinted: false,
    newCredentialFingerprint: fingerprint(newPassword),
    userDocuments: await User.countDocuments(),
  };

  fs.writeFileSync(
    path.join(OUT_DIR, 'local-credential-rotation.json'),
    `${JSON.stringify(evidence, null, 2)}\n`
  );
  console.log(JSON.stringify(evidence, null, 2));

  await mongoose.disconnect();

  if (!newAccepted || oldStillAccepted === true || evidence.persistedPlaintext) {
    console.error('[stage14_8G2] local credential rotation did not hold');
    process.exitCode = 3;
  }
}

main().catch((error) => {
  console.error('[stage14_8G2] rotation failed:', error.message);
  process.exitCode = 1;
});
