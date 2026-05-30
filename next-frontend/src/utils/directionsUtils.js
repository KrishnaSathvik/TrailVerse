import { htmlToPlainText } from './htmlUtils';

/** Seasonal closures and GPS caveats in directions copy — not the park Alerts API */
const ACCESS_NOTE_PATTERN =
  /do not always provide accurate|navigation units do not|closed from|closed approximately|may close intermittently|(?:is|are) closed/i;

const GPS_BLOCK_PATTERN = /physical addresses for gps\*?\s*/i;

function splitSentences(text) {
  if (!text?.trim()) return [];
  return text
    .split(/(?<=[.!?])\s+(?=[A-Z("])/)
    .map((s) => s.trim())
    .filter((s) => s.length > 12);
}

const ENTRANCE_LABEL_PATTERN =
  /\b(entrance|headquarters|rim|visitor center|gate|station)\b/i;

function parseEntranceLines(block, { requireStreet = true } = {}) {
  if (!block?.trim()) return [];

  return block
    .split(/\.\s+/)
    .map((segment) => segment.trim())
    .filter(Boolean)
    .map((segment) => {
      const colon = segment.indexOf(':');
      if (colon === -1) return null;
      const label = segment.slice(0, colon).trim();
      const address = segment.slice(colon + 1).trim();
      if (!label || !address || label.length > 80) return null;

      const hasStreet =
        /\d{5}/.test(address) ||
        /\b(rd|road|hwy|highway|ave|street|st|blvd|drive|dr|way|route|interstate|i-\d+)\b/i.test(
          address
        );
      const labeledEntrance = ENTRANCE_LABEL_PATTERN.test(label);

      if (requireStreet && !hasStreet && !labeledEntrance) return null;
      if (!labeledEntrance && !hasStreet) return null;

      return { label, address };
    })
    .filter(Boolean);
}

/** GRCA-style "South Rim: ... ---- North Rim: ..." blocks */
function parseSectionedDirections(text) {
  if (!text?.includes('----')) return { entrances: [], remainder: text };

  const entrances = [];
  const remainder = [];

  for (const chunk of text.split(/\s*----\s*/)) {
    const trimmed = chunk.trim();
    if (!trimmed) continue;

    const colon = trimmed.indexOf(':');
    if (colon === -1) {
      remainder.push(trimmed);
      continue;
    }

    const label = trimmed.slice(0, colon).trim();
    const body = trimmed.slice(colon + 1).trim();
    if (label && body && ENTRANCE_LABEL_PATTERN.test(label)) {
      entrances.push({ label, address: body });
    } else {
      remainder.push(trimmed);
    }
  }

  return { entrances, remainder: remainder.join(' ') };
}

function dedupeEntrances(entrances) {
  const seen = new Set();
  return entrances.filter((e) => {
    const key = `${e.label}|${e.address}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Structure NPS directions: overview prose, entrance subsections, seasonal access notes.
 * Matches how NPS presents directions (paragraphs + per-entrance blocks, not bullet lists).
 */
export function parseDirectionsContent(directionsInfo) {
  const plain = htmlToPlainText(directionsInfo);
  if (!plain) {
    return { overview: null, entrances: [], accessNotes: [] };
  }

  const parts = plain.split(GPS_BLOCK_PATTERN);
  let introRaw = parts[0]?.trim() || '';
  const addressBlock = parts[1]?.trim() || '';

  let entrances = dedupeEntrances(parseEntranceLines(addressBlock));

  const sectioned = parseSectionedDirections(introRaw);
  if (sectioned.entrances.length > 0) {
    entrances = dedupeEntrances([...entrances, ...sectioned.entrances]);
    introRaw = sectioned.remainder;
  }

  const introSentences = splitSentences(introRaw);
  const accessNotes = [];
  const overviewParts = [];

  for (const sentence of introSentences) {
    if (ACCESS_NOTE_PATTERN.test(sentence)) {
      accessNotes.push(sentence);
    } else {
      overviewParts.push(sentence);
    }
  }

  const buildOverview = (parts) =>
    parts.length > 0 ? parts.join(' ') : null;

  // Some parks list HQ/entrances without the GPS header — detect address lines in full text
  if (entrances.length < 2) {
    const fromFull = dedupeEntrances(parseEntranceLines(plain));
    if (fromFull.length >= 2) {
      entrances = fromFull;
      const entranceText = new Set(
        fromFull.flatMap((e) => [e.label, e.address, `${e.label}: ${e.address}`])
      );
      const filtered = overviewParts.filter(
        (b) => !entranceText.has(b) && !fromFull.some((e) => b.includes(e.label))
      );
      return {
        overview: buildOverview(filtered),
        entrances,
        accessNotes,
      };
    }
  }

  return {
    overview: buildOverview(overviewParts),
    entrances,
    accessNotes,
  };
}

/** NPS field name on park records */
export function getParkDirectionsText(park) {
  return park?.directionsInfo || park?.directions || '';
}

/** Official NPS directions page — API has `url` + `directionsInfo`, not `directionsUrl`. */
export function buildNpsDirectionsUrl(park) {
  if (park?.directionsUrl) return park.directionsUrl;

  const code = park?.parkCode?.toLowerCase();
  if (code) {
    return `https://www.nps.gov/${code}/planyourvisit/directions.htm`;
  }

  const indexUrl = park?.url?.trim();
  if (indexUrl && indexUrl.includes('nps.gov')) {
    const match = indexUrl.match(/nps\.gov\/([^/]+)/i);
    if (match?.[1]) {
      return `https://www.nps.gov/${match[1]}/planyourvisit/directions.htm`;
    }
  }

  return null;
}

/** Open park on Google Maps (search/place) — not turn-by-turn directions. */
export function buildGoogleMapsPlaceUrl(park) {
  const name = park?.fullName?.trim();
  const states = park?.states?.trim();
  const label = name && states ? `${name}, ${states}` : name;

  if (label) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(label)}`;
  }
  if (park?.latitude != null && park?.longitude != null) {
    return `https://www.google.com/maps/search/?api=1&query=${park.latitude},${park.longitude}`;
  }
  return null;
}

/** Search a known street address (entrance GPS lines only). */
export function buildEntranceMapsUrl(address) {
  if (!address?.trim()) return null;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address.trim())}`;
}

/** Open a lat/lng (or labeled POI) in Google Maps. */
export function buildCoordinatesMapsUrl(latitude, longitude, label) {
  if (latitude == null || longitude == null) return null;
  const lat = Number(latitude);
  const lon = Number(longitude);
  if (Number.isNaN(lat) || Number.isNaN(lon)) return null;
  const query = label?.trim()
    ? encodeURIComponent(label.trim())
    : `${lat},${lon}`;
  return `https://www.google.com/maps/search/?api=1&query=${query}`;
}
