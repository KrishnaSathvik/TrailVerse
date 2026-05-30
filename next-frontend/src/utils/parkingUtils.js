/**
 * NPS parking lot liveStatus helpers — occupancy expires; stale data must not show as live.
 */

export function parseNpsDateTime(value) {
  if (!value || typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const normalized = trimmed.replace(/\.0+$/, '').replace(' ', 'T');
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** True when NPS expiration is in the future (or missing but signal looks current). */
export function isParkingLiveStatusFresh(liveStatus, now = new Date()) {
  if (!liveStatus) return false;

  const expiration = parseNpsDateTime(liveStatus.expirationDate);
  if (expiration) {
    return expiration.getTime() > now.getTime();
  }

  const occupancy = String(liveStatus.occupancy || '').trim();
  const description = String(liveStatus.description || '').trim();

  if (!occupancy && !description) return false;
  if (liveStatus.isActive === false && !occupancy) return false;

  return Boolean(occupancy);
}

/**
 * @returns {{
 *   showBadge: boolean,
 *   badgeLabel?: string,
 *   badgeTone?: 'closed' | 'light' | 'moderate' | 'full' | 'default',
 *   isClosed: boolean,
 *   note: string | null,
 *   noteIsStale: boolean,
 *   waitMinutes: number | null,
 * }}
 */
export function getParkingLiveStatusDisplay(liveStatus, now = new Date()) {
  if (!liveStatus) {
    return {
      showBadge: false,
      isClosed: false,
      note: null,
      noteIsStale: false,
      waitMinutes: null,
    };
  }

  const fresh = isParkingLiveStatusFresh(liveStatus, now);
  const occupancy = String(liveStatus.occupancy || '').trim();
  const description = String(liveStatus.description || '').trim();
  const waitMinutes = Number(liveStatus.estimatedWaitTimeInMinutes);

  if (!fresh) {
    return {
      showBadge: false,
      isClosed: false,
      note: description || null,
      noteIsStale: Boolean(description),
      waitMinutes: null,
    };
  }

  const occLower = occupancy.toLowerCase();
  const isClosed = occLower === 'closed' || liveStatus.isActive === false;

  let badgeTone = 'default';
  if (occLower === 'closed') badgeTone = 'closed';
  else if (occLower === 'light') badgeTone = 'light';
  else if (occLower === 'moderate') badgeTone = 'moderate';
  else if (occLower === 'full' || occLower === 'busy') badgeTone = 'full';

  return {
    showBadge: Boolean(occupancy),
    badgeLabel: occupancy,
    badgeTone,
    isClosed,
    note: description || null,
    noteIsStale: false,
    waitMinutes: waitMinutes > 0 ? waitMinutes : null,
  };
}

export function formatParkingFee(fee) {
  if (!fee?.cost && fee?.cost !== 0) return null;
  const cost = `$${fee.cost}`;
  if (fee.title?.trim()) return `${fee.title.trim()} — ${cost}`;
  return cost;
}

/** Short summary for compare table cells (NPS parking lots feed). */
export function summarizeCompareParking(parkingLots) {
  const lots = Array.isArray(parkingLots) ? parkingLots : [];
  const withLive = lots.filter((lot) => getParkingLiveStatusDisplay(lot?.liveStatus).showBadge);

  return {
    lotCount: lots.length,
    liveStatusCount: withLive.length,
    primaryLabel: lots.length > 0
      ? `${lots.length} NPS lot${lots.length === 1 ? '' : 's'} listed`
      : 'No NPS parking feed',
    liveNote: withLive.length > 0
      ? `${withLive.length} with live occupancy`
      : lots.length > 0
        ? 'See park page for fees and access'
        : 'Check official park site for parking',
  };
}
