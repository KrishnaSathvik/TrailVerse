'use strict';

/**
 * Stage 14.7G §10/§16 — private live evidence, and the redaction that keeps it
 * out of the report.
 *
 * Two destinations with two different rules:
 *
 *   writeEvidence()  → artifacts/private/ (gitignored). Raw SSE bytes, parsed
 *                      events, ledger, journals, hashes. Written only after the
 *                      destination is confirmed gitignored, following the same
 *                      discipline as `eval/trailie/privateDraftCapture.js`.
 *
 *   redactForReport() → anything that may be printed or committed. This is a
 *                      DENY-list applied to strings plus an allow-list applied to
 *                      object keys, because the failure that matters is a key or
 *                      token reaching stdout, and stdout is what a human pastes
 *                      into a ticket.
 *
 * Model prose and drafts are real user-facing output under a live run, so they
 * are gated behind the existing private-draft flag rather than written by
 * default (§10).
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const SERVER_ROOT = path.resolve(__dirname, '../../..');
const REPO_ROOT = path.resolve(SERVER_ROOT, '..');
const EVIDENCE_DIR = path.join(REPO_ROOT, 'artifacts/private/stage14_7-live');
const GITIGNORE_MARKER = 'artifacts/private';

/** Keys whose VALUES must never appear in a report, at any nesting depth. */
const FORBIDDEN_KEY_PATTERN = /(api[_-]?key|apikey|authorization|auth[_-]?token|bearer|secret|password|passwd|credential|jwt|token|cookie|session[_-]?id|mongodb_uri|connection[_-]?string|x-api-key)/i;

/**
 * Stage 14.7I §10 — numeric accounting fields that survive redaction.
 *
 * `FORBIDDEN_KEY_PATTERN` contains `token`, which also matches `maxInputTokens`,
 * `actualOutputTokens` and every other counter. In the Stage 14.7 live report
 * that blanked the entire token ledger — the run's most important evidence — and
 * the real numbers had to be read out of private storage by hand.
 *
 * This is an explicit ALLOWLIST rather than a "anything ending in Tokens" rule:
 * a future `refreshTokens` or `sessionTokens` field must keep being redacted.
 * Every entry here is a count, and a count discloses nothing.
 */
const ACCOUNTING_FIELD_ALLOWLIST = new Set([
  'reservedInputTokens',
  'reservedOutputTokens',
  'actualInputTokens',
  'actualOutputTokens',
  'totalInputTokens',
  'totalOutputTokens',
  'inputTokens',
  'outputTokens',
  'maxInputTokens',
  'maxOutputTokens',
  'cacheCreationInputTokens',
  'cacheReadInputTokens',
  'maxOutputTokensPerCall',
]);

/** A permitted accounting field must also be numeric (or an explicit absence). */
function isAccountingField(key, value) {
  if (!ACCOUNTING_FIELD_ALLOWLIST.has(key)) return false;
  return value == null || typeof value === 'number';
}

