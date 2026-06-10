import parkCrowdFacts from '@/data/parkCrowdFacts.json';

/** True when this park has month-by-month data in /reports/when-to-go (~63 national parks). */
export function hasCrowdCalendar(park) {
  const code = (park?.parkCode || '').toLowerCase();
  return Boolean(code && parkCrowdFacts[code]);
}
