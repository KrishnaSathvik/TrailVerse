import reservationFacts from '@/data/parkReservationFacts.json';

/**
 * @typedef {{
 *   parkWideEntry?: 'none' | 'required' | 'partial' | 'unknown';
 *   summary?: string | null;
 *   authoritative?: boolean;
 *   lastReviewed?: string;
 *   liveItems?: { name: string; type?: string; category?: string; entityId?: string; reservationUrl?: string }[];
 * }} ParkReservationFacts
 */

/** @param {string} [parkCode] @returns {ParkReservationFacts | null} */
export function getReservationFacts(parkCode) {
  const code = (parkCode || '').toLowerCase();
  return reservationFacts[code] || null;
}

/** @param {ParkReservationFacts | null | undefined} facts */
export function hasReservationInventory(facts) {
  return Array.isArray(facts?.liveItems) && facts.liveItems.length > 0;
}

/**
 * @param {{ name?: string; type?: string; category?: string }[]} permits
 * @param {ParkReservationFacts | null} facts
 */
export function filterStaleTimedEntryPermits(permits, facts) {
  if (!Array.isArray(permits) || !permits.length) return [];
  if (!facts?.authoritative || facts.parkWideEntry !== 'none') return permits;

  return permits.filter((permit) => {
    const type = (permit.type || '').toLowerCase();
    const category = permit.category || '';
    const name = (permit.name || '').toLowerCase();
    const isTimedEntry = category === 'timed_entry' || type === 'timed entry'
      || (type === 'tour ticket' && name.includes('timed entry'));

    if (!isTimedEntry) return true;

    if (facts.preserveActivityTimedEntry) {
      const parkWidePatterns = /national park timed entry|park timed entry|ticketed entry|vehicle reservation/i;
      return !parkWidePatterns.test(name);
    }

    return false;
  });
}
