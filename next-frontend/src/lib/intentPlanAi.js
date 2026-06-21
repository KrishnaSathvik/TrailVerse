import { getIntentLandingByPath } from '@/data/intentLandings';

/**
 * @typedef {{
 *   fullName: string;
 *   label: string;
 *   description: string;
 *   parkCode?: string;
 * }} IntentStandoutDetail
 */

/**
 * @typedef {{
 *   parkCode: string;
 *   fullName: string;
 *   states: string;
 *   matchReason: string;
 *   matchedTraits: string[];
 * }} IntentRankedPark
 */

/**
 * @typedef {{
 *   path: string;
 *   title: string;
 *   searchQuery: string;
 *   quickAnswer: string;
 *   featuredParkCodes: string[];
 *   standouts: IntentStandoutDetail[];
 *   rankedParks: IntentRankedPark[];
 * }} IntentPlanAiContext
 */

/**
 * @param {import('@/data/intentLandings').IntentLanding | string} landingOrPath
 */
export function buildIntentPlanAiHref(landingOrPath) {
  const path = typeof landingOrPath === 'string' ? landingOrPath : landingOrPath.path;
  const slug = path.replace(/^\//, '');
  return `/plan-ai?from=intent&intent=${encodeURIComponent(slug)}`;
}

/**
 * @param {URLSearchParams | { get: (key: string) => string | null }} searchParams
 * @returns {string | null} intent landing path e.g. /parks-for-couples
 */
export function resolveIntentPathFromSearchParams(searchParams) {
  if (!searchParams || searchParams.get('from') !== 'intent') return null;
  const raw = searchParams.get('intent')?.trim();
  if (!raw) return null;
  return raw.startsWith('/') ? raw : `/${raw}`;
}

/**
 * @param {URLSearchParams | { get: (key: string) => string | null }} searchParams
 * @returns {IntentPlanAiContext | null}
 */
export function resolveIntentPlanAiContext(searchParams) {
  const path = resolveIntentPathFromSearchParams(searchParams);
  if (!path) return null;
  const landing = getIntentLandingByPath(path);
  return landing ? buildIntentPlanAiContext(landing) : null;
}

/**
 * @param {import('@/data/intentLandings').IntentLanding} landing
 * @param {{ rankedParks?: IntentRankedPark[] | object[] }} [options]
 * @returns {IntentPlanAiContext}
 */
export function buildIntentPlanAiContext(landing, { rankedParks = null } = {}) {
  const standouts = (landing.standouts || [])
    .slice(0, 8)
    .map((item) => ({
      fullName: item.fullName || item.label || '',
      label: item.label || '',
      description: item.description || '',
      parkCode: item.parkCode || '',
    }))
    .filter((item) => item.fullName || item.label);

  const ranked = (rankedParks || [])
    .slice(0, 24)
    .map((park) => ({
      parkCode: park.parkCode || '',
      fullName: park.fullName || park.name || '',
      states: park.states || '',
      matchReason: park.matchReason || '',
      matchedTraits: Array.isArray(park.matchedTraits) ? park.matchedTraits : [],
    }))
    .filter((park) => park.fullName);

  return {
    path: landing.path,
    title: landing.title,
    searchQuery: landing.searchQuery,
    quickAnswer: landing.quickAnswer || '',
    featuredParkCodes: landing.featuredParkCodes || [],
    standouts,
    rankedParks: ranked,
  };
}

/**
 * Prompt block for Trailie session context — editorial standouts + live ranked grid.
 * @param {IntentPlanAiContext | null | undefined} intentContext
 * @returns {string}
 */
export function formatIntentGuideContextForPrompt(intentContext) {
  if (!intentContext?.path) return '';

  const intro = [
    `The user opened Trailie from the TrailVerse guide "${intentContext.title}" (${intentContext.path}).`,
    `They are looking for parks that match: ${intentContext.searchQuery}.`,
  ];
  if (intentContext.quickAnswer) {
    intro.push(`Guide summary: ${intentContext.quickAnswer}`);
  }

  let block = `\n\nINTENT GUIDE CONTEXT:\n${intro.join('\n')}`;

  if (intentContext.standouts?.length) {
    block += `\n\n--- EDITORIAL STANDOUTS (${intentContext.title}) ---\n`;
    block += 'On-brand blurbs from the guide page — weave these vibes when recommending parks.\n';
    intentContext.standouts.forEach((item, index) => {
      const name = item.fullName || item.label;
      block += `${index + 1}. ${name}\n`;
      if (item.description) {
        block += `   ${item.description}\n`;
      }
    });
    block += '--- END EDITORIAL STANDOUTS ---\n';
  }

  if (intentContext.rankedParks?.length) {
    block += `\n--- INTENT GUIDE RANKED PICKS (live search: "${intentContext.searchQuery}") ---\n`;
    block += 'Same ranking the user saw on the guide page. Prefer these when recommending parks for this trip style.\n';
    intentContext.rankedParks.slice(0, 12).forEach((park, index) => {
      block += `${index + 1}. ${park.fullName}${park.states ? ` (${park.states})` : ''}${park.parkCode ? ` [${park.parkCode}]` : ''}\n`;
      if (park.matchReason) {
        block += `   Why: ${park.matchReason}\n`;
      }
    });
    block += '--- END INTENT GUIDE RANKED PICKS ---\n';
  }

  block += '\nPrioritize parks that fit this trip style. If they name a park from the lists above, plan that trip in detail.';
  return block;
}

/** Shorter shell title — e.g. "Couples trip" from "Best National Parks for Couples" */
export function intentPlanAiHeaderTitle(title) {
  const trimmed = String(title || '')
    .replace(/^Best National Parks for /i, '')
    .replace(/^Best /i, '')
    .trim();
  if (!trimmed) return 'Trip planning';
  return `${trimmed} trip`;
}
