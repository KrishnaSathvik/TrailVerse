'use strict';

// One kill switch. model_first is the intended Trailie runtime in every
// environment, including production. legacy is an explicit emergency rollback
// only — never an alternate semantic owner, and never forced by NODE_ENV.
// See docs/trailie-architecture.md.
function selectTrailieRuntime(env = process.env) {
  const value = env.TRAILIE_RUNTIME || 'model_first';
  return ['model_first', 'legacy'].includes(value) ? value : 'unavailable';
}

module.exports = { selectTrailieRuntime };
