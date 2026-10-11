import { buildTripMapModel } from './itineraryMapStops';

// A frontend-owned vocabulary. No model-supplied component names or HTML.
export const RICH_BLOCKS = Object.freeze(['prose', 'image_strip', 'trip_overview', 'compact_days', 'map_preview', 'things_to_know', 'personalize_trip', 'comparison', 'trip_artifact']);
export const PERSONALIZATION = Object.freeze([
  { key: 'season', label: 'When are you going?', options: [['Summer', 'summer'], ['Fall', 'fall'], ['Spring', 'spring'], ['Winter', 'winter']] },
  { key: 'party', label: 'Who’s coming?', options: [['Solo', 'solo'], ['Couple', 'as a couple'], ['Friends', 'with friends'], ['Family with kids', 'with family and kids']] },
  { key: 'style', label: 'Travel style', options: [['Adventure + downtime', 'a mix of adventure and downtime'], ['Big hiking days', 'built around big hiking days'], ['Scenic + relaxed', 'scenic and relaxed']] },
  { key: 'hiking', label: 'Hiking preference', options: [['Easy', 'easy'], ['Moderate', 'moderate'], ['Longer hikes', 'longer']] },
]);
const MAX_DIMENSIONS = 3;

export function personalizationMessage(selection) {
  const allowed = Object.fromEntries(PERSONALIZATION.map(d => [d.key, d.options.find(([, value]) => value === selection[d.key])?.[1]]));
  const parts = [
    allowed.season && `Update this trip for ${allowed.season}.`,
    allowed.party && `I’m traveling ${allowed.party}.`,
    allowed.style && `I want it ${allowed.style}.`,
    allowed.hiking && `I prefer ${allowed.hiking} hikes.`,
  ].filter(Boolean);
  return parts.length ? `${allowed.season ? '' : 'Update this trip. '}${parts.join(' ')}` : '';
}

// Traveler memory is the verified authority for what Trailie already knows.
// A dimension already answered there (or by dated canonical days) is never re-asked.
export function knownPersonalization(plan, planningState) {
  const s = planningState || {};
  const known = new Set();
  if (s.dates?.startDate || s.dates?.travelMonth || (plan?.days || []).some(day => day.date)) known.add('season');
  if (Number.isFinite(s.travelers?.adults) || Number.isFinite(s.travelers?.children)) known.add('party');
  if (s.preferences?.pace) known.add('style');
  if (s.preferences?.fitness || Number.isFinite(s.mobility?.maxWalkMilesPerSegment) || Number.isFinite(s.mobility?.maxWalkMinutesPerSegment)) known.add('hiking');
  return known;
}
export function personalizationDimensions(plan, planningState) {
  const known = knownPersonalization(plan, planningState);
  const open = PERSONALIZATION.filter(d => !known.has(d.key)).slice(0, MAX_DIMENSIONS);
  // A single remaining choice rarely changes a trip enough to interrupt with a form.
  return open.length >= 2 ? open : [];
}

export function tripRevision(plan) {
  if (!plan?.days?.length) return null;
  // Legacy plans have no identity stamps. A structural key keeps those safe too.
  return JSON.stringify([plan.responseId, plan.responseVersion, plan.responseRevision, plan.itineraryHash, plan.days]);
}
export function acceptedPersonalization(result) {
  return result?.persisted === true && result?.artifactStatus?.status !== 'save_failed'
    && result?.presentation?.refinement?.isRefinement === true
    && Boolean(result?.canonicalPlan?.days?.length);
}
export function imageAllowed(url) {
  if (typeof url !== 'string') return false;
  if (/^\/(?:images|uploads)\/[\w/%. -]+$/.test(url)) return true;
  try { const u = new URL(url); return u.protocol === 'https:' && (u.hostname === 'nps.gov' || u.hostname.endsWith('.nps.gov')); } catch { return false; }
}
const httpUrl = (value) => { try { return ['https:', 'http:'].includes(new URL(value).protocol); } catch { return false; } };

export function groundedTripGuidance(plan) {
  const items = [];
  // Official park-wide rules (shuttle seasons, timed entry) first: they shape the whole trip.
  for (const rule of Array.isArray(plan?.tripGuidance) ? plan.tripGuidance : []) {
    if (!rule?.text || !httpUrl(rule.source) || rule.applicability === 'not_applicable') continue;
    if (!items.some(i => i.text === rule.text)) items.push({ text: rule.text, source: rule.source });
  }
  for (const day of plan?.days || []) {
    for (const edge of day.travelEdges || []) {
      const access = edge.operationalAccess;
      const source = (Array.isArray(access?.sources) ? access.sources : []).find(url => { try { return ['https:', 'http:'].includes(new URL(url).protocol); } catch { return false; } });
      if (!source) continue;
      const from = day.stops?.find(s => s.id === edge.sourceStopId)?.name;
      const to = day.stops?.find(s => s.id === edge.targetStopId)?.name;
      if (!from || !to) continue;
      const mode = { shuttle: 'shuttle', transit: 'public transit', ferry: 'ferry', walking: 'walking', bicycling: 'bicycling' }[access.requiredMode];
      const note = access.status === 'required_alternative' && mode ? `Use ${mode} between ${from} and ${to}.`
        : access.status === 'restricted' ? `Access between ${from} and ${to} is restricted; confirm transportation before traveling.` : null;
      if (note && !items.some(i => i.text === note)) items.push({ text: note, source });
    }
  }
  return items.slice(0, 4);
}
function dedupeImages(list) {
  const seen = new Set();
  return list.filter(image => imageAllowed(image?.url) && !seen.has(image.url) && seen.add(image.url));
}
/**
 * Deterministic presentation for an accepted canonical trip turn.
 * Created vs updated comes only from the server's accepted-mutation refinement.
 */
export function composeRichTrip(response, refinement, { imagery = [], planningState = null } = {}) {
  const plan = response.canonicalPlan;
  if (!plan?.days?.length || response.artifactStatus?.status === 'save_failed') return null;
  const updated = refinement?.isRefinement === true;
  const days = plan.days.filter((day, i) => !updated || refinement.changedDayNumbers?.includes(day.dayNumber || i + 1));
  const images = updated ? [] : dedupeImages([...(response.parkImages || []), ...imagery]).slice(0, 3);
  const guidance = updated ? [] : groundedTripGuidance(plan);
  const fullMap = updated ? null : buildTripMapModel(plan);
  const map = fullMap?.hasAnyMappedStop ? fullMap : null;
  const unmappedCount = map ? Math.max(0, map.mappableCount - map.mappedCount) : 0;
  const dimensions = updated ? [] : personalizationDimensions(plan, planningState || response.planningState);
  return { plan, updated, days, images, guidance, map, unmappedCount, dimensions, revision: tripRevision(plan),
    blocks: ['trip_overview', ...(images.length ? ['image_strip'] : []), 'compact_days', ...(map ? ['map_preview'] : []), ...(guidance.length ? ['things_to_know'] : []), 'trip_artifact'] };
}