/** Value shapes that are secrets regardless of the key they arrived under. */
const SECRET_VALUE_PATTERNS = [
  // Anthropic / OpenAI style keys.
  [/sk-[A-Za-z0-9_-]{16,}/g, '[redacted:provider_key]'],
  // Bearer tokens in a header-ish string.
  [/Bearer\s+[A-Za-z0-9._~+/-]{12,}=*/gi, 'Bearer [redacted:token]'],
  // A JWT: three dot-separated base64url segments.
  [/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g, '[redacted:jwt]'],
  // Any mongodb URI, with or without credentials.
  [/mongodb(\+srv)?:\/\/[^\s"']+/gi, '[redacted:mongo_uri]'],
];

function redactString(value) {
  let out = String(value);
  for (const [pattern, replacement] of SECRET_VALUE_PATTERNS) out = out.replace(pattern, replacement);
  return out;
}

/**
 * Recursively redacts a value for REPORT output.
 *
 * A forbidden key is replaced wholesale rather than pattern-scrubbed: a value
 * under `authorization` is a secret whatever it looks like, and relying on the
 * pattern to catch it would fail on any token shape not anticipated here.
 */
function redactForReport(value, { depth = 0 } = {}) {
  if (depth > 12) return '[redacted:depth]';
  if (value == null) return value;
  if (typeof value === 'string') return redactString(value);
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) return value.map((v) => redactForReport(v, { depth: depth + 1 }));

  if (typeof value === 'object') {
    const out = {};
    for (const [key, v] of Object.entries(value)) {
      // §10 — numeric accounting counters survive; secret-shaped fields do not,
      // and a non-numeric value under an allowlisted name is still redacted.
      if (isAccountingField(key, v)) {
        out[key] = v;
        continue;
      }
      if (FORBIDDEN_KEY_PATTERN.test(key)) {
        // Presence is reportable; the value never is.
        out[key] = v == null || v === '' ? '[absent]' : '[redacted]';
        continue;
      }
      out[key] = redactForReport(v, { depth: depth + 1 });
    }
    return out;
  }
  return '[redacted:unsupported_type]';
}

/** A stable content hash — usable as evidence without exposing the content. */
function hashOf(value) {
  const text = typeof value === 'string' ? value : JSON.stringify(value ?? null);
  return crypto.createHash('sha256').update(text).digest('hex');
}

/** A bounded excerpt for the report (§16 permits bounded excerpts). */
function boundedExcerpt(text, max = 240) {
  const s = redactString(String(text ?? ''));
  return s.length <= max ? s : `${s.slice(0, max)}…[+${s.length - max} chars]`;
}

function isDestinationGitignored() {
  try {
    const gi = fs.readFileSync(path.join(REPO_ROOT, '.gitignore'), 'utf8');
    return gi.split(/\r?\n/).some((l) => l.trim().replace(/\/+$/, '') === GITIGNORE_MARKER);
  } catch {
    return false;
  }
}

function privateDraftCaptureEnabled(env = process.env) {
  return String(env.TRAILIE_EVAL_CAPTURE_PRIVATE_DRAFTS).toLowerCase() === 'true'
    && String(env.NODE_ENV).toLowerCase() !== 'production';
}

/**
 * Writes one scenario's raw evidence under gitignored private storage.
 *
 * Drafts and raw prompts are included ONLY when the private-draft gate is on.
 * Everything else (timeline, ledger, journal, hashes) is safe evidence and is
 * always written, because a run with no evidence cannot be reviewed.
 */
function writeEvidence({ runId, scenarioId, evidence, env = process.env } = {}) {
  if (!isDestinationGitignored()) {
    return { written: false, boundedCode: 'private_destination_not_gitignored' };
  }
  /**
   * Same discipline as the consumption marker: a test run must not deposit
   * synthetic evidence into the real live-evidence directory, where it would sit
   * alongside genuine run artifacts and be indistinguishable at a glance.
   */
  if (String(env.NODE_ENV).toLowerCase() === 'test' && !env.TRAILIE_EVAL_EVIDENCE_DIR) {
    return { written: false, boundedCode: 'evidence_write_refused_in_test_without_override' };
  }
  if (!/^[a-z0-9][a-z0-9-]*$/i.test(String(scenarioId)) || !/^[a-z0-9][a-z0-9._-]*$/i.test(String(runId))) {
    return { written: false, boundedCode: 'invalid_evidence_path_component' };
  }

  const dir = path.join(env.TRAILIE_EVAL_EVIDENCE_DIR || EVIDENCE_DIR, String(runId));

  const draftsAllowed = privateDraftCaptureEnabled(env);
  const payload = { ...evidence };

  if (!draftsAllowed) {
    // Replaced by hashes so the evidence still proves identity and stability.
    for (const key of ['rawSseTranscript', 'privatePrompt', 'generatedDraft', 'rejectedDraft', 'terminalProse']) {
      if (payload[key] !== undefined) {
        payload[`${key}Sha256`] = hashOf(payload[key]);
        payload[key] = '[withheld:private_draft_gate_disabled]';
      }
    }
  }

  // Stage 14.7O — private does not mean secret-bearing. Launcher diagnostics,
  // readiness messages, bounded errors, raw stdio and timelines all converge
  // here, so reject the entire write if an inherited provider secret appears
  // anywhere in the final payload. Numeric token accounting is untouched.
  const serialized = JSON.stringify(payload);
  const explicitProviderSecrets = [env.ANTHROPIC_API_KEY, env.OPENAI_API_KEY]
    .filter((value) => typeof value === 'string' && value.length > 0);
  const containsExplicitSecret = explicitProviderSecrets.some((secret) => serialized.includes(secret));
  const containsSecretShape = /sk-[A-Za-z0-9_-]{16,}/.test(serialized);
  if (containsExplicitSecret || containsSecretShape) {
    return { written: false, boundedCode: 'provider_secret_detected' };
  }

  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${scenarioId}.json`);
  fs.writeFileSync(file, JSON.stringify(payload, null, 2) + '\n');

  return {
    written: true,
    // A repo-relative path, never an absolute one that discloses the filesystem.
    file: path.relative(REPO_ROOT, file),
    evidenceDir: path.relative(REPO_ROOT, dir),
    privateDraftsIncluded: draftsAllowed,
  };
}

module.exports = {
  EVIDENCE_DIR,
  FORBIDDEN_KEY_PATTERN,
  ACCOUNTING_FIELD_ALLOWLIST,
  isAccountingField,
  redactString,
  redactForReport,
  hashOf,
  boundedExcerpt,
  isDestinationGitignored,
  privateDraftCaptureEnabled,
  writeEvidence,
};
