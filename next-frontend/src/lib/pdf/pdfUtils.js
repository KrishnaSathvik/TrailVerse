import { PDF_SITE } from './pdfDesignTokens';

export function formatPdfDate(dateStr) {
  if (!dateStr) return null;
  try {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

export function formatPdfDuration(minutes) {
  if (!minutes) return null;
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h} hr`;
}

export function slugifyPdfFilename(title, suffix = '') {
  const base = (title || 'document')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return suffix ? `${base}-${suffix}.pdf` : `${base}.pdf`;
}

export function toAbsoluteAssetUrl(url) {
  if (!url || typeof url !== 'string') return null;
  if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('data:')) {
    return url;
  }
  const base = PDF_SITE.baseUrl;
  if (url.startsWith('//')) return `https:${url}`;
  if (url.startsWith('/')) return `${base}${url}`;
  return `${base}/${url}`;
}

const PLACEHOLDER_HERO_PATTERNS = [
  '/og-image-trailverse',
  '/logo.png',
  'logo.png',
  '/favicon',
  'placeholder',
];

/** True for brand/default assets that should not be used as a trip cover photo. */
export function isPlaceholderHeroUrl(url) {
  if (!url) return true;
  const normalized = url.toLowerCase();
  return PLACEHOLDER_HERO_PATTERNS.some((pattern) => normalized.includes(pattern));
}

export function buildQrImageUrl(text, size = 96) {
  if (!text) return null;
  return `https://quickchart.io/qr?text=${encodeURIComponent(text)}&size=${size}&margin=2&dark=${encodeURIComponent('047857')}&light=${encodeURIComponent('ffffff')}&format=png`;
}

export function sanitizePdfText(text = '') {
  return String(text)
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    // Emoji / symbols Inter often cannot render in @react-pdf/renderer
    .replace(/[\u{1F300}-\u{1FAFF}]/gu, '')
    .replace(/[\u2600-\u27BF]/g, '')
    .replace(/\u2022/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Like sanitizePdfText but keeps leading/trailing spaces for inline segments. */
export function sanitizeInlinePdfText(text = '') {
  return String(text)
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .replace(/[\u{1F300}-\u{1FAFF}]/gu, '')
    .replace(/[\u2600-\u27BF]/g, '')
    .replace(/\u2022/g, '-')
    .replace(/[ \t\n\r]+/g, ' ');
}

export function stripHtml(html = '') {
  return sanitizePdfText(
    html
      .replace(/<br\s*\/?>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  );
}

export function stripInlineHtml(html = '') {
  return sanitizeInlinePdfText(
    html
      .replace(/<br\s*\/?>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/[ \t\n\r]+/g, ' ')
  );
}

/** Ensure PDF link annotations use absolute https URLs. */
export function normalizePdfLinkUrl(url) {
  if (!url || typeof url !== 'string') return null;
  const trimmed = url.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('mailto:') || trimmed.startsWith('tel:')) return trimmed;
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return trimmed;
  return toAbsoluteAssetUrl(trimmed);
}

export function resolveTripShareUrl(trip) {
  if (trip.shareUrl) return normalizePdfLinkUrl(trip.shareUrl);
  if (trip.shareId) {
    return normalizePdfLinkUrl(`${PDF_SITE.baseUrl}/plan-ai/shared/${trip.shareId}`);
  }
  return null;
}

export async function ensureTripShareId(trip) {
  if (trip.shareId) return trip.shareId;
  if (!trip.tripId) return null;

  try {
    const tripService = (await import('@/services/tripService')).default;
    const data = await tripService.shareTrip(trip.tripId);
    return data?.shareId || data?.data?.shareId || null;
  } catch (error) {
    console.warn('[exportTripPdf] Could not create public share link:', error);
    return null;
  }
}

export async function resolveTripHeroImage(trip) {
  const candidates = [
    trip.heroImage,
    trip.formData?.heroImage,
    trip.plan?.heroImage,
    trip.formData?.parkImage,
  ];

  for (const candidate of candidates) {
    const absolute = toAbsoluteAssetUrl(candidate);
    if (absolute) return absolute;
  }

  if (trip.parkCode) {
    try {
      const { getApiBaseUrl } = await import('@/lib/apiBase');
      const response = await fetch(`${getApiBaseUrl()}/parks/${trip.parkCode}/details`, {
        cache: 'no-store',
      });
      if (response.ok) {
        const payload = await response.json();
        const park = payload?.data?.park || payload?.data || payload?.park || payload;
        const imageUrl = park?.images?.[0]?.url;
        if (imageUrl) return imageUrl;
      }
    } catch {
      // fall through — no generic hero for trip PDF cover
    }
  }

  return null;
}

export async function downloadPdfDocument(documentElement, filename) {
  const { pdf } = await import('@react-pdf/renderer');
  const blob = await pdf(documentElement).toBlob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}
