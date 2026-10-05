'use strict';

// This cutover is local only. A production deployment always keeps its existing
// route implementation, regardless of a developer's local runtime switch.
function selectTrailieRuntime(env = process.env) {
  if (env.NODE_ENV === 'production') return 'legacy';
  const value = env.TRAILIE_RUNTIME || 'model_first';
  return ['model_first', 'legacy'].includes(value) ? value : 'unavailable';
}

module.exports = { selectTrailieRuntime };
