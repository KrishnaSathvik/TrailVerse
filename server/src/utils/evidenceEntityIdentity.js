'use strict';

/**
 * PHASE 4T — ONE CANONICAL PLACE IDENTITY.
 *
 * Phase 4S measured what string containment was deciding. In the live Grand
 * Teton bundle it bound an official 4WD requirement stated about
 * `Grassy Lake Road` onto `Grassy Lake Road Campsites` — two different NPS
 * entities — and after Phase 4Q a bound hard-capability fact rejects the whole
 * plan. It also bound backcountry permits stated about `Phelps Lake`,
 * `Granite Canyon` and `Leigh Lake` onto their overlooks and trailheads, telling
 * a traveler they need a permit for somewhere the park does not require one.
 *
 * The same audit found the fix already sitting in the data:
 *
 *     fact      nps:park:grte:place:A58D2B71-B34E-4FD3-8DA3-C303FA1EBEFD
 *     evidence  nps:park:grte:thingstodo:A58D2B71-B34E-4FD3-8DA3-C303FA1EBEFD
 *                             ^^^^^^^^^^ the only difference
 *
 * `extractOperationalFacts` always writes the `place` collection segment;
 * `npsEvidenceProvider` writes `thingstodo` for a thingstodo item. The upstream
 * NPS id is identical on both sides of all 17 comparable pairs. So the
 * collection namespace must not participate in identity equality, and nothing
 * else about identity needs to be invented.
 *
 * WHAT THIS IS NOT. It is not a normalization down to a display name, and it is
 * not `placeKey`. Those answer "do these strings look alike"; this answers "is
 * this the same entity", which is the only question a blocking fact may be
 * decided by.
 */

/** Never treat a positional fallback (`…:place:7`) as an identity. */
const POSITIONAL_LOCAL_ID = /^\d+$/;

/**
 * Parse an evidence entity id into its parts.
 *
 * Shape, as both producers write it:
 *   <provider>:park:<parkCode>:<namespace>:<localId>
 *
 * @returns {{provider:string, parkCode:string, namespace:string, localId:string, canonicalKey:string}|null}
 */
function parseEvidenceEntityId(entityId) {
  if (typeof entityId !== 'string') return null;
  const segments = entityId.trim().split(':').filter((segment) => segment.length > 0);
  if (segments.length < 5) return null;
  const [provider, scope, parkCode, namespace, ...rest] = segments;
  if (!provider || scope !== 'park' || !parkCode || !namespace) return null;
  const localId = rest.join(':');
  // A provider that could not supply an id falls back to the item's position in
  // the response, which is not stable across fetches and is not an identity.
  if (!localId || POSITIONAL_LOCAL_ID.test(localId)) return null;
  return {
    provider: provider.toLowerCase(),
    parkCode: parkCode.toLowerCase(),
    namespace: namespace.toLowerCase(),
    localId,
    // THE POINT: the collection namespace is deliberately absent.
    canonicalKey: `${provider.toLowerCase()}:${parkCode.toLowerCase()}:${localId.toLowerCase()}`,
  };
}

/** The namespace-free identity of an evidence entity id, or null. */
function canonicalEntityKey(entityId) {
  return parseEvidenceEntityId(entityId)?.canonicalKey ?? null;
}

/**
 * Are these two ids the same entity? `place` and `thingstodo` are two views of
 * one NPS record, so they must compare equal.
 */
function sameEvidenceEntity(a, b) {
  const left = canonicalEntityKey(a);
  const right = canonicalEntityKey(b);
  return Boolean(left) && left === right;
}

/**
 * Do both sides carry an identity, and do they DISAGREE?
 *
 * This is the guard that closes the Grassy Lake case: when the machine knows
 * these are different entities, a name overlap must not be allowed to overrule
 * it. Two missing identities are not a disagreement — they are silence.
 */
function entitiesConflict(a, b) {
  const left = canonicalEntityKey(a);
  const right = canonicalEntityKey(b);
  return Boolean(left) && Boolean(right) && left !== right;
}

/**
 * Everything a generated stop label can carry that is not the place itself:
 * "Summit Meadow — sunset photography", "Mesa Arch Trail (sunrise)".
 * Defined ONCE, because Phase 4S found that stacking punctuation rules
 * mis-classifies a place whose own name contains a dash
 * (`Death Canyon - Static Peak Divide Junction`).
 */
const DECORATION_SEPARATOR = /\s+[—–]\s+|\s*[:(]\s*|\s+-\s+/;

const normalizeLabel = (value) => String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');

/**
 * The label with any trailing decoration removed. Returns the ORIGINAL label
 * first, so a caller compares the whole name before comparing a truncation —
 * a place whose real name contains " - " must match on its full name.
 *
 * @returns {string[]} candidate labels, longest (most specific) first
 */
function labelVariants(label) {
  const full = normalizeLabel(label);
  if (!full) return [];
  const variants = [full];
  const head = normalizeLabel(String(label).split(DECORATION_SEPARATOR)[0]);
  if (head && head !== full) variants.push(head);
  return variants;
}

module.exports = {
  DECORATION_SEPARATOR,
  canonicalEntityKey,
  entitiesConflict,
  labelVariants,
  normalizeLabel,
  parseEvidenceEntityId,
  sameEvidenceEntity,
};
