'use strict';

// Deployment compatibility only. Local Trailie never selects a version.
function isLocalTrailie(env = process.env) {
  return env.NODE_ENV !== 'production';
}

function isTrailieRuntimeEnabled(env = process.env) {
  return isLocalTrailie(env)
    || String(env.TRAILIE_V2_RUNTIME_ENABLED || '').trim().toLowerCase() === 'true';
}

module.exports = { isLocalTrailie, isTrailieRuntimeEnabled };
