import { htmlToPlainText } from './htmlUtils';

export const WEEKDAY_ORDER = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
];

export const WEEKDAY_LABELS = {
  monday: 'Monday',
  tuesday: 'Tuesday',
  wednesday: 'Wednesday',
  thursday: 'Thursday',
  friday: 'Friday',
  saturday: 'Saturday',
  sunday: 'Sunday',
};

export function formatParkFeeCost(cost) {
  if (cost === undefined || cost === null || cost === '') return null;
  const amount = parseFloat(cost);
  if (Number.isNaN(amount)) return null;
  if (amount === 0) return 'Free';
  return `$${amount.toFixed(2)}`;
}

function feeText(fee) {
  return `${fee?.title || ''} ${fee?.description || ''}`.toLowerCase();
}

/** Timed entry / vehicle reservations are not the park admission fee. */
export function isReservationStyleFee(fee) {
  const text = feeText(fee);
  return (
    /\b(reservation|timed[\s-]*entry|vehicle[\s-]*reservation|day-use[\s-]*permit)\b/i.test(
      text
    ) && !/\b(private\s+vehicle|7[\s-]*day|annual|motorcycle|per\s+person|individual)\b/i.test(
      fee?.title || ''
    )
  );
}

/** Annual/interagency pass products — not per-visit admission (NPS "Entrance Pass" is admission). */
export function isAnnualOrInteragencyPassProduct(fee) {
  const title = (fee.title || '').toLowerCase();
  if (/\b(entrance\s+pass|private\s+vehicle|motorcycle|per\s+person|individual)\b/i.test(title)) {
    return false;
  }
  return /\b(america the beautiful|annual pass|interagency|senior pass|military pass|access pass|lifetime)\b/i.test(
    title
  );
}

/** Pass products and add-on reservations are not standard per-visit entrance. */
export function isStandardEntranceFee(fee) {
  if (!fee || isReservationStyleFee(fee) || isAnnualOrInteragencyPassProduct(fee)) {
    return false;
  }
  return true;
}

function privateVehiclePriority(fee) {
  const title = (fee.title || '').toLowerCase();
  if (/\b(private\s+vehicle|vehicle\s+pass|automobile|per\s+vehicle)\b/i.test(title)) return 3;
  if (/\b(motorcycle)\b/i.test(title)) return 2;
  if (/\b(per\s+person|individual|foot|bike|bicycle|walk|hike)\b/i.test(title)) return 1;
  return 0;
}

function feeAmount(fee) {
  const amount = parseFloat(fee?.cost);
  return Number.isFinite(amount) ? amount : 0;
}

/**
 * Pick the fee that should represent "Entrance Fee" in summaries (not timed-entry reservations).
 */
export function pickPrimaryEntranceFee(entranceFees) {
  if (!Array.isArray(entranceFees) || entranceFees.length === 0) return null;

  const fees = entranceFees.filter(Boolean);
  const standard = fees.filter(isStandardEntranceFee);

  if (standard.length > 0) {
    return standard.sort((a, b) => {
      const vehicleRank = privateVehiclePriority(b) - privateVehiclePriority(a);
      if (vehicleRank !== 0) return vehicleRank;
      return feeAmount(b) - feeAmount(a);
    })[0];
  }

  const reservations = fees.filter(isReservationStyleFee);
  if (reservations.length > 0) {
    return reservations.sort((a, b) => feeAmount(a) - feeAmount(b))[0];
  }

  return fees[0];
}

export function getPrimaryEntranceFeeSummary(entranceFees) {
  if (!Array.isArray(entranceFees) || entranceFees.length === 0) {
    return { price: 'Free', subtitle: null };
  }

  const primary = pickPrimaryEntranceFee(entranceFees);
  if (!primary) {
    return { price: 'Free', subtitle: null };
  }

  if (isReservationStyleFee(primary) && !entranceFees.some(isStandardEntranceFee)) {
    const formatted = formatParkFeeCost(primary.cost);
    return {
      price: formatted ? `From ${formatted}` : 'See details',
      subtitle: primary.title || 'Reservation required',
    };
  }

  return {
    price: formatParkFeeCost(primary.cost) ?? 'See details',
    subtitle: primary.title || null,
  };
}

/** Surface standard admission before reservation lines in detail lists. */
export function sortEntranceFeesForDisplay(entranceFees) {
  if (!Array.isArray(entranceFees)) return [];
  return [...entranceFees].sort((a, b) => {
    const aStandard = isStandardEntranceFee(a) ? 1 : 0;
    const bStandard = isStandardEntranceFee(b) ? 1 : 0;
    if (aStandard !== bStandard) return bStandard - aStandard;
    const aReservation = isReservationStyleFee(a) ? 1 : 0;
    const bReservation = isReservationStyleFee(b) ? 1 : 0;
    if (aReservation !== bReservation) return aReservation - bReservation;
    return feeAmount(b) - feeAmount(a);
  });
}

export function buildStandardHoursRows(standardHours) {
  if (!standardHours) return [];
  return WEEKDAY_ORDER.filter((day) => Boolean(standardHours[day])).map((day) => ({
    day,
    label: WEEKDAY_LABELS[day],
    value: standardHours[day],
  }));
}

export function plainDescription(text) {
  if (!text) return '';
  return htmlToPlainText(text).trim();
}

function normalizeHoursLocationName(value) {
  return (value || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function stripNpsDesignation(name) {
  return name.replace(
    /\s+(national park|national monument|national historic site|national historical park|national recreation area|national preserve|national seashore|national lakeshore|national battlefield|memorial|park & preserve)$/i,
    ''
  ).trim();
}

/** Hide NPS location labels that repeat the park page title (e.g. "Glacier National Park"). */
export function shouldShowOperatingHoursLocationName(locationName, parkFullName) {
  if (!locationName?.trim()) return false;

  const location = normalizeHoursLocationName(locationName);
  const park = normalizeHoursLocationName(parkFullName);
  if (!park) return true;
  if (location === park) return false;

  const locationCore = stripNpsDesignation(location);
  const parkCore = stripNpsDesignation(park);
  return !(locationCore && parkCore && locationCore === parkCore);
}
