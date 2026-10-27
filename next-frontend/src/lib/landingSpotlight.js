/**
 * Landing "new park" spotlight — shown as the first "Start exploring" card.
 * Facts are from the NPS announcement (see docs/research/chiricahua-national-park-2026.md).
 */
export const NEW_PARK_SPOTLIGHT = {
  parkCode: 'chir',
  fullName: 'Chiricahua National Park',
  states: 'AZ',
  badge: 'New · 64th national park',
  // NPS photo "View from Massai Point" (NPS API images for chir).
  image:
    'https://www.nps.gov/common/uploads/structured_data/3AA42DAB-A4B2-BF29-C512A967630CAFDD.jpg',
  imageAlt: 'Enormous balanced rocks and rock pinnacles seen from Massai Point',
  /** The spotlight stops rendering after this date (UTC). */
  showUntil: '2027-01-31T23:59:59Z',
};

export function isNewParkSpotlightActive(now = new Date()) {
  return now.getTime() <= Date.parse(NEW_PARK_SPOTLIGHT.showUntil);
}

/**
 * Featured cards for "Start exploring": while the spotlight is active the new
 * park leads and the last default pick drops so the grid stays 3×2.
 */
export function withNewParkSpotlight(featuredParks, allParks, now = new Date()) {
  if (!isNewParkSpotlightActive(now)) return featuredParks;
  const live = allParks.find((park) => park.parkCode === NEW_PARK_SPOTLIGHT.parkCode) || {};
  const { parkCode, fullName, states, badge, image, imageAlt } = NEW_PARK_SPOTLIGHT;
  const card = { ...live, parkCode, fullName: live.fullName || fullName, states: live.states || states, badge, image, imageAlt };
  return [card, ...featuredParks.filter((park) => park.parkCode !== parkCode)].slice(0, featuredParks.length);
}
