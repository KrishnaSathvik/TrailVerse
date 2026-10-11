import { downloadPdfDocument } from './pdfUtils';
import { buildTripPdfModel } from './tripPdfModel';

/** Re-read accepted data on every export. Never publish a share as an export side effect. */
export async function loadTripForPdf(trip) {
  if (trip.tripId) {
    const tripService = (await import('@/services/tripService')).default;
    const response = await tripService.getTrip(trip.tripId, { skipCache: true });
    const saved = response.data || response;
    if (!saved?.plan?.days?.length) throw new Error('Saved itinerary unavailable');
    return saved;
  }
  if (trip.shareId) {
    const { getApiBaseUrl } = await import('@/lib/apiBase');
    const response = await fetch(`${getApiBaseUrl()}/trips/shared/${encodeURIComponent(trip.shareId)}`, { cache: 'no-store' });
    if (!response.ok) throw new Error('Shared itinerary unavailable');
    const payload = await response.json();
    if (!payload.data?.plan?.days?.length) throw new Error('Shared itinerary unavailable');
    return payload.data;
  }
  return trip;
}
export async function exportTripPdf(trip) {
  const saved = await loadTripForPdf(trip);
  const model = buildTripPdfModel(saved);
  const [{ TripPDFDocument }, React] = await Promise.all([
    import('./TripPDFDocument'),
    import('react'),
  ]);
  await downloadPdfDocument(React.createElement(TripPDFDocument, { trip: saved }), model.filename);
}
export default exportTripPdf;
