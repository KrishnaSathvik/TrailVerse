'use strict';

/**
 * Demo content currency flag (Architecture Lock Step 9).
 *
 * false → frozen Demo content is intentionally legacy / pending replacement.
 *         Exporter + renderer contracts still must pass.
 * true  → frozen Demo content must match the current TripPlan contract
 *         (set only after Demo recapture).
 *
 * Old Demo fixtures must not silently pretend to be current.
 */
const DEMO_CURRENT_CONTRACT = true;

module.exports = {
  DEMO_CURRENT_CONTRACT,
};
