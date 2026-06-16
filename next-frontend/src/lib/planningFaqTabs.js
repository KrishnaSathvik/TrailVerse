import parkCrowdFacts from '@/data/parkCrowdFacts.json';
import { hasCrowdCalendar } from '@/lib/crowdCalendar';
import { exploreTabHasData } from '@/lib/parkExploreTabs';
import { buildPermitFaqAnswer } from '@/lib/permitFaqCopy';

export { buildPermitFaqAnswer };

/**
 * @typedef {{
 *   alertCount?: number;
 *   permitCount?: number;
 *   hasActivitiesTab?: boolean;
 *   hasPlacesTab?: boolean;
 *   hasAlertsTab?: boolean;
 *   hasPermitsTab?: boolean;
 * }} PlanningFaqTabContext
 */

/** @param {PlanningFaqTabContext} ctx */
export function normalizePlanningFaqTabContext(ctx = {}) {
  const permitCount = ctx.permitCount ?? 0;
  const alertCount = ctx.alertCount ?? 0;
  return {
    alertCount,
    permitCount,
    hasPermitsTab: ctx.hasPermitsTab ?? permitCount > 0,
    hasAlertsTab: ctx.hasAlertsTab ?? alertCount > 0,
    hasActivitiesTab: Boolean(ctx.hasActivitiesTab),
    hasPlacesTab: Boolean(ctx.hasPlacesTab),
  };
}

/**
 * @param {PlanningFaqTabContext} ctx
 * @param {{ showTransitTab?: boolean }} [options]
 */
export function planningFaqTabContextFromExplore({
  alertCount = 0,
  permitCount = 0,
  exploreCache = null,
  exploreReady = false,
  showTransitTab = false,
} = {}) {
  const tabOpts = { showTransitTab };
  return normalizePlanningFaqTabContext({
    alertCount,
    permitCount,
    hasActivitiesTab: exploreReady && exploreTabHasData('activities', exploreCache, tabOpts),
    hasPlacesTab: exploreReady && exploreTabHasData('places', exploreCache, tabOpts),
  });
}

/** @param {PlanningFaqTabContext} ctx */
export function buildFaqIntroCopy(ctx) {
  const { hasAlertsTab, hasPermitsTab } = normalizePlanningFaqTabContext(ctx);
  const base =
    'The summary above covers timing and highlights. These go deeper on reservations, crowds, and logistics';
  const tabs = [];
  if (hasAlertsTab) tabs.push('Alerts');
  if (hasPermitsTab) tabs.push('Permits');
  if (tabs.length === 0) return `${base}.`;
  if (tabs.length === 1) return `${base} — check ${tabs[0]} for live updates.`;
  return `${base} — check ${tabs.join(' and ')} for live updates.`;
}

function formatVisitsLine(parkCode) {
  const visits = parkCrowdFacts[parkCode]?.visits2025;
  if (!visits) return '';
  if (visits >= 1_000_000) {
    return ` About ${(visits / 1_000_000).toFixed(1)} million recreation visits were recorded in 2025.`;
  }
  if (visits >= 1_000) {
    return ` About ${Math.round(visits / 1_000)}k recreation visits were recorded in 2025.`;
  }
  return '';
}

/**
 * @param {{
 *   shortName: string;
 *   parkCode?: string;
 *   park?: { parkCode?: string };
 *   alertCount?: number;
 *   bestTimeMonths?: string[];
 * }} input
 */
export function buildPeakCrowdFaqAnswer({
  shortName,
  parkCode,
  park,
  alertCount = 0,
  bestTimeMonths,
}) {
  const code = (parkCode || park?.parkCode || '').toLowerCase();
  const crowd = parkCrowdFacts[code];
  const peakMonth = crowd?.peakMonth;
  const visitsLine = formatVisitsLine(code);
  const parkRef = park || { parkCode: code };

  let body;
  if (peakMonth) {
    body = `${peakMonth} is usually the busiest month at ${shortName}.`;
    const quieter = (bestTimeMonths || []).filter((m) => m !== peakMonth).slice(0, 2);
    if (quieter.length) {
      body += ` ${quieter.join(' and ')} often feel quieter.`;
    } else {
      body += ' Spring and fall are often quieter alternatives.';
    }
  } else {
    body = `Crowds at ${shortName} vary by season and day of week.`;
  }

  if (hasCrowdCalendar(parkRef)) {
    body += `${visitsLine} See the crowd calendar for month-by-month visit patterns.`;
  } else if (alertCount > 0) {
    body += `${visitsLine} Check Alerts on this page before you pick dates.`;
  } else {
    body += `${visitsLine} See Overview on this page for seasonal hours and access.`;
  }

  return body.trim();
}

/** @param {{ parkCode?: string; park?: { parkCode?: string }; alertCount?: number; slug?: string }} input */
export function peakCrowdFaqLink({ parkCode, park, alertCount = 0, slug }) {
  const code = (parkCode || park?.parkCode || '').toUpperCase();
  const parkRef = park || { parkCode: code.toLowerCase() };

  if (hasCrowdCalendar(parkRef)) {
    return {
      href: `/reports/when-to-go?park=${encodeURIComponent(code)}`,
      linkLabel: 'View crowd calendar →',
      linkKey: 'crowd',
    };
  }
  if (alertCount > 0 && slug) {
    return {
      href: `/parks/${slug}?tab=alerts`,
      linkLabel: 'See Alerts tab →',
      linkKey: 'alerts',
    };
  }
  if (slug) {
    return {
      href: `/parks/${slug}`,
      linkLabel: 'See Overview →',
      linkKey: 'overview',
    };
  }
  return {};
}

