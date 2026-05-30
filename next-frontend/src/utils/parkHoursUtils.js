import { htmlToPlainText } from './htmlUtils';

const WEEKDAYS = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
];

function firstSentence(text) {
  if (!text) return '';
  const match = text.match(/^[\s\S]+?[.!?](?:\s|$)/);
  return (match ? match[0] : text).trim();
}

function hasOperatingHoursDetail(entries) {
  if (!entries?.length) return false;
  return entries.some(
    (entry) =>
      htmlToPlainText(entry?.description || '').length > 0 ||
      entry?.standardHours ||
      entry?.name
  );
}

/**
 * Short label for the park hero quick-info Hours card.
 * Full schedules stay in Overview → Operating Hours.
 */
export function getParkHoursQuickSummary(park) {
  const entries = park?.operatingHours;
  const showFullHoursLink = hasOperatingHoursDetail(entries);

  if (!Array.isArray(entries) || entries.length === 0) {
    return { summary: 'Open year-round', hasFullDetails: false };
  }

  const primary = entries[0];
  const standardHours = primary?.standardHours;

  if (standardHours) {
    const dayValues = WEEKDAYS.map((day) => standardHours[day]).filter(Boolean);
    if (dayValues.length > 0) {
      const unique = [...new Set(dayValues)];
      if (unique.length === 1) {
        const value = unique[0];
        if (value === 'Closed') {
          return { summary: 'Currently closed', hasFullDetails: showFullHoursLink };
        }
        if (value === 'All Day') {
          return { summary: 'Open 24 hours', hasFullDetails: showFullHoursLink };
        }
        return {
          summary: `Open daily · ${value}`,
          hasFullDetails: showFullHoursLink,
        };
      }

      const openCount = dayValues.filter((v) => v !== 'Closed').length;
      if (openCount === 0) {
        return { summary: 'Currently closed', hasFullDetails: showFullHoursLink };
      }
      return { summary: 'Hours vary by day', hasFullDetails: showFullHoursLink };
    }
  }

  const description = htmlToPlainText(primary?.description || '');
  if (!description) {
    return {
      summary: primary?.name || 'See operating hours',
      hasFullDetails: showFullHoursLink,
    };
  }

  const sentence = firstSentence(description);
  const MAX_SUMMARY = 88;
  let summary = sentence;
  if (summary.length > MAX_SUMMARY) {
    summary = `${summary.slice(0, MAX_SUMMARY - 1).trim()}…`;
  }

  return { summary, hasFullDetails: showFullHoursLink };
}
