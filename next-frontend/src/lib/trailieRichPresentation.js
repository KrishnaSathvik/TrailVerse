// A frontend-owned vocabulary. No model-supplied component names or HTML.
export const RICH_BLOCKS = Object.freeze(['prose', 'image_strip', 'trip_overview', 'day_purposes', 'things_to_know', 'adjust_trip', 'comparison', 'trip_artifact']);
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
/** One-line day identity for chat confirmations — never a stop list. */
export function dayPurposeLine(day, index = 0) {
  const number = Number(day?.dayNumber) > 0 ? Number(day.dayNumber) : index + 1;
  const summary = String(day?.dayStructure?.summary || '').trim();
  const label = String(day?.label || '').trim().replace(new RegExp(`^day\\s*${number}\\s*(?:[·•—–\\-:|]\\s*)?`, 'i'), '').trim();
  const purpose = summary || label || null;
  return { dayNumber: number, purpose, type: day?.dayStructure?.type || null };
}

/**
 * Deterministic presentation for an accepted canonical trip turn.
 * Created vs updated comes only from the server's accepted-mutation refinement.
 * Chat stays a shape confirmation; the Trip Workspace owns the full day timeline.
 */
export function composeRichTrip(response, refinement, { imagery = [] } = {}) {
  const plan = response.canonicalPlan;
  // Acceptance is runtime state: a failed save must never claim a trip card.
  if (!plan?.days?.length || response.artifactStatus?.status === 'save_failed') return null;
  const updated = refinement?.isRefinement === true;
  const days = plan.days.filter((day, i) => !updated || refinement.changedDayNumbers?.includes(day.dayNumber || i + 1));
  const dayPurposes = days.map((day, i) => dayPurposeLine(day, plan.days.indexOf(day) >= 0 ? plan.days.indexOf(day) : i));
  const images = updated ? [] : dedupeImages([...(response.parkImages || []), ...imagery]).slice(0, 3);
  const guidance = updated ? [] : groundedTripGuidance(plan);
  // No map preview in chat — workspace Map tab is the single map surface.
  return {
    plan,
    updated,
    days,
    dayPurposes,
    images,
    guidance,
    map: null,
    unmappedCount: 0,
    revision: tripRevision(plan),
    blocks: [
      'trip_overview',
      ...(images.length ? ['image_strip'] : []),
      'day_purposes',
      ...(guidance.length ? ['things_to_know'] : []),
      'trip_artifact',
    ],
  };
}
