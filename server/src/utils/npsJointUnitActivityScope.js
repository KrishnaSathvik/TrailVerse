'use strict';

/**
 * Joint NPS units (one API parkCode, multiple logical parks).
 *
 * Example: TrailVerse entity `sequ` (Sequoia National Park) fetches NPS `seki`
 * (Sequoia & Kings Canyon). NPS stamps relatedParks as seki only, so named
 * activities for Grant Grove / Cedar Grove would otherwise be attributed to
 * Sequoia. Scope by official place-name geography — not demo-question rules.
 */

const JOINT_FETCH_ALIASES = Object.freeze({
  sequ: 'seki',
  kica: 'seki',
});

/**
 * Subunit geography markers for SEKI complex.
 * Keep lists place-oriented (grove / canyon / visitor centers / named trees).
 */
const SEKI_SEQUOIA_MARKERS =
  /\b(giant forest|general sherman|sherman tree|lodgepole|moro rock|crescent meadow|congress trail|big trees(?:\s+trail)?|sunset rock|mineral king|foothills(?:\s+visitor)?|wolverton|wuksachi|tokopah|muir grove|little baldy|sequoia national park)\b/i;

const SEKI_KINGS_CANYON_MARKERS =
  /\b(grant grove|general grant|kings canyon|cedar grove|zumwalt(?:\s+meadow)?|roaring river|road'?s?\s*end|panoramic point|park ridge|north grove|sheep creek|kings canyon visitor)\b/i;

const SEKI_JOINT_ADMINISTRATIVE_NAME =
  /\b(?:sequoia\s*(?:&|and)\s*kings canyon|kings canyon\s*(?:&|and)\s*sequoia) national parks?\b/i;

const JOINT_UNIT_SCOPES = Object.freeze({
  sequ: Object.freeze({
    fetchCode: 'seki',
    exclude: SEKI_KINGS_CANYON_MARKERS,
    prefer: SEKI_SEQUOIA_MARKERS,
    jointAdministrativeName: SEKI_JOINT_ADMINISTRATIVE_NAME,
  }),
  kica: Object.freeze({
    fetchCode: 'seki',
    exclude: SEKI_SEQUOIA_MARKERS,
    prefer: SEKI_KINGS_CANYON_MARKERS,
    jointAdministrativeName: SEKI_JOINT_ADMINISTRATIVE_NAME,
  }),
});

function jointFetchCodeFor(logicalParkCode) {
  const code = String(logicalParkCode || '').toLowerCase();
  return JOINT_FETCH_ALIASES[code] || null;
}

function jointScopeFor(logicalParkCode) {
  const code = String(logicalParkCode || '').toLowerCase();
  return JOINT_UNIT_SCOPES[code] || null;
}

function relatedParkGeography(item = {}, scope = {}) {
  const related = Array.isArray(item.relatedParks)
    ? item.relatedParks
      .filter((park) => {
        const label = `${park?.fullName || ''} ${park?.name || ''}`;
        return !scope.jointAdministrativeName?.test(label);
      })
      .map((p) => `${p?.parkCode || ''} ${p?.fullName || ''} ${p?.name || ''}`)
      .join(' ')
    : '';
  return related;
}

function itemGeographyHaystack(item = {}, scope = {}) {
  return [
    item.title,
    item.name,
    item.shortDescription,
    item.description,
    item.url,
    item.location,
    relatedParkGeography(item, scope),
  ].filter(Boolean).join(' ');
}

/**
 * Whether a named NPS activity/place belongs to the logical park entity when
 * the live fetch used a joint unit code (e.g. seki for sequ).
 *
 * @returns {boolean} true = keep for this logical park
 */
function activityBelongsToLogicalPark(item, logicalParkCode) {
  const scope = jointScopeFor(logicalParkCode);
  if (!scope) return true;
  const hay = itemGeographyHaystack(item, scope);
  if (scope.exclude.test(hay)) return false;
  return true;
}

function filterActivitiesForLogicalPark(items, logicalParkCode) {
  if (!Array.isArray(items) || !items.length) return [];
  if (!jointScopeFor(logicalParkCode)) return items;
  return items.filter((item) => activityBelongsToLogicalPark(item, logicalParkCode));
}

module.exports = {
  JOINT_FETCH_ALIASES,
  JOINT_UNIT_SCOPES,
  jointFetchCodeFor,
  jointScopeFor,
  activityBelongsToLogicalPark,
  filterActivitiesForLogicalPark,
  SEKI_SEQUOIA_MARKERS,
  SEKI_KINGS_CANYON_MARKERS,
};
