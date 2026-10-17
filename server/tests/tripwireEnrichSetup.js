'use strict';

/**
 * Temporary investigation helper: annotate tripwire events with the active Jest
 * test path/name. Loaded only by explicit tripwire-audit runs — not in jest.config.
 */
const fs = require('fs');
const policy = require('../src/config/providerTestPolicy');

function annotate(event) {
  try {
    const state = expect.getState();
    event.testPath = state.testPath || null;
    event.testName = state.currentTestName || null;
  } catch {
    event.testPath = null;
    event.testName = null;
  }
  return event;
}

const target = process.env.TRAILIE_TEST_TRIPWIRE_FILE;
if (target) {
  const origAppend = fs.appendFileSync.bind(fs);
  fs.appendFileSync = (file, data, options) => {
    if (file === target && typeof data === 'string' && data.includes('live_provider_tripwire')) {
      try {
        const line = data.trim();
        const event = annotate(JSON.parse(line));
        return origAppend(file, `${JSON.stringify(event)}\n`, options);
      } catch {
        return origAppend(file, data, options);
      }
    }
    return origAppend(file, data, options);
  };
}

// Keep policy module loaded so setup order is stable.
void policy;
