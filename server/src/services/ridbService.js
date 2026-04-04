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
    if (!RIDB_API_KEY) {
      console.warn('⚠️ RIDB_API_KEY not set — skipping recareas search');
      return [];
    }
    try {
      const params = { query, limit: 10 };
      if (state) params.state = state;
      const response = await this.api.get('/recareas', { params });
      const results = response.data?.RECDATA || [];
      console.log(`[RIDB] search "${query}" state=${state || 'any'} → ${results.length} results`);
      return results;
    } catch (error) {
      if (error.response?.status === 429) {
        console.warn('⚠️ RIDB 429 on recareas search');
        return [];
      }
      if (error.response?.status === 401 || error.response?.status === 403) {
        console.error('⚠️ RIDB auth failed — check RIDB_API_KEY. Status:', error.response.status);
      } else {
        console.error('RIDB recareas search error:', error.message, 'query:', query);
      }
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

    // Helper to find best match in a result set
    const findBest = (results) => {
      let best = null;
      let score = 0;
      for (const recArea of results) {
        const s = this._scoreMatch(recArea.RecAreaName, fullName);
        if (s > score) { score = s; best = recArea; }
      }
      return { best, score };
    };

    // Try queries in order of most specific → least specific.
    // RIDB's state filter can hide exact-name matches (RIDB's state
    // field doesn't always align with NPS), so always try no-state
    // as a fallback.
    const stripped = this._stripCommonSuffixes(fullName);
    const attempts = [
      { query: fullName, state: stateCode },
      { query: fullName, state: null }
    ];
    if (stripped && stripped !== fullName) {
      attempts.push({ query: stripped, state: stateCode });
      attempts.push({ query: stripped, state: null });
    }

    let bestMatch = null;
    let bestScore = 0;
    for (const attempt of attempts) {
      const results = await this._searchRecAreas(attempt.query, attempt.state);
      const { best, score } = findBest(results);
      if (score > bestScore) {
        bestScore = score;
        bestMatch = best;
      }
      // If we got a strong match (exact name), stop searching
      if (bestScore >= 90) break;
    }

    // Require minimum score of 70 to avoid false matches
    const recAreaId = (bestMatch && bestScore >= 70) ? bestMatch.RecAreaID : null;

    if (recAreaId) {
      console.log(`[RIDB] resolved ${parkCode} (${fullName}) → recAreaId=${recAreaId} "${bestMatch.RecAreaName}" score=${bestScore}`);
    } else {
      console.log(`[RIDB] no match for ${parkCode} (${fullName}) — ${results.length} results, best score=${bestScore}`);
    }

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
    console.log(`[RIDB] ${parkCode} recArea=${recAreaId} → ${facilities.length} facilities`);
    if (facilities.length === 0) return [];

    const allPermits = [];
    const seen = new Set();

    // Sequential loop to respect 50 req/min rate limit
    for (const facility of facilities) {
      const permits = await this._getPermitsForFacility(facility.FacilityID);
      if (permits.length > 0) {
        console.log(`[RIDB] facility ${facility.FacilityID} "${facility.FacilityName}" → ${permits.length} permits`);
      }
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

    console.log(`[RIDB] ${parkCode} → ${allPermits.length} total permits`);
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

  // Diagnostic method - bypasses cache and reports each step
  async debugResolve(parkCode) {
    const result = {
      parkCode,
      apiKeySet: !!RIDB_API_KEY,
      apiKeyPrefix: RIDB_API_KEY ? RIDB_API_KEY.substring(0, 8) + '...' : null,
      nps: null,
      searches: [],
      bestMatch: null,
      facilities: null,
      permits: null,
      error: null
    };

    // Clear caches for this park so we get fresh data
    const key = parkCode.toLowerCase();
    this.parkCodeToRecAreaId.delete(key);
    this.permitsByParkCode.delete(key);

    try {
      // Get NPS park info
      const npsService = require('./npsService');
      const park = await npsService.getParkByCode(parkCode);
      if (!park) {
        result.error = 'NPS park not found';
        return result;
      }
      const states = park.states ? park.states.split(',').map(s => s.trim()) : [];
      result.nps = {
        fullName: park.fullName,
        state: states[0] || null,
        allStates: park.states
      };

      // Search with full name + state
      const search1 = await this._searchRecAreas(park.fullName, states[0]);
      result.searches.push({
        query: park.fullName,
        state: states[0],
        count: search1.length,
        results: search1.slice(0, 5).map(r => ({
          id: r.RecAreaID,
          name: r.RecAreaName,
          score: this._scoreMatch(r.RecAreaName, park.fullName)
        }))
      });

      // Search stripped name
      const stripped = this._stripCommonSuffixes(park.fullName);
      if (stripped !== park.fullName) {
        const search2 = await this._searchRecAreas(stripped, states[0]);
        result.searches.push({
          query: stripped,
          state: states[0],
          count: search2.length,
          results: search2.slice(0, 5).map(r => ({
            id: r.RecAreaID,
            name: r.RecAreaName,
            score: this._scoreMatch(r.RecAreaName, park.fullName)
          }))
        });
      }

      // Search without state filter
      const search3 = await this._searchRecAreas(park.fullName, null);
      result.searches.push({
        query: park.fullName,
        state: null,
        count: search3.length,
        results: search3.slice(0, 5).map(r => ({
          id: r.RecAreaID,
          name: r.RecAreaName,
          score: this._scoreMatch(r.RecAreaName, park.fullName)
        }))
      });

      // What would resolveRecAreaId actually return?
      const recAreaId = await this.resolveRecAreaId(parkCode);
      result.bestMatch = recAreaId;

      if (recAreaId) {
        const facilities = await this._getFacilitiesForRecArea(recAreaId);
        result.facilities = {
          count: facilities.length,
          all: facilities.map(f => ({
            id: f.FacilityID,
            name: f.FacilityName,
            typeDescription: f.FacilityTypeDescription,
            reservable: f.Reservable
          }))
        };

        if (facilities.length > 0) {
          // Check ALL facilities for permits
          const permitsByFacility = [];
          for (const f of facilities) {
            const permits = await this._getPermitsForFacility(f.FacilityID);
            if (permits.length > 0) {
              permitsByFacility.push({
                facilityId: f.FacilityID,
                facilityName: f.FacilityName,
                permitCount: permits.length,
                permits: permits.map(p => ({
                  id: p.PermitEntranceID,
                  name: p.PermitEntranceName,
                  type: p.PermitEntranceType
                }))
              });
            }
          }
          result.permits = {
            facilitiesWithPermits: permitsByFacility.length,
            totalPermits: permitsByFacility.reduce((sum, f) => sum + f.permitCount, 0),
            detail: permitsByFacility
          };
        }
      }
    } catch (err) {
      result.error = err.message;
    }

    return result;
  }
}

module.exports = new RIDBService();
