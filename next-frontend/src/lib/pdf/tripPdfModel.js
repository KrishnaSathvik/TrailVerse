import { ROAD_ACCESS_NOTE, formatTravelMinutes, groundedPlaceType, tripBases, tripTitle, verifiedTransferLabel } from '../tripPresentation';
import { formatTime12, getSharedDayHeading, formatSharedTripDate } from '@/utils/sharedTripFormat';
import { sanitizePdfText, slugifyPdfFilename } from './pdfUtils';

const clean = value => typeof value === 'string' ? sanitizePdfText(value) : '';
const list = values => [...new Set((Array.isArray(values) ? values : []).map(value => clean(typeof value === 'string' ? value : value?.requirement || value?.name || value?.label || value?.notes)).filter(Boolean))];
const publicUrl = value => {
  try { const url = new URL(value); return url.protocol === 'https:' ? url.href : null; } catch { return null; }
};

/** Deterministic print projection. Only named traveler-facing fields reach the renderer. */
export function buildTripPdfModel(trip) {
  const plan = trip?.plan;
  if (!plan?.days?.length) throw new Error('A saved itinerary is required to export PDF');
  const destination = clean(tripTitle(plan, trip.title));
  const days = plan.days.map((day, index) => {
    const heading = getSharedDayHeading(day, index);
    return {
      number: day.dayNumber || index + 1,
      title: clean(heading.title) || 'Explore at your own pace',
      date: day.date ? formatSharedTripDate(day.date) : null,
      base: clean(day.overnightLocation),
      dayType: clean(day.dayStructure?.type),
      summary: clean(day.dayStructure?.summary),
      blocks: (day.dayStructure?.blocks || []).map(block => ({
        kind: clean(block.kind), periods: (block.periods || []).map(clean), label: clean(block.label), note: clean(block.note),
        time: [formatTime12(block.startTime), block.duration ? `~${formatTravelMinutes(block.duration)}` : null].filter(Boolean).join(' · '), timingReason: clean(block.timingReason),
        stopNumbers: (block.stopIds || []).map(id => (day.stops || []).findIndex(stop => stop.id === id) + 1).filter(n => n > 0),
      })),
      stops: (day.stops || []).map((stop, i, stops) => {
        const edge = (day.travelEdges || []).find(e => e.relationship === 'transfer' && e.sourceStopId === stops[i - 1]?.id && e.targetStopId === stop.id);
        const sameActivity = (day.activityGroups || []).some(g => g.stopIds?.includes(stop.id) && g.stopIds.includes(stops[i - 1]?.id));
        const placeType = groundedPlaceType(stop);
        return {
          number: i + 1,
          name: clean(stop.name),
          time: stop.timingReason && stop.startTime ? [clean(stop.timeWindow), formatTime12(stop.startTime)].filter(Boolean).join(' · ') : clean(stop.timeWindow) || formatTime12(stop.startTime),
          timingReason: clean(stop.timingReason),
          meta: [placeType !== 'Custom' ? placeType : null, Number.isFinite(stop.duration) && stop.duration > 0 ? formatTravelMinutes(stop.duration) : null].filter(Boolean).join(' · '),
          note: clean(stop.note),
          transfer: edge && !sameActivity ? verifiedTransferLabel(edge) || 'Travel time unavailable' : null,
          caveats: list(stop.operationalCaveats).filter(c => c !== clean(stop.note)),
          sourceUrl: (stop.sourceReferences || []).map(s => publicUrl(s.url)).find(Boolean) || null,
        };
      }),
    };
  });
  const dates = trip.planningState?.dates || {};
  const schedule = dates.startDate ? [formatSharedTripDate(dates.startDate), dates.endDate && formatSharedTripDate(dates.endDate)].filter(Boolean).join(' – ') : null;
  return {
    destination, days, schedule,
    duration: `${days.length}-day itinerary`,
    bases: clean(tripBases(plan)),
    filename: slugifyPdfFilename(`trailie-${destination}-${days.length}-day-itinerary`),
    beforeYouGo: ['Check current closures, weather and operating hours before departure.', ...(days.some(d => d.stops.some(s => s.transfer?.endsWith('by road'))) ? [ROAD_ACCESS_NOTE] : ['Check seasonal road and shuttle access before setting out.'])],
    packing: list(plan.packingList),
    permits: list(plan.permits),
  };
}
