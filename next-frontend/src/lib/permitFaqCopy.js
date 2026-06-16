import parkCrowdFacts from '@/data/parkCrowdFacts.json';
import {
  getReservationFacts,
  filterStaleTimedEntryPermits,
  hasReservationInventory,
} from '@/lib/parkReservationFacts';

function isNoneRequired(text) {
  return /^none required/i.test(text || '');
}

function formatLivePermitsAnswer(shortName, permits, hasPermitsTab) {
  const timed = permits.filter((p) => (p.category || '') === 'timed_entry' || /timed entry/i.test(p.type || ''));
  const other = permits.filter((p) => !timed.includes(p));
  const names = permits
    .slice(0, 2)
    .map((p) => p.name)
    .filter(Boolean)
    .join(' and ');
  const countLabel = permits.length === 1 ? '1 reservation type' : `${permits.length} reservation types`;

  let body;
  if (timed.length > 0 && other.length === 0) {
    body = `${shortName} uses timed entry for ${timed.length === 1 ? timed[0].name : 'select experiences'}. TrailVerse lists ${countLabel} on the Permits tab${names ? `, including ${names}` : ''}.`;
  } else if (timed.length > 0) {
    body = `TrailVerse lists ${countLabel} on the Permits tab${names ? `, including ${names}` : ''} — covering timed entry and activity permits.`;
  } else {
    body = names
      ? `TrailVerse lists ${countLabel} on the Permits tab, including ${names}.`
      : `TrailVerse lists ${countLabel} on the Permits tab for this park.`;
  }

  const tabHint = hasPermitsTab ? '' : ' Open the Permits tab on this page for booking links.';
  return `${body}${tabHint} Recreation.gov listings can change seasonally — confirm current rules before you set dates.`;
}

function formatCuratedSummaryAnswer(shortName, facts, hasPermitsTab) {
  const target = hasPermitsTab ? 'the Permits tab' : 'Overview on this page';
  return `${facts.summary} Confirm current rules on TrailVerse (${target}) before booking travel.`;
}

function formatSeededInventoryAnswer(shortName, facts) {
  const names = (facts.liveItems || [])
    .slice(0, 2)
    .map((item) => item.name)
    .filter(Boolean)
    .join(' and ');
  const count = facts.liveItems.length;
  const countLabel = count === 1 ? '1 reservation type' : `${count} reservation types`;
  return names
    ? `TrailVerse lists ${countLabel} for ${shortName}, including ${names}. See the Permits tab for booking links and confirm current rules before you travel.`
    : `TrailVerse lists reservations for ${shortName} on the Permits tab. Confirm current rules before you travel.`;
}

/**
 * @param {{
 *   shortName: string;
 *   parkCode: string;
 *   permits?: { name?: string; type?: string; category?: string }[];
 *   hasPermitsTab?: boolean;
 * }} input
 */
export function buildPermitFaqAnswer({ shortName, parkCode, permits = [], hasPermitsTab }) {
  const code = (parkCode || '').toLowerCase();
  const crowd = parkCrowdFacts[code];
  const facts = getReservationFacts(code);
  const showPermitsTab = hasPermitsTab ?? permits.length > 0;

  const livePermits = filterStaleTimedEntryPermits(permits, facts);
  if (livePermits.length > 0) {
    let answer = formatLivePermitsAnswer(shortName, livePermits, showPermitsTab);
    if (facts?.authoritative && facts?.summary && facts.parkWideEntry === 'none') {
      answer = `${facts.summary} ${answer}`;
    }
    return answer.trim();
  }

  if (facts?.authoritative && facts?.summary) {
    return formatCuratedSummaryAnswer(shortName, facts, showPermitsTab);
  }

  if (hasReservationInventory(facts) && !facts?.authoritative) {
    return formatSeededInventoryAnswer(shortName, facts);
  }

  if (facts?.summary && !isNoneRequired(facts.summary)) {
    return formatCuratedSummaryAnswer(shortName, facts, showPermitsTab);
  }

  if (crowd?.permitSystem && !isNoneRequired(crowd.permitSystem)) {
    const confirmTarget = showPermitsTab ? 'the Permits tab' : 'Overview on this page';
    return `${crowd.permitSystem} Confirm current rules on TrailVerse (${confirmTarget}) before booking travel.`;
  }

  if (crowd?.permitSystem && isNoneRequired(crowd.permitSystem)) {
    return `No park-wide entry reservation is required for ${shortName}. Cave tours, campgrounds, or activity passes may still need advance booking — see Overview on this page for fees, hours, and what to book ahead.`;
  }

  if (showPermitsTab) {
    return `Reservation rules vary by season and activity for ${shortName}. Check the Permits tab on this page for campground, tour, or backcountry requirements — even parks without park-wide timed entry may still need activity passes.`;
  }

  return `Reservation rules vary by season and activity for ${shortName}. See Overview on this page for fees, timed entry, and campground details before you travel.`;
}
