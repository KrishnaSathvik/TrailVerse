const axios = require('axios');

const RIDB_API_BASE = 'https://ridb.recreation.gov/api/v1';
const RIDB_API_KEY = process.env.RIDB_API_KEY;

const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;
const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;

class RIDBService {
  constructor() {
    if (!RIDB_API_KEY || RIDB_API_KEY === 'your_ridb_api_key_here') {
      console.warn('⚠️ RIDB_API_KEY not set — permits feature will return empty results');
    }

    this.api = axios.create({
      baseURL: RIDB_API_BASE,
      headers: RIDB_API_KEY ? { apikey: RIDB_API_KEY } : {},
      timeout: 10000
    });

    // parkCode -> { id: recAreaId|null, timestamp }
    this.parkCodeToRecAreaId = new Map();
    // parkCode -> { data: permit[], timestamp }
    this.permitsByParkCode = new Map();
    // parkCode -> Promise (dedupe concurrent requests)
    this.inFlight = new Map();
  }

  _isCacheValid(entry, ttl) {
    return entry && entry.timestamp && (Date.now() - entry.timestamp) < ttl;
  }

  _normalizeParkName(name) {
    return (name || '').trim().toLowerCase();
  }

  _stripCommonSuffixes(name) {
    return (name || '')
      .replace(/\s+(National Park & Preserve|National Park and Preserve|National Park|National Monument|National Memorial|National Historic Site|National Historical Park|National Seashore|National Lakeshore|National Recreation Area|National Preserve)$/i, '')
      .trim();
  }

  _scoreMatch(recAreaName, fullName) {
    if (!recAreaName || !fullName) return 0;
    const a = this._normalizeParkName(recAreaName);
    const b = this._normalizeParkName(fullName);
    if (a === b) return 100;
    if (a.includes(b) || b.includes(a)) return 75;
    // Strip common suffixes and compare again
    const aStripped = this._normalizeParkName(this._stripCommonSuffixes(recAreaName));
    const bStripped = this._normalizeParkName(this._stripCommonSuffixes(fullName));
    if (aStripped === bStripped) return 90;
    if (aStripped && (aStripped.includes(bStripped) || bStripped.includes(aStripped))) return 70;
    return 0;
  }

  async _searchRecAreas(query, state) {
    try {
      const response = await this.api.get('/recareas', {
        params: { query, state, limit: 5 }
      });
      return response.data?.RECDATA || [];
    } catch (error) {
      if (error.response?.status === 429) {
        console.warn('⚠️ RIDB 429 on recareas search');
        return [];
      }
      console.error('RIDB recareas search error:', error.message);
      return [];
    }
  }

  async resolveRecAreaId(parkCode) {
    const key = parkCode.toLowerCase();
    const cached = this.parkCodeToRecAreaId.get(key);
    if (this._isCacheValid(cached, THIRTY_DAYS)) {
      return cached.id;
    }

    // Need fullName and state from NPS
    let fullName = null;
    let stateCode = null;
    try {
      const npsService = require('./npsService');
      const park = await npsService.getParkByCode(parkCode);
      if (park) {
        fullName = park.fullName;
        const states = park.states ? park.states.split(',').map(s => s.trim()) : [];
        stateCode = states[0] || null;
      }
    } catch (error) {
      console.error(`Failed to get NPS park for ${parkCode}:`, error.message);
    }

    if (!fullName) {
      this.parkCodeToRecAreaId.set(key, { id: null, timestamp: Date.now() });
      return null;
    }

    // First search with full name
    let results = await this._searchRecAreas(fullName, stateCode);

    // Retry with stripped suffix if no match
    if (results.length === 0) {
      const stripped = this._stripCommonSuffixes(fullName);
      if (stripped && stripped !== fullName) {
        results = await this._searchRecAreas(stripped, stateCode);
      }
    }

    // Fuzzy match
    let bestMatch = null;
    let bestScore = 0;
    for (const recArea of results) {
      const score = this._scoreMatch(recArea.RecAreaName, fullName);
      if (score > bestScore) {
        bestScore = score;
        bestMatch = recArea;
      }
    }

    // Require minimum score of 70 to avoid false matches
    const recAreaId = (bestMatch && bestScore >= 70) ? bestMatch.RecAreaID : null;

    this.parkCodeToRecAreaId.set(key, { id: recAreaId, timestamp: Date.now() });
    return recAreaId;
  }

  async _getFacilitiesForRecArea(recAreaId) {
    try {
      const response = await this.api.get(`/recareas/${recAreaId}/facilities`, {
        params: { limit: 50 }
      });
      return response.data?.RECDATA || [];
    } catch (error) {
      if (error.response?.status === 429) {
        console.warn(`⚠️ RIDB 429 on facilities for recArea ${recAreaId}`);
        return [];
      }
      console.error(`RIDB facilities error for ${recAreaId}:`, error.message);
      return [];
    }
  }

  async _getPermitsForFacility(facilityId) {
    try {
      const response = await this.api.get(`/facilities/${facilityId}/permitentrances`, {
        params: { limit: 50 }
      });
      return response.data?.RECDATA || [];
    } catch (error) {
      if (error.response?.status === 429) {
        console.warn(`⚠️ RIDB 429 on permits for facility ${facilityId}`);
        return [];
      }
      // 404s are common — not every facility has permits
      if (error.response?.status !== 404) {
        console.error(`RIDB permits error for facility ${facilityId}:`, error.message);
      }
      return [];
    }
  }

  async _fetchPermits(parkCode) {
    const recAreaId = await this.resolveRecAreaId(parkCode);
    if (!recAreaId) return [];

    const facilities = await this._getFacilitiesForRecArea(recAreaId);
    if (facilities.length === 0) return [];

    const allPermits = [];
    const seen = new Set();

    // Sequential loop to respect 50 req/min rate limit
    for (const facility of facilities) {
      const permits = await this._getPermitsForFacility(facility.FacilityID);
      for (const permit of permits) {
        const id = permit.PermitEntranceID;
        if (seen.has(id)) continue;
        seen.add(id);
        allPermits.push({
          id,
          name: permit.PermitEntranceName || 'Permit',
          description: permit.PermitEntranceDescription || '',
          type: permit.PermitEntranceType || null,
          accessible: permit.PermitEntranceAccessible || false,
          district: permit.District || null,
          town: permit.Town || null,
          facilityName: facility.FacilityName || null,
          reservationUrl: `https://www.recreation.gov/permits/${id}`
        });
      }
    }

    return allPermits;
  }

  async getPermitsForPark(parkCode) {
    const key = parkCode.toLowerCase();

    // Return cached result if fresh
    const cached = this.permitsByParkCode.get(key);
    if (this._isCacheValid(cached, SEVEN_DAYS)) {
      return cached.data;
    }

    // Return in-flight promise if one exists
    if (this.inFlight.has(key)) {
      return this.inFlight.get(key);
    }

    // Start a new fetch, store promise for deduplication
    const promise = this._fetchPermits(key)
      .then(data => {
        this.permitsByParkCode.set(key, { data, timestamp: Date.now() });
        return data;
      })
      .catch(error => {
        console.error(`getPermitsForPark(${key}) failed:`, error.message);
        // Return stale cache if available
        return cached?.data || [];
      })
      .finally(() => {
        this.inFlight.delete(key);
      });

    this.inFlight.set(key, promise);
    return promise;
  }
}

module.exports = new RIDBService();
