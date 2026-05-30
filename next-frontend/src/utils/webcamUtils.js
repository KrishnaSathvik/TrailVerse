/**
 * NPS webcam helpers — thumbnail URL fixes and status-aware CTAs.
 */

/** Fix doubled-host URLs from NPS (e.g. https://www.nps.govhttps://www.nps.gov/...). */
export function sanitizeNpsImageUrl(url) {
  if (!url || typeof url !== 'string') return null;
  const trimmed = url.trim();
  if (!trimmed) return null;

  const doubled = trimmed.match(/^https?:\/\/www\.nps\.gov(https?:\/\/.+)$/i);
  if (doubled?.[1]) return doubled[1];

  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (trimmed.startsWith('/')) return `https://www.nps.gov${trimmed}`;
  return null;
}

export function getWebcamImage(webcam) {
  const raw = webcam?.images?.[0]?.url;
  const url = sanitizeNpsImageUrl(raw);
  if (!url) return null;
  return {
    url,
    alt: webcam.images[0].altText || webcam.title || 'Webcam',
  };
}

export function getWebcamStatusDisplay(webcam) {
  const status = String(webcam?.status || '').trim();
  const lower = status.toLowerCase();
  const isActive = lower === 'active';
  const isInactive = lower === 'inactive' || lower === 'disabled' || lower === 'offline';

  let tone = 'unknown';
  if (isActive) tone = 'active';
  else if (isInactive) tone = 'inactive';

  return {
    label: status || null,
    tone,
    isActive,
    message: String(webcam?.statusMessage || '').trim() || null,
  };
}

export function getWebcamCta(webcam) {
  const url = webcam?.url?.trim();
  if (!url) return null;

  const status = getWebcamStatusDisplay(webcam);
  const streaming = webcam?.isStreaming === true;

  if (!status.isActive) {
    return {
      href: url,
      label: 'View on NPS',
      hint: status.message || 'This feed may be offline or seasonal.',
    };
  }

  if (streaming) {
    return {
      href: url,
      label: 'Open livestream',
      hint: null,
    };
  }

  return {
    href: url,
    label: 'View webcam',
    hint: null,
  };
}