/** @param {{ shortName: string; alertCount?: number; hasActivitiesTab?: boolean; hasPlacesTab?: boolean }} input */
export function buildExtraDaysFaqAnswer({
  shortName,
  alertCount = 0,
  hasActivitiesTab = false,
  hasPlacesTab = false,
}) {
  const { hasAlertsTab } = normalizePlanningFaqTabContext({ alertCount });
  const conditionsSuffix = hasAlertsTab
    ? ' Check Alerts before you go for current road, trail, and weather closures.'
    : '';

  let main;
  if (hasActivitiesTab && hasPlacesTab) {
    main =
      'Use Things to Do to stack hikes and ranger programs by how long you have. What to See lists landmarks and viewpoints worth a separate stop.';
  } else if (hasActivitiesTab) {
    main = 'Use Things to Do to stack hikes and ranger programs by how long you have.';
  } else if (hasPlacesTab) {
    main = 'Use What to See for landmarks and viewpoints worth a separate stop.';
  } else {
    main = 'Use the explore tabs on this page to stack sights and programs by how long you have.';
  }

  return `${main} Add a buffer day for weather or a long hike you do not want to rush.${conditionsSuffix}`;
}

/**
 * Strip or rewrite FAQ items that reference tabs that are not visible.
 * @param {{ q: string; a: string; href?: string; linkLabel?: string; linkKey?: string }[]} items
 * @param {{ fullName?: string; parkCode?: string }} park
 * @param {string} parkSlug
 * @param {PlanningFaqTabContext} tabCtx
 * @param {{ permits?: { name?: string }[] }} [options]
 */
export function alignPlanningFaqWithTabs(items, park, parkSlug, tabCtx, { permits = [] } = {}) {
  if (!items?.length) return [];

  const ctx = normalizePlanningFaqTabContext(tabCtx);
  const short = (park?.fullName || 'this park')
    .replace(/ National Park and Preserve$/i, '')
    .replace(/ National Park & Preserve$/i, '')
    .replace(/ National Parks and Preserves$/i, '')
    .replace(/ National Park$/i, '')
    .replace(/ National Preserve$/i, '')
    .replace(/ National Historical Park$/i, '')
    .replace(/ National Monument$/i, '')
    .trim();
  const code = (park?.parkCode || '').toLowerCase();
  const slug = parkSlug || '';

  return items.map((item) => {
    const next = { ...item };

    if (/reservations for/i.test(item.q)) {
      next.a = buildPermitFaqAnswer({
        shortName: short,
        parkCode: code,
        permits: ctx.hasPermitsTab ? permits : [],
        hasPermitsTab: ctx.hasPermitsTab,
      });
      if (ctx.hasPermitsTab) {
        next.href = `/parks/${slug}?tab=permits`;
        next.linkLabel = 'See Permits tab →';
        next.linkKey = 'permits';
      } else if (slug) {
        next.href = `/parks/${slug}`;
        next.linkLabel = 'See Overview →';
        next.linkKey = 'overview';
      } else {
        delete next.href;
        delete next.linkLabel;
        delete next.linkKey;
      }
      return next;
    }

    if (/busiest\?/i.test(item.q)) {
      next.a = buildPeakCrowdFaqAnswer({
        shortName: short,
        parkCode: code,
        park,
        alertCount: ctx.alertCount,
      });
      const link = peakCrowdFaqLink({
        parkCode: code,
        park,
        alertCount: ctx.alertCount,
        slug,
      });
      if (link.href) {
        next.href = link.href;
        next.linkLabel = link.linkLabel;
        next.linkKey = link.linkKey;
      } else {
        delete next.href;
        delete next.linkLabel;
        delete next.linkKey;
      }
      return next;
    }

    if (/extra time at/i.test(item.q)) {
      next.a = buildExtraDaysFaqAnswer({
        shortName: short,
        alertCount: ctx.alertCount,
        hasActivitiesTab: ctx.hasActivitiesTab,
        hasPlacesTab: ctx.hasPlacesTab,
      });
      if (ctx.hasActivitiesTab) {
        next.href = `/parks/${slug}?tab=activities`;
        next.linkLabel = 'See Things to Do →';
        next.linkKey = 'activities';
      } else {
        delete next.href;
        delete next.linkLabel;
        delete next.linkKey;
      }
      return next;
    }

    if (item.linkKey === 'alerts' && !ctx.hasAlertsTab) {
      delete next.href;
      delete next.linkLabel;
      delete next.linkKey;
      next.a = next.a
        .replace(/\s*Check the Alerts tab on this page for current closures before you go\./i, '')
        .replace(/\s*Check the Alerts tab before setting dates\./i, '')
        .replace(/\s*Check Alerts before you go for current road, trail, and weather closures\./i, '')
        .trim();
    }

    if (item.linkKey === 'permits' && !ctx.hasPermitsTab) {
      delete next.href;
      delete next.linkLabel;
      delete next.linkKey;
    }

    if (item.linkKey === 'activities' && !ctx.hasActivitiesTab) {
      delete next.href;
      delete next.linkLabel;
      delete next.linkKey;
    }

    return next;
  });
}
