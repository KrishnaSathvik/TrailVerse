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

export function getPrimaryEntranceFeeSummary(entranceFees) {
  if (!Array.isArray(entranceFees) || entranceFees.length === 0) {
    return { price: 'Free', subtitle: null };
  }
  const primary = entranceFees[0];
  return {
    price: formatParkFeeCost(primary.cost) ?? 'See details',
    subtitle: primary.title || null,
  };
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
