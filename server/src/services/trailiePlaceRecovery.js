'use strict';

const { usableEvidence } = require('./trailieSimpleTools');
const { validLocation } = require('../utils/trailieCanonicalLocation');

const normalized = text => String(text || '').normalize('NFKC').toLowerCase().replace(/[’‘]/g, "'").replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const mentions = (text, name) => Boolean(normalized(name)) && (` ${normalized(text)} `).includes(` ${normalized(name)} `);

// Conservative, turn-local provenance, not a new traveler-memory authority.
// A traveler mention is protected even if its intent is ambiguous. Assistant
// recommendations never establish a requirement. The model still interprets
// referential requests in the supplied conversation; this is not an NLP parser.
function buildPlaceRecovery({ unresolved = [], diagnostics = [], evidence = [], travelerText, now }) {
  const groundedPlaces = evidence.filter(row => usableEvidence(row, now, { authoritative: true })
    && !['stop_coordinates', 'destination_identity'].includes(row.topic)
    && row.claim?.normalizedValue?.name && validLocation(row.claim.normalizedValue.location))
    .map(row => ({ evidenceRef: row.evidenceId, name: row.claim.normalizedValue.name, value: row.claim.normalizedValue }));
  const names = new Map();
  for (const row of unresolved) if (row.place) names.set(normalized(row.place), { name: row.place, reason: row.reason });
  for (const row of diagnostics) if (row.resolutionStatus === 'unresolved' && row.inputName) {
    names.set(normalized(row.inputName), { name: row.inputName, reason: row.rejectionReason || 'identity_not_found' });
  }
  const failedPlaces = [...names.values()].map(row => {
    const required = mentions(travelerText, row.name);
    return { ...row, provenance: required ? 'traveler_required_place' : 'planner_selected_place',
      provenanceBasis: required ? 'Exact name occurs in traveler words; conservatively protect it.' : 'Name absent from traveler words; check conversation for referential requirements.',
      replacementAllowed: !required };
  });
  return { failedPlaces, groundedPlaces, travelerWords: travelerText,
    instructions: 'Recover the trip using the actual grounded evidence. For planner_selected_place, choose a different suitable grounded experience that meets the traveler’s intent; you own that choice. Do not abandon a complete trip merely because your optional recommendation failed. Do not repeat an unresolved identity unless new valid grounding evidence is available. Alternatives have their own identities: never rename one to impersonate the failed outing. For traveler_required_place, do not silently substitute. You may retain the requested idea in an explicitly non-spatial experience block under its own label, without a verified route or map identity. If it cannot be represented honestly even as flexible advice, explain the limitation. Check traveler words and conversation for explicit or referential requirements before replacing anything. Preserve authorized scope, untouched days, day shape, map coverage, route/access uncertainty and memory authority. Update all affected stops, outing blocks and prose together. For any plausible outing lacking confident spatial grounding, use a legitimate experience block with empty stopIds and no coordinates, canonical identity or route; duration is an optional estimate. Rewrite related prose consistently. Do not attach the activity to a nearby grounded pin or rename it as logistics to hide the distinction. Current operational claims still require source evidence. The traveler did not see internal candidates: a successful optional replacement needs no account of the failed candidate.' };
}

// Only called after canonical validation: a required outing is either a grounded
// stop or an explicitly non-spatial experience, never a silently substituted pin.
function requiredPlaceRecoveryIssues(recovery, plan, evidence = [], now = new Date()) {
  if (!plan) return [];
  const stops = (plan.days || []).flatMap(day => day.stops || []);
  const experiences = (plan.days || []).flatMap(day => day.dayStructure?.blocks || []).filter(block => block.kind === 'experience');
  // Resolve aliases against current evidence, including identities acquired during
  // finalization. Historical failed lookups must not erase a confirmed identity.
  const fresh = evidence.filter(row => usableEvidence(row, now, { authoritative: true })
    && row.topic !== 'stop_coordinates' && validLocation(row.claim?.normalizedValue?.location)
    && !row.claim?.normalizedValue?.alternativeFor);
  const representedIdentity = place => {
    const matches = fresh.filter(row => {
      const value = row.claim.normalizedValue;
      const aliases = [value.name, value.canonicalPlaceName,
        ...(row.source?.provider === 'named_place' ? [value.requestedName] : []),
        ...(row.source?.provider === 'nps' ? value.identityAliases || [] : [])];
      return aliases.some(name => normalized(name) === normalized(place.name));
    });
    const identities = new Set(matches.map(row => row.claim.identity).filter(Boolean));
    if (identities.size !== 1) return false;
    const identity = [...identities][0];
    const baseNames = matches.filter(row => {
      const value = row.claim.normalizedValue;
      return ['area', 'lodging', 'hotel', 'lodge', 'accommodation'].includes(value.placeKind || value.category)
        || (value.placeTypes || []).includes('lodging');
    }).flatMap(row => [row.claim.normalizedValue.name, row.claim.normalizedValue.canonicalPlaceName,
      row.source?.provider === 'named_place' ? row.claim.normalizedValue.requestedName : null]).filter(Boolean);
    // The guard folds a hotel stop into overnightLocation. Preserve that honest
    // representation without permitting an arbitrary outing to hide in a base.
    if ((plan.days || []).some(day => baseNames.some(name => normalized(day.overnightLocation) === normalized(name)))) return true;
    return stops.some(stop => stop.canonicalPlaceId === identity
      // Official activities explicitly identify their parent destination. A title
      // or proximity match cannot establish that a destination is represented.
      || fresh.some(row => row.evidenceId === stop.evidenceRef
        && row.claim.normalizedValue.destinationId === identity));
  };
  return recovery?.failedPlaces.some(place => place.provenance === 'traveler_required_place'
    && !stops.some(stop => normalized(stop.name) === normalized(place.name)
      || normalized(stop.experience?.name) === normalized(place.name))
    && !experiences.some(block => mentions(block.label, place.name))
    && !representedIdentity(place))
    ? ['traveler_required_place_unresolved'] : [];
}

module.exports = { buildPlaceRecovery, requiredPlaceRecoveryIssues };
