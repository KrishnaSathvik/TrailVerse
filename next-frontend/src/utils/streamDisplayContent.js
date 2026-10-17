import { stripItineraryArtifacts } from './itineraryArtifacts';
import { sanitizeTrailieCitations } from './sanitizeTrailieCitations';

/**
 * Hide [ITINERARY_JSON] blocks and internal citation tokens while tokens
 * stream so the UI matches the server's canonical content.
 *
 * Stage 8: itinerary-artifact stripping is isomorphic with the server
 * (shared/itineraryArtifacts.fixtures.json). Citation wrappers use the
 * same traveler-facing boundary as persist/reload.
 */
export function stripItineraryJsonForDisplay(content) {
  return sanitizeTrailieCitations(stripItineraryArtifacts(content).content).content;
}
