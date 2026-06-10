import { hasCrowdCalendar } from '@/lib/crowdCalendar';

/** Follow-up line + optional FAQ link for "best time to visit" answers. */
export function getTimingFollowUp(park, alertCount = 0) {
  if (hasCrowdCalendar(park)) {
    return {
      suffix: ' See the crowd calendar for month-by-month visit patterns.',
      link: { linkKey: 'crowd' },
    };
  }
  if (alertCount > 0) {
    return {
      suffix: ' Check the Alerts tab on this page for current closures before you go.',
      link: { linkKey: 'alerts' },
    };
  }
  return {
    suffix: ' See Overview on this page for hours, fees, and getting here.',
    link: { linkKey: 'overview' },
  };
}

/** Extra sentence for "what not to miss" when conditions may change. */
export function getVisitConditionsSuffix(park, alertCount = 0) {
  if (alertCount > 0) {
    return ' Check Alerts before you go for current road, trail, and weather closures.';
  }
  return '';
}

export function spreadFaqLink(link) {
  if (!link) return {};
  if (link.linkKey) return { linkKey: link.linkKey };
  return {
    href: link.href,
    linkLabel: link.linkLabel,
    external: link.external,
  };
}
