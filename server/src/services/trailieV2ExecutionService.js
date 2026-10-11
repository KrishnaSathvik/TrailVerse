'use strict';
// Compatibility alias for the ROLLBACK executor only
// (trailieExecutionService). The primary product runtime is
// trailieSimpleRuntime under TRAILIE_RUNTIME=model_first — this file is not
// that path. Keep the V2 name so legacy tests and import sites resolve.
module.exports = require('./trailieExecutionService');
