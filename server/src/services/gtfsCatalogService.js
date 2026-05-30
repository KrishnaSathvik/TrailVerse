const { normalizeUrl } = require('../utils/htmlEntities');

const GTFS_DATASET_JSON_URL =
  'https://www.nps.gov/common/uploads/sortable_dataset/developer/7A3D14E9-D971-C526-7A2BDBD1DE0CE1A7/7A3D14E9-D971-C526-7A2BDBD1DE0CE1A7.json';

const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

function stripHtml(value) {
  return String(value || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function hrefFromHtml(value) {
  const s = String(value || '');
  const m = s.match(/href="([^"]+)"/i);
  const href = m?.[1] || stripHtml(s);
  return normalizeUrl(href);
}

function parkCodeFromHtml(value) {
  const s = String(value || '');
  const m = s.match(/nps\.gov\/([a-z]{4})\//i);
  return m?.[1]?.toLowerCase() || null;
}

function mapRowToFeed(columns, row) {
  // NPS "sortable dataset" JSON returns:
  // - COLUMNS: array (e.g. ["Park","System","GTFS URL",...]) but sometimes HTML-wrapped
  // - DATA: array of rows; each row is typically an array of cell values (strings / HTML anchors)
  if (!Array.isArray(row)) return null;
  const getCell = (idx) => row[idx] ?? '';

  const colLabels = columns.map((c) => stripHtml(c).toLowerCase());
  const parkIdx = colLabels.indexOf('park');
  const systemIdx = colLabels.indexOf('system');
  const gtfsIdx = colLabels.findIndex((l) => l.includes('gtfs'));
  const validIdx = colLabels.findIndex((l) => l.includes('valid'));
  const modifiedIdx = colLabels.findIndex((l) => l.includes('modified'));
  const notesIdx = colLabels.indexOf('notes');

  const parkHtml = getCell(parkIdx >= 0 ? parkIdx : 0);
  const systemHtml = getCell(systemIdx >= 0 ? systemIdx : 1);
  const gtfsHtml = getCell(gtfsIdx >= 0 ? gtfsIdx : 2);

  const parkCode = parkCodeFromHtml(parkHtml);
  const parkName = stripHtml(parkHtml);
  const parkUrl = hrefFromHtml(parkHtml);

  const systemName = stripHtml(systemHtml);
  const systemUrl = hrefFromHtml(systemHtml);

  const gtfsUrl = hrefFromHtml(gtfsHtml);

  const validThrough = stripHtml(getCell(validIdx));
  const lastModified = stripHtml(getCell(modifiedIdx));
  const notes = stripHtml(getCell(notesIdx));

  if (!parkCode || !gtfsUrl) return null;

  return {
    parkCode,
    parkName,
    parkUrl,
    systemName,
    systemUrl,
    gtfsUrl,
    validThrough,
    lastModified,
    notes,
  };
}

async function fetchCatalogFromNps() {
  const res = await fetch(GTFS_DATASET_JSON_URL, {
    headers: {
      'User-Agent': 'TrailVerse/1.0 (+https://www.nationalparksexplorerusa.com)',
      Accept: 'application/json',
    },
    signal: AbortSignal.timeout(12000),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    const err = new Error(`Failed to fetch NPS GTFS dataset: ${res.status}`);
    err.status = res.status;
    err.body = text.slice(0, 500);
    throw err;
  }

  const json = await res.json();
  const columns = Array.isArray(json?.COLUMNS) ? json.COLUMNS : [];
  const data = Array.isArray(json?.DATA) ? json.DATA : [];

  const feeds = [];
  for (const row of data) {
    const feed = mapRowToFeed(columns, row);
    if (feed) feeds.push(feed);
  }

  const byParkCode = new Map();
  for (const feed of feeds) {
    if (!byParkCode.has(feed.parkCode)) byParkCode.set(feed.parkCode, []);
    byParkCode.get(feed.parkCode).push(feed);
  }

  return {
    sourceUrl: GTFS_DATASET_JSON_URL,
    fetchedAt: new Date().toISOString(),
    feeds,
    byParkCode,
  };
}

class GtfsCatalogService {
  constructor({ ttlMs = DEFAULT_TTL_MS } = {}) {
    this.ttlMs = ttlMs;
    this._cache = null;
    this._inFlight = null;
  }

  _isFresh() {
    if (!this._cache?.fetchedAtMs) return false;
    return Date.now() - this._cache.fetchedAtMs < this.ttlMs;
  }

  async getCatalog({ forceRefresh = false } = {}) {
    if (!forceRefresh && this._isFresh()) {
      return { ...this._cache.value, cached: true };
    }

    if (this._inFlight) return this._inFlight;

    this._inFlight = (async () => {
      const value = await fetchCatalogFromNps();
      this._cache = { fetchedAtMs: Date.now(), value };
      return { ...value, cached: false };
    })();

    try {
      return await this._inFlight;
    } finally {
      this._inFlight = null;
    }
  }

  async getFeedsForPark(parkCode, { forceRefresh = false } = {}) {
    const normalized = String(parkCode || '').toLowerCase();
    const catalog = await this.getCatalog({ forceRefresh });
    const feeds = catalog.byParkCode?.get?.(normalized) || [];
    return { catalog, feeds };
  }
}

module.exports = new GtfsCatalogService();
module.exports.GTFS_DATASET_JSON_URL = GTFS_DATASET_JSON_URL;
