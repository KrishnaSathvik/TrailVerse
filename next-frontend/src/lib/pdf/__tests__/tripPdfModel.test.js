import { describe, expect, it, vi, beforeEach } from 'vitest';
import { buildTripPdfModel } from '../tripPdfModel';
import { loadTripForPdf, exportTripPdf } from '../exportTripPdf';
import { verifiedTransferLabel } from '../../tripPresentation';
import playback from '@/data/trailieDemoPlayback.json';
const getTrip = vi.hoisted(() => vi.fn());
const download = vi.hoisted(() => vi.fn());
vi.mock('@/services/tripService', () => ({ default: { getTrip } }));
vi.mock('../pdfUtils', async importOriginal => ({ ...(await importOriginal()), downloadPdfDocument: download }));
vi.mock('../TripPDFDocument', () => ({ TripPDFDocument: () => null }));
const edge = { relationship: 'transfer', sourceStopId: 'a', targetStopId: 'b', status: 'verified', travelMode: 'driving', durationSeconds: 8940, source: { evidenceId: 'secret-evidence', provider: 'google_maps' } };
const trip = { title: 'New Trip Plan', plan: { parkName: 'Example National Park', responseId: 'secret-response', days: [{ dayNumber: 1, label: 'Day 1 — A relaxed day', overnightLocation: 'Town', stops: [{ id: 'a', name: 'One', startTime: '09:00', duration: 90, canonicalPlaceId: 'secret-place' }, { id: 'b', name: 'Two', source: 'user', type: 'custom' }], travelEdges: [edge] }] } };
beforeEach(() => { vi.clearAllMocks(); });
describe('trip PDF projection', () => {
  it('uses canonical labels, real duration and public-only output', () => {
    const model = buildTripPdfModel(trip);
    expect(model.filename).toBe('trailie-example-national-park-1-day-itinerary.pdf');
    expect(model.days[0].title).toBe('A relaxed day');
    expect(model.days[0].stops[0]).toMatchObject({ time: '9:00 AM', meta: '1 hr 30 min' });
    expect(model.days[0].stops[1].transfer).toBe('2 hr 29 min by road');
    expect(JSON.stringify(model)).not.toMatch(/secret-|canonicalPlaceId|evidenceRef|responseId|Custom/);
  });
  it.each([
    { status: 'allowed', sources: ['https://www.nps.gov/access'] },
    { status: 'required_alternative', requiredMode: 'shuttle', sources: ['https://www.nps.gov/access'] },
    { status: 'restricted', sources: ['https://www.nps.gov/access'] },
  ])('does not reinterpret access %j for PDF', access => {
    const copy = structuredClone(trip);
    const transfer = { ...edge, operationalAccess: access };
    copy.plan.days[0].travelEdges = [transfer];
    expect(buildTripPdfModel(copy).days[0].stops[1].transfer).toBe(verifiedTransferLabel(transfer));
  });
  it('retains final recorded refinements without changing the canonical plan', () => {
    for (const scenario of playback.scenarios) {
      const plan = scenario.turns.findLast(t => t.plan)?.plan;
      if (!plan) continue;
      const before = JSON.stringify(plan);
      const model = buildTripPdfModel({ plan });
      expect(model.days.flatMap(d => d.stops).map(s => s.name)).toEqual(plan.days.flatMap(d => d.stops).map(s => s.name));
      expect(JSON.stringify(plan)).toBe(before);
    }
  });
});
it('fetches latest saved canonical data with cache bypass, never merges stale days', async () => {
  const fresh = structuredClone(trip); fresh.plan.days[0].label = 'Latest accepted day';
  getTrip.mockResolvedValue({ data: fresh });
  expect(await loadTripForPdf({ ...trip, tripId: 'saved-trip' })).toEqual(fresh);
  expect(getTrip).toHaveBeenCalledWith('saved-trip', { skipCache: true });
});
it('refuses a stale fallback if the saved trip cannot be retrieved', async () => {
  getTrip.mockRejectedValue(new Error('offline'));
  await expect(exportTripPdf({ ...trip, tripId: 'saved-trip' })).rejects.toThrow('offline');
  expect(download).not.toHaveBeenCalled();
});
it('passes identical full-plan content to the document at mobile and desktop widths', async () => {
  for (const width of [375, 1440]) {
    vi.stubGlobal('innerWidth', width);
    await exportTripPdf(trip);
  }
  expect(download.mock.calls[0][0].props).toEqual(download.mock.calls[1][0].props);
  expect(download.mock.calls[0][1]).toBe(download.mock.calls[1][1]);
  vi.unstubAllGlobals();
});

it('reloads a public share without using the owner endpoint', async () => {
  const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: trip }) });
  vi.stubGlobal('fetch', fetchMock);
  expect(await loadTripForPdf({ shareId: 'public-share', plan: { days: [] } })).toEqual(trip);
  expect(fetchMock.mock.calls[0][0]).toContain('/trips/shared/public-share');
  expect(fetchMock.mock.calls[0][1]).toEqual({ cache: 'no-store' });
  expect(getTrip).not.toHaveBeenCalled();
  vi.unstubAllGlobals();
});
it('does not call a generic grounded route a scenic drive', () => {
  const copy = structuredClone(trip);
  Object.assign(copy.plan.days[0].stops[0], { placeTypes: ['route'], location: { status: 'resolved' } });
  expect(buildTripPdfModel(copy).days[0].stops[0].meta).toBe('Route · 1 hr 30 min');
});
it('preserves dayparts and intentional downtime in the printable plan', () => {
 const copy=structuredClone(trip);
 copy.plan.days[0].dayStructure={type:'rest',summary:'A slower day.',blocks:[{kind:'outing',periods:['morning'],label:'A short outing',note:'Take your time.',stopIds:['a','b']},{kind:'downtime',periods:['midday','evening'],label:'Lunch and recovery',note:'Rest near the base.',stopIds:[]}]};
 const model=buildTripPdfModel(copy);
 expect(model.days[0]).toMatchObject({dayType:'rest',summary:'A slower day.',blocks:[{stopNumbers:[1,2]},{label:'Lunch and recovery',stopNumbers:[]}]});
});
