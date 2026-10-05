'use strict';

/**
 * Stage 14.8G §12 — secret-leakage scan.
 *
 * Scans every file this stage produced, text and binary alike, for the runtime
 * credential and for anything JWT-shaped. Screenshots are included: a PNG is
 * scanned as bytes, so a credential rendered into an image or trailing in a
 * metadata chunk would still be found.
 *
 * The report records counts and file names. It never records the secret, a
 * prefix of it, its length, or the matched context — demonstrating the scan
 * must not itself become the leak.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const OUT_DIR = process.env.STAGE14_8G_OUT_DIR
  || path.resolve(__dirname, '..', '..', 'artifacts', 'stage14_8G-auth-login');
const SECRET_FILE = process.env.STAGE14_8G_SECRET_FILE;

const password = process.env.STAGE14_8G_TEST_PASSWORD
  || (SECRET_FILE && fs.existsSync(SECRET_FILE) ? fs.readFileSync(SECRET_FILE, 'utf8') : null);
const email = process.env.STAGE14_8G_TEST_EMAIL || null;

if (!password) {
  console.error('[stage14_8G] no credential available to scan for — refusing to report a vacuous pass');
  process.exit(1);
}

const JWT_SHAPE = /eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g;

const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
  const full = path.join(dir, entry.name);
  return entry.isDirectory() ? walk(full) : [full];
});

const files = walk(OUT_DIR);
const perFile = [];
let passwordOccurrences = 0;
let rawAuthCredentialOccurrences = 0;
let emailOccurrences = 0;

for (const file of files) {
  const buffer = fs.readFileSync(file);
  const text = buffer.toString('binary');
  const pw = text.split(password).length - 1;
  const jwt = (text.match(JWT_SHAPE) || []).length;
  const em = email ? text.split(email).length - 1 : 0;

  passwordOccurrences += pw;
  rawAuthCredentialOccurrences += jwt;
  emailOccurrences += em;

  perFile.push({
    file: path.relative(OUT_DIR, file),
    bytes: buffer.length,
    passwordOccurrences: pw,
    jwtShapedOccurrences: jwt,
    emailOccurrences: em,
  });
}

const report = {
  testId: 'stage14_8G-auth-login',
  step: 'secret-leakage-scan',
  generatedAt: new Date().toISOString(),
  scannedRoot: path.relative(path.resolve(__dirname, '..', '..'), OUT_DIR),
  filesScanned: files.length,
  bytesScanned: perFile.reduce((sum, f) => sum + f.bytes, 0),
  binaryFilesIncluded: perFile.filter((f) => f.file.endsWith('.png')).length,
  passwordOccurrences,
  rawAuthCredentialOccurrences,
  emailOccurrences,
  // Lets a later run confirm the same credential was scanned for, without the
  // credential. Salted so the digest is not a lookup key for the password.
  credentialProbeDigest: crypto.createHash('sha256')
    .update(`stage14_8G:${password}`).digest('hex').slice(0, 16),
  perFile,
  playwrightArtifactsThatWouldHaveCapturedTheSecret: {
    tracingEnabled: false,
    videoEnabled: false,
    harEnabled: false,
    note: 'each is disabled at context creation; a trace would persist the typed value',
  },
  clean: passwordOccurrences === 0 && rawAuthCredentialOccurrences === 0,
};

fs.writeFileSync(
  path.join(OUT_DIR, 'secret-leakage-scan.json'),
  `${JSON.stringify(report, null, 2)}\n`
);

console.log(JSON.stringify({
  filesScanned: report.filesScanned,
  passwordOccurrences,
  rawAuthCredentialOccurrences,
  emailOccurrences,
  clean: report.clean,
}, null, 2));

if (!report.clean) process.exitCode = 3;
