'use strict';

/**
 * Fixture reproducing the export shape that broke Stage 14.8H's first attempt:
 * a CJS entry that is itself a callable wrapper carrying its own `.prototype`,
 * with the real class on `.default`. Constructing against the wrapper's
 * prototype silently strips every method the real class defines.
 */

class RealClient {
  constructor({ apiKey } = {}) {
    this.apiKey = apiKey;
    // Resource objects are created in the constructor and hold a client
    // reference, exactly as the SDK does.
    this.messages = {
      create: ({ max_tokens: maxTokens }) => ({
        dispatched: true,
        timeout: this.calculateNonstreamingTimeout(maxTokens),
      }),
    };
  }

  post() { return 'posted'; }

  calculateNonstreamingTimeout(maxTokens) { return maxTokens * 10; }
}

/** Callable interop wrapper — this is the detail that matters. */
function wrapper(...args) {
  return new RealClient(...args);
}

wrapper.default = RealClient;
wrapper.RealClient = RealClient;
wrapper.APIError = class APIError extends Error {};
wrapper.VERSION = '0.0.0-fixture';

module.exports = wrapper;
