'use strict';

/**
 * Dominant-action arbitration for TravelerJob / TurnUnderstanding / intent.
 *
 * Topic language (driving, photography, permits, parking, weather) may own the
 * job only when it is the traveler's requested action. Secondary preferences
 * stay 12B semantic facts. Produce-trip (12A) and access-contingency (12B)
 * remain higher-order inputs, not keyword races.
 *
 * Conceptual precedence (existing safety/prohibition rules still run first):
 *   1. accepted active-plan refinement / patch
 *   2. explicit produce-trip artifact request
 *   3. explicit comparison
 *   4. explicit contingency / alternative request
 *   5. explicit transactional/current-information ask
 *   6. destination/place discovery
 *   7. general advice
 */

const { normalizeUserText } = require('./lexicalNormalization');
const { askedToProduceTripArtifact } = require('./produceTripRequest');
const {
  resolveDrivingMinimization,
  resolvePhotography,
  resolveAccessContingency,
} = require('./constraintFamilies');

const PRIMARY_ROUTE_ASK = new RegExp(
  String.raw`\b(?:how (?:do|would|can|should) (?:i|we) (?:get|drive|go)`
  + String.raw`|can (?:i|we) get from`
  + String.raw`|drive from\b.{0,48}\bto\b`
  + String.raw`|how (?:long|far) (?:is|would) the drive`
  + String.raw`|how long (?:does|would) .{0,24}drive`
  + String.raw`|driving directions`
  + String.raw`|where (?:should|can) (?:i|we) park`
  + String.raw`|how (?:do|would|can) (?:i|we) get there`
  + String.raw`)\b`,
  'i',
);

const PARKING_STATUS_ASK =
  /\b(?:what(?:'?s| is)|how(?:'?s| is)) parking\b|\bparking (?:like|situation|status)\b/i;

const PRIMARY_PHOTO_ASK = new RegExp(
  String.raw`\b(?:where (?:should|can|do|would) (?:i|we) (?:photograph|take pictures|shoot)`
  + String.raw`|where (?:to )?(?:photograph|take pictures)`
  + String.raw`|best .{0,40}(?:photo|photograph)`
  + String.raw`|wildlife photography`
  + String.raw`|photo(?:graphy)? spots?`
  + String.raw`)\b`,
  'i',
);

const PHOTO_PREFERENCE_STATEMENT = new RegExp(
  String.raw`\b(?:(?:we|i) (?:care about|like|love|enjoy)`
  + String.raw`|(?:we(?:'re| are)|i(?:'m| am)) (?:into|interested in)`
  + String.raw`|interested in`
  + String.raw`)\b.{0,32}\b(?:photograph(?:y|ing)?|taking pictures|photos?|pictures?)`,
  'i',
);

const PRIMARY_PERMIT_ASK = new RegExp(
  String.raw`\b(?:do (?:i|we) need (?:a |the )?(?:permit|reservation|timed entry)`
  + String.raw`|is (?:a |the )?(?:permit|reservation|timed entry) required`
  + String.raw`|how (?:do i|to) (?:get|secure|book|reserve) (?:a |the )?(?:permit|reservation|timed entry)`
  + String.raw`|need (?:a |the )?permit for`
  + String.raw`|what (?:permits?|reservations?) do (?:i|we) need`
  + String.raw`)\b`,
  'i',
);

const WEATHER_STATUS_ASK =
  /\b(?:what(?:'?s| is) the weather|weather (?:like|forecast)|will it rain|forecast)\b/i;

const WEATHER_EVENT =
  /\b(?:rain|rains|raining|storms?|snow(?:ing)?|thunderstorms?)\b/i;

function resolveTopicActions(rawText, { produce = null } = {}) {
  const text = normalizeUserText(rawText);
  const driving = resolveDrivingMinimization(text);
  const photography = resolvePhotography(text);
  const contingency = resolveAccessContingency(text);
  const produceNow = produce === true || produce === false
    ? produce
    : askedToProduceTripArtifact(text);

  const primaryRouteAsk = PRIMARY_ROUTE_ASK.test(text);
  const parkingStatusAsk = PARKING_STATUS_ASK.test(text) && !contingency.isAccessContingency;
  const transportPreferenceOnly = driving.minimizeDriving === true
    && !primaryRouteAsk
    && !parkingStatusAsk
    && !produceNow;

  const primaryPhotographyAsk = PRIMARY_PHOTO_ASK.test(text);
  const photographyPreferenceOnly = PHOTO_PREFERENCE_STATEMENT.test(text)
    && !primaryPhotographyAsk
    && !produceNow;

  const primaryPermitAsk = PRIMARY_PERMIT_ASK.test(text)
    && !produceNow
    && !contingency.isAccessContingency;

  const weatherContingency = Boolean(
    (contingency.isAccessContingency && contingency.inaccessibility === 'weather_fail')
    || (WEATHER_EVENT.test(text) && contingency.asksForAlternative && !produceNow),
  );
  const weatherStatusAsk = WEATHER_STATUS_ASK.test(text)
    && !weatherContingency
    && !produceNow;

  return {
    produceNow,
    driving,
    photography,
    contingency,
    primaryRouteAsk,
    parkingStatusAsk,
    transportPreferenceOnly,
    primaryPhotographyAsk,
    photographyPreferenceOnly,
    primaryPermitAsk,
    weatherStatusAsk,
    weatherContingency,
  };
}

/**
 * Whether a topic matcher may assign that TravelerJob. False is a veto —
 * secondary topic language stays a constraint/preference.
 */
function topicMayOwnJob(kind, actions) {
  if (!actions || actions.produceNow) return false;
  if (actions.contingency?.isAccessContingency || actions.weatherContingency) {
    return kind === 'access_contingency';
  }
  switch (kind) {
    case 'route_planning':
      if (actions.transportPreferenceOnly || actions.parkingStatusAsk) return false;
      return true;
    case 'place_discovery':
      if (actions.photographyPreferenceOnly) return false;
      return true;
    case 'permits_reservations':
      return true;
    case 'access_contingency':
      return true;
    default:
      return false;
  }
}

module.exports = {
  resolveTopicActions,
  topicMayOwnJob,
};
