const axios = require('axios');
const fs = require('fs');
const path = require('path');

const RIDB_API_BASE = 'https://ridb.recreation.gov/api/v1';
const RIDB_API_KEY = process.env.RIDB_API_KEY;

const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;
const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;
const ONE_DAY = 24 * 60 * 60 * 1000; // shorter TTL for failed resolutions

/** Recreation.gov public search entity types that carry reservations. */
const REC_GOV_RESERVATION_ENTITY_TYPES = ['permit', 'ticketfacility', 'tour'];

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

  async _searchFacilities(query, state) {
    if (!RIDB_API_KEY) return [];
    try {
      const params = { query, limit: 25 };
      if (state) params.state = state;
      const response = await this.api.get('/facilities', { params });
      return response.data?.RECDATA || [];
    } catch (error) {
      if (error.response?.status !== 429) {
        console.error('RIDB facilities search error:', error.message);
      }
      return [];
    }
  }

  _matchesParkRecGovResult(result, parkName, fullName) {
    const parkLower = parkName.toLowerCase();
    const fullLower = (fullName || parkName).toLowerCase();
    const strippedLower = this._stripCommonSuffixes(fullName || parkName).toLowerCase();
    const parentName = (result.parent_name || '').toLowerCase();
    const name = (result.name || '').toLowerCase();
    const needles = [parkLower, fullLower, strippedLower].filter(Boolean);
    return needles.some((needle) => parentName.includes(needle) || name.includes(needle));
  }

  _mapRecGovResultToFacility(result) {
    const entityType = result.entity_type || '';
    const name = result.name || 'Reservation';
    return {
      FacilityID: String(result.entity_id),
      FacilityName: name,
      FacilityTypeDescription: this._entityTypeToFacilityType(entityType, name),
      FacilityDescription: result.description || result.html_description || '',
      FacilityAdaAccess: false,
      ParentFacilityID: result.parent_id || null,
      ParentFacilityType: result.parent_type || null,
      RecGovEntityType: entityType,
    };
  }

  // Search Recreation.gov for permits, timed entry, ticket facilities, and tours.
  async _searchRecGovReservations(parkName, fullName) {
    const seen = new Set();
    const mapped = [];

    for (const entityType of REC_GOV_RESERVATION_ENTITY_TYPES) {
      try {
        const response = await axios.get('https://www.recreation.gov/api/search', {
          params: { q: parkName, fq: `entity_type:${entityType}`, size: 25 },
          timeout: 10000,
        });
        const results = response.data?.results || [];
        for (const result of results) {
          if (!this._matchesParkRecGovResult(result, parkName, fullName)) continue;
          const id = String(result.entity_id);
          if (seen.has(id)) continue;
          seen.add(id);
          mapped.push(this._mapRecGovResultToFacility(result));
        }
      } catch (error) {
        console.error(`Recreation.gov search error (${entityType}):`, error.message);
      }
    }

    return mapped;
  }

  /** @deprecated use _searchRecGovReservations */
  async _searchRecGovPermits(parkName, fullName) {
    return this._searchRecGovReservations(parkName, fullName);
  }

  async _getParkInfo(parkCode) {
    try {
      const npsService = require('./npsService');
      const park = await npsService.getParkByCode(parkCode);
      if (park) {
        const states = park.states ? park.states.split(',').map(s => s.trim()) : [];
        return { fullName: park.fullName, stateCode: states[0] || null };
      }
    } catch (error) {
      console.error(`Failed to get NPS park for ${parkCode}:`, error.message);
    }

    try {
      const slugsPath = path.join(__dirname, '../../../next-frontend/src/data/park-slugs.json');
      const slugs = JSON.parse(fs.readFileSync(slugsPath, 'utf8'));
      const match = slugs.find((p) => (p.parkCode || '').toLowerCase() === parkCode.toLowerCase());
      if (match?.fullName) {
        return { fullName: match.fullName, stateCode: null };
      }
    } catch (error) {
      console.error(`Park slug fallback failed for ${parkCode}:`, error.message);
    }

    return { fullName: null, stateCode: null };
  }

  async resolveRecAreaId(parkCode) {
    const key = parkCode.toLowerCase();
    const cached = this.parkCodeToRecAreaId.get(key);
    // Use shorter TTL for failed (null) resolutions so they retry sooner
    const cacheTtl = (cached && cached.id === null) ? ONE_DAY : THIRTY_DAYS;
    if (this._isCacheValid(cached, cacheTtl)) {
      return cached.id;
    }

    // Need fullName and state from NPS
    const { fullName, stateCode } = await this._getParkInfo(parkCode);

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
      console.log(`[RIDB] no match for ${parkCode} (${fullName}) — best score=${bestScore}`);
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

  _isPermitLikeFacility(facility) {
    const type = (facility.FacilityTypeDescription || '').toLowerCase();
    const allowed = ['permit', 'timed entry', 'ticket facility', 'tour ticket'];
    if (!allowed.includes(type)) return false;
    // Filter out obviously outdated facilities (e.g. "2020" pilots)
    const name = (facility.FacilityName || '').toLowerCase();
    const yearMatch = name.match(/\b(20\d{2})\b/);
    if (yearMatch) {
      const facilityYear = parseInt(yearMatch[1], 10);
      const currentYear = new Date().getFullYear();
      if (facilityYear < currentYear - 2) return false;
    }
    return true;
  }

  _stripHtml(html) {
    if (!html) return '';
    return String(html)
      .replace(/<[^>]*>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\s+/g, ' ')
      .trim();
  }

  _entityTypeToFacilityType(entityType, name = '') {
    const t = (entityType || '').toLowerCase().replace(/_/g, ' ');
    const n = (name || '').toLowerCase();
    if (t.includes('timed') && t.includes('entry')) return 'Timed Entry';
    if (t === 'tour' && (n.includes('timed entry') || n.includes('timed-entry'))) return 'Timed Entry';
    if (t.includes('ticket')) return 'Ticket Facility';
    if (t === 'tour') return 'Tour Ticket';
    return 'Permit';
  }

  _buildReservationUrl(facility) {
    const type = (facility.FacilityTypeDescription || '').toLowerCase();
    const id = facility.FacilityID;
    const entityType = (facility.RecGovEntityType || '').toLowerCase();
    const parentId = facility.ParentFacilityID;

    if (type === 'timed entry') {
      if (entityType === 'tour' && parentId) {
        return `https://www.recreation.gov/ticket/facility/${parentId}`;
      }
      return `https://www.recreation.gov/timed-entry/${id}`;
    }
    if (type === 'ticket facility' || entityType === 'ticketfacility') {
      return `https://www.recreation.gov/ticket/facility/${id}`;
    }
    if (type === 'tour ticket' || entityType === 'tour') {
      if (parentId && facility.ParentFacilityType === 'facility') {
        return `https://www.recreation.gov/ticket/facility/${parentId}`;
      }
      return `https://www.recreation.gov/ticket/tour/${id}`;
    }
    return `https://www.recreation.gov/permits/${id}`;
  }

  _facilityToPermit(facility) {
    return {
      id: facility.FacilityID,
      name: facility.FacilityName || 'Permit',
      description: this._stripHtml(facility.FacilityDescription || ''),
      type: facility.FacilityTypeDescription || null,
      accessible: facility.FacilityAdaAccess || false,
      district: null,
      town: null,
      facilityName: facility.FacilityName || null,
      reservationUrl: this._buildReservationUrl(facility),
      category: this._permitCategory(facility),
    };
  }

  _permitCategory(facility) {
    const type = (facility.FacilityTypeDescription || '').toLowerCase();
    const name = (facility.FacilityName || '').toLowerCase();
    if (type === 'timed entry') return 'timed_entry';
    if (type === 'tour ticket' && name.includes('timed entry')) return 'timed_entry';
    if (type === 'ticket facility') return 'ticket';
    return 'permit';
  }

  _appendFacilityPermits(facilities, allPermits, seen) {
    for (const facility of facilities) {
      if (!this._isPermitLikeFacility(facility)) continue;
      const id = facility.FacilityID;
      if (seen.has(id)) continue;
      seen.add(id);
      allPermits.push(this._facilityToPermit(facility));
    }
  }

  async _appendRecGovReservations(parkCode, allPermits, seen) {
    const { fullName, stateCode } = await this._getParkInfo(parkCode);
    if (!fullName) return;

    const stripped = this._stripCommonSuffixes(fullName);
    const queries = [stripped, fullName].filter((q, i, arr) => q && arr.indexOf(q) === i);

    for (const query of queries) {
      const recGovFacilities = await this._searchRecGovReservations(query, fullName);
      const before = allPermits.length;
      this._appendFacilityPermits(recGovFacilities, allPermits, seen);
      if (allPermits.length > before) {
        console.log(`[RIDB] ${parkCode} rec.gov "${query}" → +${allPermits.length - before} reservations`);
      }
      if (allPermits.length > 0 && query === stripped) break;
    }
  }

  async _fetchPermits(parkCode) {
    const recAreaId = await this.resolveRecAreaId(parkCode);
    const allPermits = [];
    const seen = new Set();

    // Primary path: RecArea → child facilities
    if (recAreaId) {
      const facilities = await this._getFacilitiesForRecArea(recAreaId);
      console.log(`[RIDB] ${parkCode} recArea=${recAreaId} → ${facilities.length} facilities`);

      this._appendFacilityPermits(facilities, allPermits, seen);
    }

    // RIDB facility search when rec-area path is thin or empty
    if (allPermits.length === 0) {
      const { fullName, stateCode } = await this._getParkInfo(parkCode);
      if (fullName) {
        const stripped = this._stripCommonSuffixes(fullName);
        const searches = [
          { query: fullName, state: stateCode },
          { query: stripped, state: stateCode },
          { query: stripped, state: null },
        ];
        const tried = new Set();
        for (const { query, state } of searches) {
          const key = `${query}|${state}`;
          if (tried.has(key)) continue;
          tried.add(key);
          const directFacilities = await this._searchFacilities(query, state);
          console.log(`[RIDB] ${parkCode} fallback search "${query}" state=${state || 'any'} → ${directFacilities.length} facilities`);
          const before = allPermits.length;
          this._appendFacilityPermits(directFacilities, allPermits, seen);
          if (allPermits.length > before) break;
        }
      }
    }

    // Always supplement with Recreation.gov public search (tours/tickets often missing from RIDB)
    await this._appendRecGovReservations(parkCode, allPermits, seen);

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
}

module.exports = new RIDBService();
