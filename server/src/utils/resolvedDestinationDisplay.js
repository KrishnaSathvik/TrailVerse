'use strict';

function resolvedEntityName(value) {
  const name = String(value || '').replace(/\s+/g, ' ').trim();
  return name || null;
}

/**
 * Select display text only from destination entities already resolved by the
 * canonical destination pipeline. Raw conversation text is deliberately not
 * an input: display formatting must never become a second resolver.
 */
function resolveDestinationDisplayName({
  resolvedMetadata = {}, allExtractedParks = [], activeTripContext = null,
} = {}) {
  const candidates = [
    resolvedMetadata.parkName,
    resolvedMetadata.resolvedPlaceName,
    activeTripContext?.lockedPlanDestination?.name,
    activeTripContext?.primaryDestination?.name,
    ...allExtractedParks.map((park) => park?.parkName),
  ];
  for (const candidate of candidates) {
    const name = resolvedEntityName(candidate);
    if (name) return name;
  }
  return null;
}

module.exports = { resolveDestinationDisplayName };
