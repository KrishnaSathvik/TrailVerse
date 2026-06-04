import { registerPdfFonts } from './pdfFonts';
import {
  downloadPdfDocument,
  ensureTripShareId,
  resolveTripHeroImage,
  slugifyPdfFilename,
} from './pdfUtils';

export async function exportTripPdf(trip) {
  await registerPdfFonts();

  const [heroImage, shareId] = await Promise.all([
    resolveTripHeroImage(trip),
    ensureTripShareId(trip),
  ]);

  const tripForPdf = {
    ...trip,
    heroImage,
    shareId: shareId || trip.shareId || null,
  };

  const [{ TripPDFDocument }, React] = await Promise.all([
    import('./TripPDFDocument'),
    import('react'),
  ]);

  const filename = slugifyPdfFilename(trip.title || trip.parkName || 'trip-plan', 'trip-plan');
  await downloadPdfDocument(
    React.createElement(TripPDFDocument, { trip: tripForPdf }),
    filename,
  );
}

export default exportTripPdf;
