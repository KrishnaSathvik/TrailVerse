const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const LOG_DIR = path.join(__dirname, '../../logs');
const LOG_FILE = path.join(LOG_DIR, 'ai-requests.jsonl');

// Ensure log directory exists on first require
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

// Cache park names for extractParksMentioned (loaded lazily)
let _parkNamesCache = null;

async function getParkNames() {
  if (_parkNamesCache) return _parkNamesCache;
  try {
    const npsService = require('../services/npsService'); // lazy to avoid circular deps
    const allParks = await npsService.getAllParks();
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
 */
function logAIRequest(record) {
  try {
    const entry = {
      id: crypto.randomUUID(),
      ts: new Date().toISOString(),
      ...record,
    };
    const line = JSON.stringify(entry) + '\n';
    fs.appendFile(LOG_FILE, line, (err) => {
      if (err) console.error('[AILogger] Write failed:', err.message);
    });
  } catch (err) {
    console.error('[AILogger] Serialization failed:', err.message);
  }
}

module.exports = { logAIRequest, extractParksMentioned, LOG_FILE };
