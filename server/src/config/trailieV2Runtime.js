'use strict';
const { isTrailieRuntimeEnabled } = require('./trailieRuntime');
module.exports = {
  TRAILIE_V2_RUNTIME_FLAG: 'TRAILIE_V2_RUNTIME_ENABLED',
  isTrailieV2RuntimeEnabled: isTrailieRuntimeEnabled,
};
