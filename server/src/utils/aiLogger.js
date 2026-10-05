const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const {
  CHAT_ROUTES,
  recordTurnFromAiLog,
} = require('../services/trailieTurnLedger');

const LOG_DIR = path.join(__dirname, '../../logs');
const LOG_FILE = path.join(LOG_DIR, 'ai-requests.jsonl');
let logMutationQueue = Promise.resolve();

// Ensure log directory exists on first require
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

// Cache park names for extractParksMentioned (loaded lazily)
let _parkNamesCache = null;

async function getParkNames() {
  if (_parkNamesCache) return _parkNamesCache;
  try {
    const { getNpsService } = require('../services/npsService'); // lazy to avoid circular deps
    const allParks = await getNpsService().getAllParks();
    _parkNamesCache = allParks.map(p => ({
      code: p.parkCode,
      name: p.name || p.fullName,
      fullName: p.fullName,
    }));
  } catch {
    _parkNamesCache = [];
  }
  return _parkNamesCache;
}

/**
 * Extract park codes mentioned in response text by matching park names.
 * Returns array of park codes like ["romo", "grsa", "blca"].
 */
async function extractParksMentioned(text) {
  const parks = await getParkNames();
  const mentioned = new Set();
  for (const park of parks) {
    if (text.includes(park.fullName) || text.includes(park.name)) {
      mentioned.add(park.code);
    }
  }
  return Array.from(mentioned);
}

/**
 * Log a structured AI request/response record.
 * Fire-and-forget — never throws, never blocks the response.
 *
 * WP12 Phase 4 — shadow/canary telemetry hooks removed. Product chat is
 * authoritative v2; turn ledger recording remains.
 */
function logAIRequest(record) {
  try {
    const {
      intentShadowInput: _intentShadowInput = null,
      evidencePlannerShadowInput: _evidencePlannerShadowInput = null,
      promptV2ShadowInput: _promptV2ShadowInput = null,
      promptV2CanaryInput: _promptV2CanaryInput = null,
      ...retainedRecord
    } = record;
    void _intentShadowInput;
    void _evidencePlannerShadowInput;
    void _promptV2ShadowInput;
    void _promptV2CanaryInput;
    const entry = {
      id: crypto.randomUUID(),
      ts: new Date().toISOString(),
      ...retainedRecord,
    };
    let telemetryPromise = Promise.resolve();
    if (CHAT_ROUTES.has(entry.endpoint)) {
      telemetryPromise = Promise.resolve(recordTurnFromAiLog(entry))
        .catch((err) => {
          console.error('[TrailieTurnLedger] Write failed:', err.message);
        });
    }
    const line = JSON.stringify(entry) + '\n';
    logMutationQueue = logMutationQueue
      .then(() => fs.promises.appendFile(LOG_FILE, line))
      .catch((err) => console.error('[AILogger] Write failed:', err.message));
    return Promise.all([logMutationQueue, telemetryPromise]);
  } catch (err) {
    console.error('[AILogger] Serialization failed:', err.message);
    return Promise.resolve();
  }
}

/**
 * Account-erasure helper — remove jsonl AI request lines owned by this user.
 * Best-effort rewrite of the local log file; never throws for missing files.
 */
async function redactAIRequestsForUser(userId) {
  const uid = String(userId || '');
  if (!uid) return { matched: 0, deleted: 0, anonymized: 0 };
  let raw = '';
  try {
    raw = await fs.promises.readFile(LOG_FILE, 'utf8');
  } catch (err) {
    if (err && err.code === 'ENOENT') return { matched: 0, deleted: 0, anonymized: 0 };
    throw err;
  }
  const lines = raw.split('\n');
  let matched = 0;
  let deleted = 0;
  const kept = [];
  for (const line of lines) {
    if (!line.trim()) continue;
    let entry;
    try {
      entry = JSON.parse(line);
    } catch {
      kept.push(line);
      continue;
    }
    const owner = entry.userId != null ? String(entry.userId) : '';
    if (owner && owner === uid) {
      matched += 1;
      deleted += 1;
      continue;
    }
    kept.push(line);
  }
  const next = kept.length ? `${kept.join('\n')}\n` : '';
  await new Promise((resolve, reject) => {
    logMutationQueue = logMutationQueue
      .then(() => fs.promises.writeFile(LOG_FILE, next))
      .then(resolve, reject);
  });
  return { matched, deleted, anonymized: 0 };
}

module.exports = {
  logAIRequest,
  extractParksMentioned,
  redactAIRequestsForUser,
  LOG_FILE,
};
