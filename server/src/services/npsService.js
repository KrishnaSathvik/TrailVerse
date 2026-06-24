const axios = require('axios');
const NodeCache = require('node-cache');
const ParkSnapshot = require('../models/ParkSnapshot');
const NpsSnapshot = require('../models/NpsSnapshot');

const NPS_API_BASE = 'https://developer.nps.gov/api/v1';
const API_KEY = process.env.NPS_API_KEY;
const PARKS_SNAPSHOT_KEY = 'all-parks';

class NPSService {
  constructor() {
    if (!API_KEY || API_KEY === 'your_nps_api_key_here') {
      throw new Error('NPS API key is required. Please set NPS_API_KEY in your environment variables.');
    }

    this.api = axios.create({
      baseURL: NPS_API_BASE,
      params: {
        api_key: API_KEY
      }
    });

    // Global rate-limit backoff: when a 429 is received, stop all NPS calls
    // for a cooldown period to let the rate limit window reset
    this._rateLimitedUntil = 0;
    this._rateLimitCooldown = 10 * 60 * 1000; // 10 min backoff after 429

    // Axios response interceptor: auto-trigger global backoff on 429
    this.api.interceptors.response.use(
      response => response,
      error => {
        if (error.response?.status === 429) {
          this._markRateLimited();
        }
        return Promise.reject(error);
      }
    );

    // Cache system for events
    this.eventsCache = {
      data: null,
      timestamp: null,
      ttl: 3 * 24 * 60 * 60 * 1000 // 3 days — events are set up weeks/months ahead
    };

    // Cache all parks aggressively since the upstream dataset is relatively static
    this.parksCache = {
      data: null,
      timestamp: null,
      ttl: 7 * 24 * 60 * 60 * 1000 // 7 days — parks almost never change
    };

    // Cache for activities (bulk fetch, rarely changes)
    this.activitiesCache = {
      data: null,
      timestamp: null,
      ttl: 7 * 24 * 60 * 60 * 1000 // 7 days
    };

    // Official NPS activity taxonomy (/activities — not thingstodo)
    this.activityTaxonomyCache = {
      data: null,
      timestamp: null,
      ttl: 7 * 24 * 60 * 60 * 1000
    };

    this.topicTaxonomyCache = {
      data: null,
      timestamp: null,
      ttl: 7 * 24 * 60 * 60 * 1000
    };

    this.amenityTaxonomyCache = {
      data: null,
      timestamp: null,
      ttl: 7 * 24 * 60 * 60 * 1000
    };

    // Bulk alerts cache keyed by parkCode (alerts are time-sensitive but
    // bulk-fetching once avoids per-park API calls on detail pages)
    this.alertsCache = {
      data: null,       // { parkCode: alert[] }
      timestamp: null,
      ttl: 30 * 60 * 1000 // 30 minutes
    };

    // Bulk campgrounds cache keyed by parkCode
    this.campgroundsCache = {
      data: null,       // { parkCode: campground[] }
      timestamp: null,
      ttl: 24 * 60 * 60 * 1000 // 24 hours — rarely changes
    };

    // Bulk visitor centers cache keyed by parkCode
    this.visitorCentersCache = {
      data: null,       // { parkCode: visitorCenter[] }
      timestamp: null,
      ttl: 24 * 60 * 60 * 1000 // 24 hours
    };

    // Bulk places cache keyed by parkCode
    this.placesCache = {
      data: null,
      timestamp: null,
      ttl: 24 * 60 * 60 * 1000 // 24 hours — places rarely change
    };

    // Bulk tours cache keyed by parkCode
    this.toursCache = {
      data: null,
      timestamp: null,
      ttl: 24 * 60 * 60 * 1000 // 24 hours
    };

    // Bulk webcams cache keyed by parkCode
    this.webcamsCache = {
      data: null,
      timestamp: null,
      ttl: 24 * 60 * 60 * 1000 // 24 hours — webcam metadata doesn't change often
    };

    // Bulk parking lots cache keyed by parkCode
    this.parkingLotsCache = {
      data: null,
      timestamp: null,
      ttl: 24 * 60 * 60 * 1000 // 24 hours — parking lots rarely change
    };

    // O(1) parkCode → park record (rebuilt whenever parksCache updates)
    this.parksByCode = new Map();

    // Per-endpoint caches for individual park data (bounded with auto-eviction)
    this.endpointCache = new NodeCache({ maxKeys: 500, checkperiod: 120 });
    this.endpointCacheTTLs = {
      alerts: 30 * 60 * 1000,           // 30 min — safety-critical
      eventsQuery: 24 * 60 * 60 * 1000,
      eventsSummary: 24 * 60 * 60 * 1000,
      parkinglots: 30 * 24 * 60 * 60 * 1000,
      webcams: 30 * 24 * 60 * 60 * 1000,
      transit: 15 * 60 * 1000,          // 15 min — seasonal schedules
      // NPS catalog payloads — change rarely (seasonal at most)
      activities: 30 * 24 * 60 * 60 * 1000,
      campgrounds: 30 * 24 * 60 * 60 * 1000,
      visitorcenters: 30 * 24 * 60 * 60 * 1000,
      parksByState: 30 * 24 * 60 * 60 * 1000,
      places: 30 * 24 * 60 * 60 * 1000,
      tours: 30 * 24 * 60 * 60 * 1000,
      gallery: 30 * 24 * 60 * 60 * 1000,
      videos: 30 * 24 * 60 * 60 * 1000,
      facilities: 30 * 24 * 60 * 60 * 1000,
    };
  }

  // --- Generic named-cache helpers ---

  _isCacheValid(cache) {
    if (!cache.data || !cache.timestamp) return false;
    return Date.now() - cache.timestamp < cache.ttl;
  }

  // Check if cache is valid
  isCacheValid() {
    return this._isCacheValid(this.eventsCache);
  }

  // Get cached events if valid
  getCachedEvents() {
    if (
      this.isCacheValid()
      && Array.isArray(this.eventsCache.data)
      && this.eventsCache.data.length > 0
    ) {
      console.log('📦 Returning cached events');
      return this.eventsCache.data;
    }
    return null;
  }

  // Set events cache
  setEventsCache(data) {
    if (!Array.isArray(data) || data.length === 0) return;
    this.eventsCache = {
      ...this.eventsCache,
      data,
      timestamp: Date.now()
    };
    console.log(`💾 Events cached (${data.length} items) for ${this.eventsCache.ttl / 60000} minutes`);
  }

  // --- Activities cache ---

  getCachedActivities() {
    if (this._isCacheValid(this.activitiesCache)) {
      return this.activitiesCache.data;
    }
    return null;
  }

  setActivitiesCache(data) {
    this.activitiesCache = {
      ...this.activitiesCache,
      data,
      timestamp: Date.now()
    };
    console.log(`💾 Activities cached (${data.length} items) for 24 hours`);
  }

  // --- Per-endpoint cache helpers ---

  _getEndpointCache(key, type) {
    const data = this.endpointCache.get(key);
    return data !== undefined ? data : null;
  }

  /** Per-park list endpoints — skip cached empty arrays so rate-limit misses can retry. */
  _getEndpointListCache(key, type) {
    const cached = this._getEndpointCache(key, type);
    if (Array.isArray(cached) && cached.length > 0) return cached;
    return null;
  }

  _setEndpointCache(key, data, type, { allowEmpty = false } = {}) {
    if (Array.isArray(data) && data.length === 0 && !allowEmpty) return;
    if (typeof data === 'number' && data === 0 && !allowEmpty) return;
    const ttlMs = this.endpointCacheTTLs[type] || 30 * 60 * 1000;
    const ttlSeconds = Math.round(ttlMs / 1000);
    try {
      this.endpointCache.set(key, data, ttlSeconds);
    } catch (err) {
      // NodeCache throws when maxKeys (500) is full — evict one stale key and retry.
      if (!/max keys/i.test(err?.message || '')) throw err;
      const keys = this.endpointCache.keys();
      if (keys.length > 0) {
        this.endpointCache.del(keys[0]);
      }
      this.endpointCache.set(key, data, ttlSeconds);
    }
  }

  // --- Rate-limit backoff ---

  _markRateLimited() {
    this._rateLimitedUntil = Date.now() + this._rateLimitCooldown;
    const mins = Math.round(this._rateLimitCooldown / 60000);
    console.warn(`🚫 NPS rate-limited — backing off for ${mins} minutes (until ${new Date(this._rateLimitedUntil).toISOString()})`);
  }

  _isRateLimited() {
    return Date.now() < this._rateLimitedUntil;
  }

  _buildQueryCacheKey(prefix, params = {}) {
    const searchParams = new URLSearchParams();

    Object.entries(params)
      .filter(([, value]) => value !== undefined && value !== null && value !== '')
      .sort(([a], [b]) => a.localeCompare(b))
      .forEach(([key, value]) => {
        searchParams.set(key, String(value));
      });

    const serialized = searchParams.toString();
    return serialized ? `${prefix}:${serialized}` : prefix;
  }

  _normalizeNpsEvent(event) {
    const normalizedImages = Array.isArray(event.images)
      ? event.images
          .map((image) => ({
            ...image,
            url: image?.url
              ? (image.url.startsWith('http') ? image.url : `https://www.nps.gov${image.url}`)
              : '',
          }))
          .filter((image) => image.url)
      : [];

    return {
      ...event,
      parkCode: event.parkCode || event.sitecode || '',
      parkName: event.parkfullname || event.parkName || '',
      images: normalizedImages,
    };
  }

  _dedupeNpsEvents(events) {
    const seen = new Set();

    return events.filter((event) => {
      const normalized = this._normalizeNpsEvent(event);
      const firstTime = Array.isArray(normalized.times) && normalized.times.length > 0
        ? `${normalized.times[0]?.timestart || ''}-${normalized.times[0]?.timeend || ''}`
        : normalized.timeinfo || '';
      const key = [
        normalized.id || normalized.eventid || normalized.title,
        normalized.parkCode,
        normalized.date || normalized.datestart || '',
        firstTime,
      ].join('::');

      if (seen.has(key)) {
        return false;
      }

      seen.add(key);
      return true;
    }).map((event) => this._normalizeNpsEvent(event));
  }

  // --- MongoDB snapshot helpers for all bulk data ---
  // Persist bulk data so deploys don't need to re-fetch from NPS API

  async _loadSnapshot(key, ttl) {
    const FAST_MS = 8000;
    const EXTENDED_MS = 25000;

    const applySnapshot = (snapshot) => {
      if (!snapshot?.data) return null;
      const age = Date.now() - new Date(snapshot.fetchedAt).getTime();
      if (age > ttl) {
        console.log(`🗄️ Snapshot "${key}" is stale (${Math.round(age / 60000)}min old), will refresh`);
        return { data: snapshot.data, stale: true };
      }
      console.log(`🗄️ Loaded fresh snapshot "${key}" (${Math.round(age / 60000)}min old)`);
      return { data: snapshot.data, stale: false };
    };

    try {
      const snapshot = await Promise.race([
        NpsSnapshot.findOne({ key }).select('data fetchedAt').lean(),
        new Promise((_, reject) => {
          setTimeout(() => reject(new Error('snapshot load timeout')), FAST_MS);
        }),
      ]);
      return applySnapshot(snapshot);
    } catch (error) {
      if (error.message !== 'snapshot load timeout') {
        console.warn(`⚠️ Failed to load snapshot "${key}":`, error.message);
        return null;
      }

      console.warn(`⚠️ Snapshot "${key}" slow — retrying with extended read`);
      try {
        const snapshot = await NpsSnapshot.findOne({ key })
          .select('data fetchedAt')
          .lean()
          .maxTimeMS(EXTENDED_MS);
        const result = applySnapshot(snapshot);
        if (result) {
          console.log(`🗄️ Snapshot "${key}" loaded on extended read (stale=${result.stale})`);
        }
        return result;
      } catch (retryErr) {
        console.warn(`⚠️ Extended snapshot read failed for "${key}":`, retryErr.message);
        return null;
      }
    }
  }

  async _saveSnapshot(key, data) {
    try {
      const isEmptyArray = Array.isArray(data) && data.length === 0;
      const isZeroSummary = typeof data === 'number' && data === 0 && String(key).startsWith('events-');
      if (isEmptyArray || isZeroSummary) {
        console.warn(`⚠️ Skipping empty snapshot save for "${key}"`);
        return;
      }

      const itemCount = Array.isArray(data)
        ? data.length
        : (typeof data === 'number'
          ? data
          : Object.values(data).reduce((sum, arr) => sum + (arr?.length || 0), 0));
      await NpsSnapshot.updateOne(
        { key },
        { $set: { data, itemCount, fetchedAt: new Date() } },
        { upsert: true }
      );
      console.log(`🗄️ Saved snapshot "${key}" (${itemCount} items)`);
    } catch (error) {
      console.warn(`⚠️ Failed to save snapshot "${key}":`, error.message);
    }
  }

  _normalizeParkCode(parkCode) {
    return String(parkCode || '').toLowerCase();
  }

  _itemParkCode(item) {
    const code = item?.parkCode || item?.relatedParks?.[0]?.parkCode || item?.siteCode;
    return code ? String(code).toLowerCase() : '';
  }

  _getGroupedBulkSlice(data, parkCode) {
    if (!data) return null;
    const code = this._normalizeParkCode(parkCode);

    if (!Array.isArray(data) && typeof data === 'object') {
      const slice = data[code] || data[parkCode] || data[String(parkCode || '').toUpperCase()];
      if (Array.isArray(slice) && slice.length > 0) return slice;
    }

    if (Array.isArray(data)) {
      const filtered = data.filter((item) => this._itemParkCode(item) === code);
      if (filtered.length > 0) return filtered;
    }

    return null;
  }

  _bulkSnapshotMemoryCache(snapshotKey) {
    const map = {
      'bulk-activities': this.activitiesCache,
      'bulk-places': this.placesCache,
      'bulk-campgrounds': this.campgroundsCache,
      'bulk-visitorcenters': this.visitorCentersCache,
      'bulk-tours': this.toursCache,
      'bulk-webcams': this.webcamsCache,
      'bulk-parkinglots': this.parkingLotsCache,
      'bulk-alerts': this.alertsCache,
    };
    return map[snapshotKey] || null;
  }

  async _getParkBulkSliceFromSnapshot(snapshotKey, parkCode) {
    const bulkData = await this._ensureBulkDataLoaded(snapshotKey, null);
    return this._getGroupedBulkSlice(bulkData, parkCode) || null;
  }

  async _tryBulkSnapshotForPark(snapshotKey, parkCode, endpointCacheKey, endpointCacheType) {
    const slice = await this._getParkBulkSliceFromSnapshot(snapshotKey, parkCode);
    if (!slice) return null;
    if (endpointCacheKey && endpointCacheType) {
      this._setEndpointCache(endpointCacheKey, slice, endpointCacheType, { allowEmpty: true });
    }
    return slice;
  }

  _hasBulkData(data) {
    if (!data) return false;
    if (Array.isArray(data)) return data.length > 0;
    if (typeof data === 'object') return Object.keys(data).length > 0;
    return false;
  }

  _hydrateBulkMemoryCache(snapshotKey, data) {
    const memoryCache = this._bulkSnapshotMemoryCache(snapshotKey);
    if (!memoryCache || !data) return;
    memoryCache.data = data;
    memoryCache.timestamp = Date.now();
  }

  /** Load bulk tab data from memory or Mongo (stale OK) before per-park NPS calls. */
  async _ensureBulkDataLoaded(snapshotKey, getAllFn = null) {
    const memoryCache = this._bulkSnapshotMemoryCache(snapshotKey);
    if (memoryCache?.data && this._hasBulkData(memoryCache.data)) {
      return memoryCache.data;
    }

    const snapshot = await this._loadSnapshot(snapshotKey, Infinity);
    if (snapshot?.data && this._hasBulkData(snapshot.data)) {
      this._hydrateBulkMemoryCache(snapshotKey, snapshot.data);
      return snapshot.data;
    }

    if (typeof getAllFn === 'function') {
      const fetched = await getAllFn();
      if (this._hasBulkData(fetched)) {
        return fetched;
      }
    }

    return null;
  }

  /**
   * Bulk snapshot → per-park endpoint cache → optional NPS fetch.
   * Skips empty endpoint cache; never caches empty from rate-limit misses.
   */
  async _fetchParkTabList({
    parkCode,
    snapshotKey = null,
    cacheKey,
    cacheType,
    getAllBulk = null,
    fetchFromNps,
    label = cacheType,
    rethrowOnError = false,
  }) {
    const code = this._normalizeParkCode(parkCode);
    if (!code) return [];

    const cached = this._getEndpointListCache(cacheKey, cacheType);
    if (cached) return cached;

    let bulkData = null;
    if (snapshotKey) {
      bulkData = await this._ensureBulkDataLoaded(snapshotKey, getAllBulk);
      const fromBulk = bulkData ? this._getGroupedBulkSlice(bulkData, code) : null;
      if (fromBulk?.length) {
        this._setEndpointCache(cacheKey, fromBulk, cacheType, { allowEmpty: true });
        return fromBulk;
      }
    }

    if (this._isRateLimited()) {
      console.warn(`⚠️ NPS rate-limited — trying ${label} for ${code} via bulk/API fallback`);
    }

    try {
      const data = await fetchFromNps(code);
      if (Array.isArray(data) && data.length > 0) {
        this._setEndpointCache(cacheKey, data, cacheType, { allowEmpty: true });
        return data;
      }

      if (snapshotKey) {
        bulkData = bulkData || await this._ensureBulkDataLoaded(snapshotKey, getAllBulk);
        const retry = bulkData ? this._getGroupedBulkSlice(bulkData, code) : null;
        if (retry?.length) {
          this._setEndpointCache(cacheKey, retry, cacheType, { allowEmpty: true });
          return retry;
        }
      }

      return Array.isArray(data) ? data : [];
    } catch (error) {
      if (snapshotKey) {
        const fallbackBulk = await this._ensureBulkDataLoaded(snapshotKey, null);
        const fallback = fallbackBulk ? this._getGroupedBulkSlice(fallbackBulk, code) : null;
        if (fallback?.length) {
          this._setEndpointCache(cacheKey, fallback, cacheType, { allowEmpty: true });
          return fallback;
        }
      }
      if (error.response?.status === 429) {
        console.warn(`⚠️ NPS 429 on ${label} for ${code}`);
        return [];
      }
      console.error(`❌ NPS API Error (${label} for ${code}):`, error.message);
      if (rethrowOnError) throw error;
      return [];
    }
  }

  /** Warm bulk tab snapshots from Mongo into memory (no NPS calls). */
  async warmParkTabSnapshots() {
    const keys = [
      'bulk-places',
      'bulk-campgrounds',
      'bulk-visitorcenters',
      'bulk-tours',
      'bulk-webcams',
      'bulk-parkinglots',
      'bulk-activities',
      'bulk-alerts',
    ];
    for (const key of keys) {
      try {
        const data = await this._ensureBulkDataLoaded(key, null);
        if (this._hasBulkData(data)) {
          const count = Array.isArray(data) ? data.length : Object.keys(data).length;
          console.log(`🗄️ Warmed ${key} in memory (${count} entries)`);
        }
      } catch (error) {
        console.warn(`⚠️ Failed to warm ${key}:`, error.message);
      }
    }
  }

  isParksCacheValid() {
    if (!this.parksCache.data || !this.parksCache.timestamp) {
      return false;
    }
    return Date.now() - this.parksCache.timestamp < this.parksCache.ttl;
  }

  getCachedParks() {
    if (this.isParksCacheValid()) {
      return this.parksCache.data;
    }
    return null;
  }

  _rebuildParksByCodeIndex(parks = []) {
    this.parksByCode = new Map();
    for (const park of parks) {
      const code = park?.parkCode?.toLowerCase();
      if (code) {
        this.parksByCode.set(code, park);
      }
    }
  }

  setParksCache(data) {
    this.parksCache = {
      data,
      timestamp: Date.now(),
      ttl: 24 * 60 * 60 * 1000
    };
    this._rebuildParksByCodeIndex(data);
    console.log(`💾 Cached ${data.length} parks for 24 hours`);
  }

  async getPersistentParksSnapshot() {
    try {
      const snapshot = await ParkSnapshot.findOne({ key: PARKS_SNAPSHOT_KEY }).lean();
      if (!snapshot?.parks?.length) {
        return null;
      }

      console.log(`🗄️ Returning persistent parks snapshot with ${snapshot.parks.length} parks`);
      this.setParksCache(snapshot.parks);
      return snapshot.parks;
    } catch (error) {
      console.warn('⚠️ Failed to load persistent parks snapshot:', error.message);
      return null;
    }
  }

  async savePersistentParksSnapshot(parks) {
    try {
      await ParkSnapshot.updateOne(
        { key: PARKS_SNAPSHOT_KEY },
        {
          $set: {
            parks,
            parkCount: parks.length,
            fetchedAt: new Date(),
          },
        },
        { upsert: true }
      );
      console.log(`🗄️ Saved persistent parks snapshot with ${parks.length} parks`);
    } catch (error) {
      console.warn('⚠️ Failed to save persistent parks snapshot:', error.message);
    }
  }

  // Get all parks with pagination to ensure we get all parks
  async getAllParks(limit = 600) {
    const cachedParks = this.getCachedParks();
    if (cachedParks) {
      return cachedParks;
    }

    try {
      let allParks = [];
      let start = 0;
      const pageSize = 100; // NPS API max per page is 100
      
      while (true) {
        const response = await this.api.get('/parks', {
          params: { 
            limit: pageSize,
            start: start
          }
        });
        
        const parks = response.data.data;
        if (!parks || parks.length === 0) {
          break; // No more parks to fetch
        }
        
        allParks = allParks.concat(parks);
        start += pageSize;
        
        // If we got fewer parks than requested, we've reached the end
        if (parks.length < pageSize) {
          break;
        }

        // Safety limit to prevent infinite loops while still allowing the full NPS unit dataset
        if (allParks.length >= limit) {
          break;
        }

        // Small delay between pages to avoid burst traffic
        await new Promise(resolve => setTimeout(resolve, 200));
      }
      
      const nationalParksCount = allParks.filter(park => 
        park.designation && park.designation.toLowerCase().includes('national park')
      ).length;
      console.log(`📊 Fetched ${allParks.length} total parks from NPS API`);
      console.log(`🏞️ Found ${nationalParksCount} National Parks (including variations) out of ${allParks.length} total parks`);
      
      // Debug: Count all different designations
      const designations = {};
      allParks.forEach(park => {
        const designation = park.designation || 'Unknown';
        designations[designation] = (designations[designation] || 0) + 1;
      });
      
      console.log('📋 Park designations breakdown:');
      Object.entries(designations)
        .sort((a, b) => b[1] - a[1]) // Sort by count descending
        .forEach(([designation, count]) => {
          console.log(`   ${designation}: ${count}`);
        });
      
      // Specifically check for any parks that might be National Parks but with different designation
      const potentialNationalParks = allParks.filter(park => {
        const name = park.fullName?.toLowerCase() || '';
        const designation = park.designation?.toLowerCase() || '';
        return (
          name.includes('national park') && 
          designation !== 'national park' &&
          !name.includes('national monument') &&
          !name.includes('national historic') &&
          !name.includes('national recreation')
        );
      });
      
      if (potentialNationalParks.length > 0) {
        console.log('🔍 Potential National Parks with different designations:');
        potentialNationalParks.forEach(park => {
          console.log(`   ${park.fullName} - Designation: ${park.designation}`);
        });
      }
      
      // Check for recent National Parks that might be missing
      const recentNationalParks = [
        'New River Gorge National Park and Preserve',
        'Indiana Dunes National Park',
        'Gateway Arch National Park',
        'Pinnacles National Park'
      ];
      
      const missingParks = recentNationalParks.filter(recentPark => {
        return !allParks.some(park => 
          park.fullName?.toLowerCase().includes(recentPark.toLowerCase()) && 
          park.designation === 'National Park'
        );
      });
      
      if (missingParks.length > 0) {
        console.log('⚠️  Potentially missing recent National Parks:');
        missingParks.forEach(park => {
          console.log(`   ${park}`);
        });
      }

      this.setParksCache(allParks);
      await this.savePersistentParksSnapshot(allParks);
      return allParks;
    } catch (error) {
      if (error.response?.status === 429) {
        console.warn('⚠️ NPS 429 rate limit on parks endpoint');
      } else {
        console.error('NPS API Error:', error.message);
      }

      if (this.parksCache.data) {
        console.warn('⚠️ Returning stale cached parks after NPS failure');
        return this.parksCache.data;
      }

      const stalePersistentParks = await this.getPersistentParksSnapshot();
      if (stalePersistentParks?.length) {
        console.warn('⚠️ Returning persistent parks snapshot after NPS failure');
        return stalePersistentParks;
      }

      throw new Error(`Failed to fetch parks: ${error.message}`);
    }
  }

  // Get park by code
  async getParkByCode(parkCode) {
    const normalizedParkCode = String(parkCode || '').toLowerCase();

    const findParkByCode = (parks = []) =>
      parks.find((park) => park?.parkCode?.toLowerCase() === normalizedParkCode) || null;

    try {
      const indexed = this.parksByCode.get(normalizedParkCode);
      if (indexed) {
        return indexed;
      }

      const allParks = await this.getAllParks();
      const fullDatasetMatch = this.parksByCode.get(normalizedParkCode) || findParkByCode(allParks);
      if (fullDatasetMatch) {
        return fullDatasetMatch;
      }

      const response = await this.api.get('/parks', {
        params: { parkCode: normalizedParkCode }
      });
      return response.data.data[0] || null;
    } catch (error) {
      console.error('NPS API Error:', error.message);

      // Final fallback to any stale full dataset we still have in memory.
      if (this.parksCache.data) {
        const staleMatch = findParkByCode(this.parksCache.data);
        if (staleMatch) {
          console.warn(`⚠️ Returning stale cached park data for ${normalizedParkCode} after NPS failure`);
          return staleMatch;
        }
      }

      const persistentParks = await this.getPersistentParksSnapshot();
      const persistentMatch = findParkByCode(persistentParks || []);
      if (persistentMatch) {
        console.warn(`⚠️ Returning persistent park snapshot for ${normalizedParkCode} after NPS failure`);
        return persistentMatch;
      }

      throw new Error(`Failed to fetch park ${parkCode}: ${error.message}`);
    }
  }

  // Get parks by state (cached)
  async getParksByState(stateCode) {
    const cacheKey = `parksByState_${stateCode}`;
    const cached = this._getEndpointCache(cacheKey, 'parksByState');
    if (cached) return cached;

    try {
      const response = await this.api.get('/parks', {
        params: { stateCode, limit: 100 }
      });
      const data = response.data.data;
      this._setEndpointCache(cacheKey, data, 'parksByState');
      return data;
    } catch (error) {
      console.error('NPS API Error:', error.message);
      throw new Error(`Failed to fetch parks for state ${stateCode}: ${error.message}`);
    }
  }

  // Get park activities (cached)
  async getParkActivities(parkCode) {
    return this._fetchParkTabList({
      parkCode,
      snapshotKey: 'bulk-activities',
      cacheKey: `activities_${parkCode}`,
      cacheType: 'activities',
      getAllBulk: () => this.getAllActivities(),
      fetchFromNps: async (code) => {
        const response = await this.api.get('/thingstodo', {
          params: { parkCode: code, limit: 50 },
        });
        const data = response.data.data || [];
        console.log(`✅ Activities for ${code}: ${data.length} found`);
        return data;
      },
      label: 'activities',
      rethrowOnError: true,
    });
  }

  // Bulk-fetch all alerts from NPS API and group by parkCode
  async getAllAlerts() {
    if (this._isCacheValid(this.alertsCache) && this.alertsCache.data) {
      console.log('📦 Returning cached bulk alerts');
      return this.alertsCache.data;
    }

    // Try MongoDB snapshot before hitting NPS API
    const snapshot = await this._loadSnapshot('bulk-alerts', this.alertsCache.ttl);
    if (snapshot && !snapshot.stale) {
      this.alertsCache = { ...this.alertsCache, data: snapshot.data, timestamp: Date.now() };
      return snapshot.data;
    }

    // If rate-limited and we have a stale snapshot, use it rather than hammering NPS
    if (this._isRateLimited()) {
      if (snapshot?.data) {
        this.alertsCache = { ...this.alertsCache, data: snapshot.data, timestamp: Date.now() };
        return snapshot.data;
      }
      return {};
    }

    console.log('🔄 Fetching all alerts from NPS API (bulk)...');

    let allAlerts = [];
    const pageSize = 50;
    const maxPages = 40;
    let start = 0;

    try {
      for (let page = 0; page < maxPages; page++) {
        const response = await this.api.get('/alerts', {
          params: { limit: pageSize, start }
        });

        const alerts = response.data.data;
        if (!alerts || alerts.length === 0) break;

        allAlerts = allAlerts.concat(alerts);
        start += pageSize;

        console.log(`🚨 Fetched page at offset ${start}, ${allAlerts.length} alerts so far`);

        if (alerts.length < pageSize) break;

        await new Promise(resolve => setTimeout(resolve, 200));
      }

      // Group alerts by parkCode
      const alertsByPark = {};
      for (const alert of allAlerts) {
        const code = this._normalizeParkCode(alert.parkCode);
        if (!code) continue;
        if (!alertsByPark[code]) alertsByPark[code] = [];
        alertsByPark[code].push(alert);
      }

      this.alertsCache = {
        ...this.alertsCache,
        data: alertsByPark,
        timestamp: Date.now()
      };

      console.log(`✅ Total alerts fetched (bulk): ${allAlerts.length} across ${Object.keys(alertsByPark).length} parks`);
      await this._saveSnapshot('bulk-alerts', alertsByPark);
      return alertsByPark;
    } catch (error) {
      if (error.response?.status === 429) {
        if (this.alertsCache.data) {
          console.warn('⚠️ NPS 429 on bulk alerts — returning stale cache');
          return this.alertsCache.data;
        }
        // Fall back to snapshot even if stale
        if (snapshot?.data) {
          console.warn('⚠️ NPS 429 on bulk alerts — returning stale snapshot');
          this.alertsCache = { ...this.alertsCache, data: snapshot.data, timestamp: Date.now() };
          return snapshot.data;
        }
        const dbSnapshot = await this._loadSnapshot('bulk-alerts', Infinity);
        if (dbSnapshot?.data) {
          console.warn('⚠️ NPS 429 on bulk alerts — returning DB snapshot');
          this.alertsCache = { ...this.alertsCache, data: dbSnapshot.data, timestamp: Date.now() };
          return dbSnapshot.data;
        }
        console.warn('⚠️ NPS 429 on bulk alerts — no cache available, returning empty');
        return {};
      }
      console.error('NPS API Error (getAllAlerts):', error.message);
      return {};
    }
  }

  // Get park alerts — bulk snapshot first, then per-park NPS call
  async getParkAlerts(parkCode) {
    const code = this._normalizeParkCode(parkCode);
    const cacheKey = `alerts_${parkCode}`;
    const cached = this._getEndpointCache(cacheKey, 'alerts');
    if (cached) return cached;

    const bulkData = await this._ensureBulkDataLoaded('bulk-alerts', () => this.getAllAlerts());
    const fromBulk = bulkData ? this._getGroupedBulkSlice(bulkData, code) : null;
    if (fromBulk?.length) {
      this._setEndpointCache(cacheKey, fromBulk, 'alerts', { allowEmpty: true });
      return fromBulk;
    }

    if (this._isRateLimited()) {
      console.warn(`⚠️ NPS rate-limited — trying alerts for ${code} via bulk/API fallback`);
    }

    try {
      const response = await this.api.get('/alerts', {
        params: { parkCode: code },
      });
      const data = response.data.data || [];
      console.log(`✅ Alerts for ${code}: ${data.length} found`);
      if (data.length > 0) {
        this._setEndpointCache(cacheKey, data, 'alerts', { allowEmpty: true });
      }
      return data;
    } catch (error) {
      const fallback = bulkData ? this._getGroupedBulkSlice(bulkData, code) : null;
      if (fallback?.length) return fallback;
      if (error.response?.status === 429) {
        console.warn(`⚠️ NPS 429 on alerts for ${code}`);
        return [];
      }
      console.error(`❌ NPS API Error (getParkAlerts for ${code}):`, error.message);
      throw new Error(`Failed to fetch alerts for ${code}: ${error.message}`);
    }
  }

  // Bulk-fetch all campgrounds and group by parkCode
  async getAllCampgrounds() {
    if (this._isCacheValid(this.campgroundsCache) && this.campgroundsCache.data) {
      console.log('📦 Returning cached bulk campgrounds');
      return this.campgroundsCache.data;
    }

    // Try MongoDB snapshot before hitting NPS API
    const snapshot = await this._loadSnapshot('bulk-campgrounds', this.campgroundsCache.ttl);
    if (snapshot && !snapshot.stale) {
      this.campgroundsCache = { ...this.campgroundsCache, data: snapshot.data, timestamp: Date.now() };
      return snapshot.data;
    }

    if (this._isRateLimited()) {
      if (snapshot?.data) {
        this.campgroundsCache = { ...this.campgroundsCache, data: snapshot.data, timestamp: Date.now() };
        return snapshot.data;
      }
      return {};
    }

    console.log('🔄 Fetching all campgrounds from NPS API (bulk)...');

    let allCampgrounds = [];
    const pageSize = 50;
    const maxPages = 40;
    let start = 0;

    try {
      for (let page = 0; page < maxPages; page++) {
        const response = await this.api.get('/campgrounds', {
          params: { limit: pageSize, start }
        });

        const campgrounds = response.data.data;
        if (!campgrounds || campgrounds.length === 0) break;

        allCampgrounds = allCampgrounds.concat(campgrounds);
        start += pageSize;

        console.log(`⛺ Fetched page at offset ${start}, ${allCampgrounds.length} campgrounds so far`);

        if (campgrounds.length < pageSize) break;
        await new Promise(resolve => setTimeout(resolve, 200));
      }

      const byPark = {};
      for (const cg of allCampgrounds) {
        const code = this._normalizeParkCode(cg.parkCode);
        if (!code) continue;
        if (!byPark[code]) byPark[code] = [];
        byPark[code].push(cg);
      }

      this.campgroundsCache = { ...this.campgroundsCache, data: byPark, timestamp: Date.now() };
      console.log(`✅ Total campgrounds fetched (bulk): ${allCampgrounds.length} across ${Object.keys(byPark).length} parks`);
      await this._saveSnapshot('bulk-campgrounds', byPark);
      return byPark;
    } catch (error) {
      if (error.response?.status === 429) {
        if (this.campgroundsCache.data) {
          console.warn('⚠️ NPS 429 on bulk campgrounds — returning stale cache');
          return this.campgroundsCache.data;
        }
        if (snapshot?.data) {
          console.warn('⚠️ NPS 429 on bulk campgrounds — returning stale snapshot');
          this.campgroundsCache = { ...this.campgroundsCache, data: snapshot.data, timestamp: Date.now() };
          return snapshot.data;
        }
        const dbSnapshot = await this._loadSnapshot('bulk-campgrounds', Infinity);
        if (dbSnapshot?.data) {
          console.warn('⚠️ NPS 429 on bulk campgrounds — returning DB snapshot');
          this.campgroundsCache = { ...this.campgroundsCache, data: dbSnapshot.data, timestamp: Date.now() };
          return dbSnapshot.data;
        }
        console.warn('⚠️ NPS 429 on bulk campgrounds — no cache available, returning empty');
        return {};
      }
      console.error('NPS API Error (getAllCampgrounds):', error.message);
      return {};
    }
  }

  // Get park campgrounds — serves from bulk cache first
  async getParkCampgrounds(parkCode) {
    return this._fetchParkTabList({
      parkCode,
      snapshotKey: 'bulk-campgrounds',
      cacheKey: `campgrounds_${parkCode}`,
      cacheType: 'campgrounds',
      getAllBulk: () => this.getAllCampgrounds(),
      fetchFromNps: async (code) => {
        const response = await this.api.get('/campgrounds', {
          params: { parkCode: code, limit: 50 },
        });
        const data = response.data.data || [];
        console.log(`✅ Campgrounds for ${code}: ${data.length} found`);
        return data;
      },
      label: 'campgrounds',
      rethrowOnError: true,
    });
  }

  // Bulk-fetch all visitor centers and group by parkCode
  async getAllVisitorCenters() {
    if (this._isCacheValid(this.visitorCentersCache) && this.visitorCentersCache.data) {
      console.log('📦 Returning cached bulk visitor centers');
      return this.visitorCentersCache.data;
    }

    // Try MongoDB snapshot before hitting NPS API
    const snapshot = await this._loadSnapshot('bulk-visitorcenters', this.visitorCentersCache.ttl);
    if (snapshot && !snapshot.stale) {
      this.visitorCentersCache = { ...this.visitorCentersCache, data: snapshot.data, timestamp: Date.now() };
      return snapshot.data;
    }

    if (this._isRateLimited()) {
      if (snapshot?.data) {
        this.visitorCentersCache = { ...this.visitorCentersCache, data: snapshot.data, timestamp: Date.now() };
        return snapshot.data;
      }
      return {};
    }

    console.log('🔄 Fetching all visitor centers from NPS API (bulk)...');

    let allVCs = [];
    const pageSize = 50;
    const maxPages = 40;
    let start = 0;

    try {
      for (let page = 0; page < maxPages; page++) {
        const response = await this.api.get('/visitorcenters', {
          params: { limit: pageSize, start }
        });

        const vcs = response.data.data;
        if (!vcs || vcs.length === 0) break;

        allVCs = allVCs.concat(vcs);
        start += pageSize;

        console.log(`🏛️ Fetched page at offset ${start}, ${allVCs.length} visitor centers so far`);

        if (vcs.length < pageSize) break;
        await new Promise(resolve => setTimeout(resolve, 200));
      }

      const byPark = {};
      for (const vc of allVCs) {
        const code = this._normalizeParkCode(vc.parkCode);
        if (!code) continue;
        if (!byPark[code]) byPark[code] = [];
        byPark[code].push(vc);
      }

      this.visitorCentersCache = { ...this.visitorCentersCache, data: byPark, timestamp: Date.now() };
      console.log(`✅ Total visitor centers fetched (bulk): ${allVCs.length} across ${Object.keys(byPark).length} parks`);
      await this._saveSnapshot('bulk-visitorcenters', byPark);
      return byPark;
    } catch (error) {
      if (error.response?.status === 429) {
        if (this.visitorCentersCache.data) {
          console.warn('⚠️ NPS 429 on bulk visitor centers — returning stale cache');
          return this.visitorCentersCache.data;
        }
        if (snapshot?.data) {
          console.warn('⚠️ NPS 429 on bulk visitorcenters — returning stale snapshot');
          this.visitorCentersCache = { ...this.visitorCentersCache, data: snapshot.data, timestamp: Date.now() };
          return snapshot.data;
        }
        const dbSnapshot = await this._loadSnapshot('bulk-visitorcenters', Infinity);
        if (dbSnapshot?.data) {
          console.warn('⚠️ NPS 429 on bulk visitorcenters — returning DB snapshot');
          this.visitorCentersCache = { ...this.visitorCentersCache, data: dbSnapshot.data, timestamp: Date.now() };
          return dbSnapshot.data;
        }
        console.warn('⚠️ NPS 429 on bulk visitor centers — no cache available, returning empty');
        return {};
      }
      console.error('NPS API Error (getAllVisitorCenters):', error.message);
      return {};
    }
  }

  // Get park visitor centers — serves from bulk cache first
  async getParkVisitorCenters(parkCode) {
    return this._fetchParkTabList({
      parkCode,
      snapshotKey: 'bulk-visitorcenters',
      cacheKey: `visitorcenters_${parkCode}`,
      cacheType: 'visitorcenters',
      getAllBulk: () => this.getAllVisitorCenters(),
      fetchFromNps: async (code) => {
        const response = await this.api.get('/visitorcenters', {
          params: { parkCode: code, limit: 50 },
        });
        const data = response.data.data || [];
        console.log(`✅ Visitor Centers for ${code}: ${data.length} found`);
        return data;
      },
      label: 'visitorcenters',
      rethrowOnError: true,
    });
  }

  // --- Bulk places ---

  async getAllPlaces() {
    if (this._isCacheValid(this.placesCache) && this.placesCache.data) {
      console.log('📦 Returning cached bulk places');
      return this.placesCache.data;
    }

    // Try MongoDB snapshot before hitting NPS API
    const snapshot = await this._loadSnapshot('bulk-places', this.placesCache.ttl);
    if (snapshot && !snapshot.stale) {
      this.placesCache = { ...this.placesCache, data: snapshot.data, timestamp: Date.now() };
      return snapshot.data;
    }

    if (this._isRateLimited()) {
      if (snapshot?.data) {
        this.placesCache = { ...this.placesCache, data: snapshot.data, timestamp: Date.now() };
        return snapshot.data;
      }
      return {};
    }

    console.log('🔄 Fetching all places from NPS API (bulk)...');

    let allPlaces = [];
    const pageSize = 50;
    const maxPages = 60; // places dataset is large
    let start = 0;

    try {
      for (let page = 0; page < maxPages; page++) {
        const response = await this.api.get('/places', {
          params: { limit: pageSize, start }
        });

        const places = response.data.data;
        if (!places || places.length === 0) break;

        allPlaces = allPlaces.concat(places);
        start += pageSize;

        console.log(`📍 Fetched page at offset ${start}, ${allPlaces.length} places so far`);

        if (places.length < pageSize) break;
        await new Promise(resolve => setTimeout(resolve, 200));
      }

      const byPark = {};
      for (const place of allPlaces) {
        const code = this._normalizeParkCode(place.relatedParks?.[0]?.parkCode || place.parkCode);
        if (!code) continue;
        if (!byPark[code]) byPark[code] = [];
        byPark[code].push(place);
      }

      this.placesCache = { ...this.placesCache, data: byPark, timestamp: Date.now() };
      console.log(`✅ Total places fetched (bulk): ${allPlaces.length} across ${Object.keys(byPark).length} parks`);
      await this._saveSnapshot('bulk-places', byPark);
      return byPark;
    } catch (error) {
      if (error.response?.status === 429) {
        if (this.placesCache.data) {
          console.warn('⚠️ NPS 429 on bulk places — returning stale cache');
          return this.placesCache.data;
        }
        if (snapshot?.data) {
          console.warn('⚠️ NPS 429 on bulk places — returning stale snapshot');
          this.placesCache = { ...this.placesCache, data: snapshot.data, timestamp: Date.now() };
          return snapshot.data;
        }
        const dbSnapshot = await this._loadSnapshot('bulk-places', Infinity);
        if (dbSnapshot?.data) {
          console.warn('⚠️ NPS 429 on bulk places — returning DB snapshot');
          this.placesCache = { ...this.placesCache, data: dbSnapshot.data, timestamp: Date.now() };
          return dbSnapshot.data;
        }
        console.warn('⚠️ NPS 429 on bulk places — no cache available, returning empty');
        return {};
      }
      console.error('NPS API Error (getAllPlaces):', error.message);
      return {};
    }
  }

  async getParkPlaces(parkCode) {
    return this._fetchParkTabList({
      parkCode,
      snapshotKey: 'bulk-places',
      cacheKey: `places_${parkCode}`,
      cacheType: 'places',
      getAllBulk: () => this.getAllPlaces(),
      fetchFromNps: async (code) => {
        const response = await this.api.get('/places', {
          params: { parkCode: code, limit: 50 },
        });
        return response.data.data || [];
      },
      label: 'places',
    });
  }

  // --- Bulk tours ---

  async getAllTours() {
    if (this._isCacheValid(this.toursCache) && this.toursCache.data) {
      console.log('📦 Returning cached bulk tours');
      return this.toursCache.data;
    }

    // Try MongoDB snapshot before hitting NPS API
    const snapshot = await this._loadSnapshot('bulk-tours', this.toursCache.ttl);
    if (snapshot && !snapshot.stale) {
      this.toursCache = { ...this.toursCache, data: snapshot.data, timestamp: Date.now() };
      return snapshot.data;
    }

    if (this._isRateLimited()) {
      if (snapshot?.data) {
        this.toursCache = { ...this.toursCache, data: snapshot.data, timestamp: Date.now() };
        return snapshot.data;
      }
      return {};
    }

    console.log('🔄 Fetching all tours from NPS API (bulk)...');

    let allTours = [];
    const pageSize = 50;
    const maxPages = 40;
    let start = 0;

    try {
      for (let page = 0; page < maxPages; page++) {
        const response = await this.api.get('/tours', {
          params: { limit: pageSize, start }
        });

        const tours = response.data.data;
        if (!tours || tours.length === 0) break;

        allTours = allTours.concat(tours);
        start += pageSize;

        console.log(`🗺️ Fetched page at offset ${start}, ${allTours.length} tours so far`);

        if (tours.length < pageSize) break;
        await new Promise(resolve => setTimeout(resolve, 200));
      }

      const byPark = {};
      for (const tour of allTours) {
        const code = this._normalizeParkCode(tour.park?.parkCode || tour.parkCode);
        if (!code) continue;
        if (!byPark[code]) byPark[code] = [];
        byPark[code].push(tour);
      }

      this.toursCache = { ...this.toursCache, data: byPark, timestamp: Date.now() };
      console.log(`✅ Total tours fetched (bulk): ${allTours.length} across ${Object.keys(byPark).length} parks`);
      await this._saveSnapshot('bulk-tours', byPark);
      return byPark;
    } catch (error) {
      if (error.response?.status === 429) {
        if (this.toursCache.data) {
          console.warn('⚠️ NPS 429 on bulk tours — returning stale cache');
          return this.toursCache.data;
        }
        if (snapshot?.data) {
          console.warn('⚠️ NPS 429 on bulk tours — returning stale snapshot');
          this.toursCache = { ...this.toursCache, data: snapshot.data, timestamp: Date.now() };
          return snapshot.data;
        }
        const dbSnapshot = await this._loadSnapshot('bulk-tours', Infinity);
        if (dbSnapshot?.data) {
          console.warn('⚠️ NPS 429 on bulk tours — returning DB snapshot');
          this.toursCache = { ...this.toursCache, data: dbSnapshot.data, timestamp: Date.now() };
          return dbSnapshot.data;
        }
        console.warn('⚠️ NPS 429 on bulk tours — no cache available, returning empty');
        return {};
      }
      console.error('NPS API Error (getAllTours):', error.message);
      return {};
    }
  }

  async getParkTours(parkCode) {
    return this._fetchParkTabList({
      parkCode,
      snapshotKey: 'bulk-tours',
      cacheKey: `tours_${parkCode}`,
      cacheType: 'tours',
      getAllBulk: () => this.getAllTours(),
      fetchFromNps: async (code) => {
        const response = await this.api.get('/tours', {
          params: { parkCode: code, limit: 50 },
        });
        return response.data.data || [];
      },
      label: 'tours',
    });
  }

  // --- Bulk webcams ---

  async getAllWebcams() {
    if (this._isCacheValid(this.webcamsCache) && this.webcamsCache.data) {
      console.log('📦 Returning cached bulk webcams');
      return this.webcamsCache.data;
    }

    // Try MongoDB snapshot before hitting NPS API
    const snapshot = await this._loadSnapshot('bulk-webcams', this.webcamsCache.ttl);
    if (snapshot && !snapshot.stale) {
      this.webcamsCache = { ...this.webcamsCache, data: snapshot.data, timestamp: Date.now() };
      return snapshot.data;
    }

    if (this._isRateLimited()) {
      if (snapshot?.data) {
        this.webcamsCache = { ...this.webcamsCache, data: snapshot.data, timestamp: Date.now() };
        return snapshot.data;
      }
      return {};
    }

    console.log('🔄 Fetching all webcams from NPS API (bulk)...');

    let allWebcams = [];
    const pageSize = 50;
    const maxPages = 20;
    let start = 0;

    try {
      for (let page = 0; page < maxPages; page++) {
        const response = await this.api.get('/webcams', {
          params: { limit: pageSize, start }
        });

        const webcams = response.data.data;
        if (!webcams || webcams.length === 0) break;

        allWebcams = allWebcams.concat(webcams);
        start += pageSize;

        console.log(`📹 Fetched page at offset ${start}, ${allWebcams.length} webcams so far`);

        if (webcams.length < pageSize) break;
        await new Promise(resolve => setTimeout(resolve, 200));
      }

      const byPark = {};
      for (const cam of allWebcams) {
        const code = this._normalizeParkCode(cam.relatedParks?.[0]?.parkCode || cam.parkCode);
        if (!code) continue;
        if (!byPark[code]) byPark[code] = [];
        byPark[code].push(cam);
      }

      this.webcamsCache = { ...this.webcamsCache, data: byPark, timestamp: Date.now() };
      console.log(`✅ Total webcams fetched (bulk): ${allWebcams.length} across ${Object.keys(byPark).length} parks`);
      await this._saveSnapshot('bulk-webcams', byPark);
      return byPark;
    } catch (error) {
      if (error.response?.status === 429) {
        if (this.webcamsCache.data) {
          console.warn('⚠️ NPS 429 on bulk webcams — returning stale cache');
          return this.webcamsCache.data;
        }
        if (snapshot?.data) {
          console.warn('⚠️ NPS 429 on bulk webcams — returning stale snapshot');
          this.webcamsCache = { ...this.webcamsCache, data: snapshot.data, timestamp: Date.now() };
          return snapshot.data;
        }
        const dbSnapshot = await this._loadSnapshot('bulk-webcams', Infinity);
        if (dbSnapshot?.data) {
          console.warn('⚠️ NPS 429 on bulk webcams — returning DB snapshot');
          this.webcamsCache = { ...this.webcamsCache, data: dbSnapshot.data, timestamp: Date.now() };
          return dbSnapshot.data;
        }
        console.warn('⚠️ NPS 429 on bulk webcams — no cache available, returning empty');
        return {};
      }
      console.error('NPS API Error (getAllWebcams):', error.message);
      return {};
    }
  }

  async getParkWebcams(parkCode) {
    return this._fetchParkTabList({
      parkCode,
      snapshotKey: 'bulk-webcams',
      cacheKey: `webcams_${parkCode}`,
      cacheType: 'webcams',
      getAllBulk: () => this.getAllWebcams(),
      fetchFromNps: async (code) => {
        const response = await this.api.get('/webcams', {
          params: { parkCode: code, limit: 50 },
        });
        return response.data.data || [];
      },
      label: 'webcams',
    });
  }

  // --- Bulk parking lots ---

  async getAllParkingLots() {
    if (this._isCacheValid(this.parkingLotsCache) && this.parkingLotsCache.data) {
      console.log('📦 Returning cached bulk parking lots');
      return this.parkingLotsCache.data;
    }

    // Try MongoDB snapshot before hitting NPS API
    const snapshot = await this._loadSnapshot('bulk-parkinglots', this.parkingLotsCache.ttl);
    if (snapshot && !snapshot.stale) {
      this.parkingLotsCache = { ...this.parkingLotsCache, data: snapshot.data, timestamp: Date.now() };
      return snapshot.data;
    }

    if (this._isRateLimited()) {
      if (snapshot?.data) {
        this.parkingLotsCache = { ...this.parkingLotsCache, data: snapshot.data, timestamp: Date.now() };
        return snapshot.data;
      }
      return {};
    }

    console.log('🔄 Fetching all parking lots from NPS API (bulk)...');

    let allParkingLots = [];
    const pageSize = 50;
    const maxPages = 40;
    let start = 0;

    try {
      for (let page = 0; page < maxPages; page++) {
        const response = await this.api.get('/parkinglots', {
          params: { limit: pageSize, start }
        });

        const lots = response.data.data;
        if (!lots || lots.length === 0) break;

        allParkingLots = allParkingLots.concat(lots);
        start += pageSize;

        console.log(`🅿️ Fetched page at offset ${start}, ${allParkingLots.length} parking lots so far`);

        if (lots.length < pageSize) break;
        await new Promise(resolve => setTimeout(resolve, 200));
      }

      const byPark = {};
      for (const lot of allParkingLots) {
        const code = this._normalizeParkCode(lot.relatedParks?.[0]?.parkCode || lot.parkCode);
        if (!code) continue;
        if (!byPark[code]) byPark[code] = [];
        byPark[code].push(lot);
      }

      this.parkingLotsCache = { ...this.parkingLotsCache, data: byPark, timestamp: Date.now() };
      console.log(`✅ Total parking lots fetched (bulk): ${allParkingLots.length} across ${Object.keys(byPark).length} parks`);
      await this._saveSnapshot('bulk-parkinglots', byPark);
      return byPark;
    } catch (error) {
      if (error.response?.status === 429) {
        if (this.parkingLotsCache.data) {
          console.warn('⚠️ NPS 429 on bulk parking lots — returning stale cache');
          return this.parkingLotsCache.data;
        }
        if (snapshot?.data) {
          console.warn('⚠️ NPS 429 on bulk parkinglots — returning stale snapshot');
          this.parkingLotsCache = { ...this.parkingLotsCache, data: snapshot.data, timestamp: Date.now() };
          return snapshot.data;
        }
        const dbSnapshot = await this._loadSnapshot('bulk-parkinglots', Infinity);
        if (dbSnapshot?.data) {
          console.warn('⚠️ NPS 429 on bulk parkinglots — returning DB snapshot');
          this.parkingLotsCache = { ...this.parkingLotsCache, data: dbSnapshot.data, timestamp: Date.now() };
          return dbSnapshot.data;
        }
        console.warn('⚠️ NPS 429 on bulk parking lots — no cache available, returning empty');
        return {};
      }
      console.error('NPS API Error (getAllParkingLots):', error.message);
      return {};
    }
  }

  async getParkParkingLots(parkCode) {
    return this._fetchParkTabList({
      parkCode,
      snapshotKey: 'bulk-parkinglots',
      cacheKey: `parkinglots_${parkCode}`,
      cacheType: 'parkinglots',
      getAllBulk: () => this.getAllParkingLots(),
      fetchFromNps: async (code) => {
        const response = await this.api.get('/parkinglots', {
          params: { parkCode: code, limit: 50 },
        });
        const data = response.data.data || [];
        console.log(`✅ Parking lots for ${code}: ${data.length} found`);
        return data;
      },
      label: 'parkinglots',
    });
  }

  // --- Per-park videos (no bulk fetch — 9,375+ videos across all parks) ---

  async getParkVideos(parkCode) {
    return this._fetchParkTabList({
      parkCode,
      cacheKey: `videos_${parkCode}`,
      cacheType: 'videos',
      fetchFromNps: async (code) => {
        const response = await this.api.get('/multimedia/videos', {
          params: { parkCode: code, limit: 50 },
        });
        const data = response.data.data || [];
        console.log(`🎬 Videos for ${code}: ${data.length} found`);
        return data;
      },
      label: 'videos',
    });
  }

  // --- Per-park curated images from /parks endpoint ---

  async getParkImages(parkCode) {
    const cacheKey = `park_images_${parkCode}`;
    const cached = this._getEndpointListCache(cacheKey, 'activities'); // reuse 24h TTL
    if (cached) return cached;

    if (this._isRateLimited()) return [];

    try {
      const response = await this.api.get('/parks', {
        params: { parkCode, fields: 'images' }
      });
      const park = response.data.data?.[0];
      const images = (park?.images || []).map(img => ({
        url: img.url,
        altText: img.altText || img.title,
        title: img.title,
        caption: img.caption,
        credit: img.credit
      })).filter(p => p.url);

      console.log(`🖼️ Park images for ${parkCode}: ${images.length} found`);
      this._setEndpointCache(cacheKey, images, 'activities');
      return images;
    } catch (error) {
      if (error.response?.status === 429) {
        console.warn(`⚠️ NPS 429 on park images for ${parkCode}`);
        return [];
      }
      console.error(`❌ NPS API Error (getParkImages for ${parkCode}):`, error.message);
      return [];
    }
  }

  // --- Per-park gallery photos (no bulk fetch — large dataset) ---

  async getParkGalleryPhotos(parkCode) {
    return this._fetchParkTabList({
      parkCode,
      cacheKey: `gallery_${parkCode}`,
      cacheType: 'gallery',
      fetchFromNps: async (code) => {
        const response = await this.api.get('/multimedia/galleries/assets', {
          params: { parkCode: code, limit: 50 },
        });
        const assets = response.data.data || [];

        const photos = assets
          .map((asset) => ({
            url: asset.fileInfo?.url,
            altText: asset.altText || asset.title,
            title: asset.title,
            caption: asset.description,
            credit: asset.credit,
          }))
          .filter((p) => p.url);

        if (!photos.length) {
          const parkImages = await this.getParkImages(code);
          if (parkImages.length > 0) {
            console.log(`🖼️ Gallery fallback to park images for ${code}: ${parkImages.length}`);
            return parkImages;
          }
        }

        console.log(`🖼️ Gallery photos for ${code}: ${photos.length} found`);
        return photos;
      },
      label: 'gallery',
    });
  }

  // --- Per-park amenities/facilities ---

  _normalizePlaceUrl(url) {
    return String(url || '').trim().toLowerCase().replace(/\/$/, '');
  }

  _amenityDescriptionFromPlace(place) {
    if (!place) return '';
    return (
      place.listingDescription ||
      place.description ||
      place.locationDescription ||
      place.bodyText ||
      ''
    );
  }

  _enrichAmenitiesFromPlaces(amenities, parkCode) {
    const code = this._normalizeParkCode(parkCode);
    const parkPlaces = [];
    if (this.placesCache?.data) {
      const fromBulk = this._getGroupedBulkSlice(this.placesCache.data, code);
      if (fromBulk) parkPlaces.push(...fromBulk);
    }
    const cachedPlaces = this._getEndpointCache(`places_${parkCode}`, 'places');
    if (Array.isArray(cachedPlaces)) {
      parkPlaces.push(...cachedPlaces);
    }

    if (parkPlaces.length === 0) return amenities;

    const byUrl = new Map();
    for (const place of parkPlaces) {
      const key = this._normalizePlaceUrl(place.url);
      if (key && !byUrl.has(key)) byUrl.set(key, place);
    }

    return amenities.map((item) => {
      const match = byUrl.get(this._normalizePlaceUrl(item.url));
      if (!match) return item;
      return {
        ...item,
        placeId: item.placeId || match.id || null,
        description: item.description || this._amenityDescriptionFromPlace(match),
        images: item.images?.length ? item.images : match.images || [],
        latitude: item.latitude ?? match.latitude ?? null,
        longitude: item.longitude ?? match.longitude ?? null,
      };
    });
  }

  async getParkAmenities(parkCode) {
    await this.getParkPlaces(parkCode);

    return this._fetchParkTabList({
      parkCode,
      cacheKey: `amenities_${parkCode}`,
      cacheType: 'facilities',
      fetchFromNps: async (code) => {
        const response = await this.api.get('/amenities/parksplaces', {
          params: { parkCode: code, limit: 500 },
        });

        const rawData = response.data.data || [];
        const amenities = [];

        for (const item of rawData) {
          const amenityObj = Array.isArray(item) ? item[0] : item;
          if (!amenityObj) continue;
          const amenityName = amenityObj.name || '';
          const parks = amenityObj.parks || [];

          for (const park of parks) {
            const places = park.places || [];
            for (const place of places) {
              amenities.push({
                name: amenityName,
                placeName: place.title || place.name || '',
                placeType: place.parkFacilityType || 'General',
                url: place.url || '',
                isManagedByNPS: place.isManagedByNPS || place.isManagedByNps || false,
                placeId: place.id || null,
                description: this._amenityDescriptionFromPlace(place),
                images: Array.isArray(place.images) ? place.images : [],
                latitude: place.latitude ?? null,
                longitude: place.longitude ?? null,
              });
            }
          }
        }

        const enriched = this._enrichAmenitiesFromPlaces(amenities, code);
        console.log(`🏛️ Amenities for ${code}: ${enriched.length} found`);
        return enriched;
      },
      label: 'amenities',
    });
  }

  // Get all events from NPS API with caching — uses bulk paginated fetch
  async getAllEvents(options = {}) {
    const {
      parkCode,
      stateCode,
      q,
      dateStart,
      dateEnd,
      eventType,
      expandRecurring = false,
      includePast = false,
      pageSize = 50,
      maxPages = 20,
      limit = 100,
    } = options;
    const normalizedLimit = Math.max(Number(limit) || 100, 1);
    const normalizedPageSize = Math.min(Number(pageSize) || 50, 50);

    const hasFilters = Boolean(
      parkCode ||
      stateCode ||
      q ||
      dateStart ||
      dateEnd ||
      eventType ||
      expandRecurring ||
      includePast
    );
    const queryCacheKey = hasFilters
      ? this._buildQueryCacheKey('events-query', {
          parkCode,
          stateCode,
          q,
          dateStart,
          dateEnd,
          eventType,
          expandRecurring,
          includePast,
          limit: normalizedLimit,
        })
      : null;

    if (!hasFilters) {
      const cachedEvents = this.getCachedEvents();
      if (cachedEvents) {
        return this._dedupeNpsEvents(cachedEvents).slice(0, normalizedLimit);
      }

      const snapshot = await this._loadSnapshot('bulk-events', this.eventsCache.ttl);
      if (Array.isArray(snapshot?.data) && snapshot.data.length > 0) {
        const dedupedSnapshot = this._dedupeNpsEvents(snapshot.data);
        this.setEventsCache(dedupedSnapshot);
        if (snapshot.stale) {
          console.log(`🗄️ Serving stale bulk-events snapshot (${dedupedSnapshot.length} events)`);
        }
        return dedupedSnapshot.slice(0, normalizedLimit);
      }
    } else {
      const cachedQueryEvents = this._getEndpointCache(queryCacheKey, 'eventsQuery');
      if (Array.isArray(cachedQueryEvents) && cachedQueryEvents.length > 0) {
        console.log(`📦 Returning cached filtered events for ${queryCacheKey}`);
        return cachedQueryEvents.slice(0, normalizedLimit);
      }

      const querySnapshot = await this._loadSnapshot(queryCacheKey, this.endpointCacheTTLs.eventsQuery);
      if (Array.isArray(querySnapshot?.data) && querySnapshot.data.length > 0) {
        const dedupedSnapshot = this._dedupeNpsEvents(querySnapshot.data);
        this._setEndpointCache(queryCacheKey, dedupedSnapshot, 'eventsQuery', { allowEmpty: true });
        if (querySnapshot.stale) {
          console.log(`🗄️ Serving stale filtered events snapshot for ${queryCacheKey}`);
        } else {
          console.log(`🗄️ Returning cached filtered events snapshot for ${queryCacheKey}`);
        }
        return dedupedSnapshot.slice(0, normalizedLimit);
      }
    }

    // When rate-limited, use stale snapshots if available; otherwise still try NPS
    // so the events page is not blank while other endpoints triggered backoff.
    if (this._isRateLimited()) {
      if (!hasFilters) {
        const staleSnap = await this._loadSnapshot('bulk-events', Infinity);
        if (Array.isArray(staleSnap?.data) && staleSnap.data.length > 0) {
          return this._dedupeNpsEvents(staleSnap.data).slice(0, normalizedLimit);
        }
      } else if (queryCacheKey) {
        const staleQuery = await this._loadSnapshot(queryCacheKey, Infinity);
        if (Array.isArray(staleQuery?.data) && staleQuery.data.length > 0) {
          return this._dedupeNpsEvents(staleQuery.data).slice(0, normalizedLimit);
        }
      }
      console.warn('⚠️ NPS rate-limited with no events cache — attempting events fetch anyway');
    }

    try {
      console.log('🔄 Cache miss - fetching fresh events from NPS API (bulk)...');

      let allEvents = [];
      let totalFetched = 0;
      const today = new Date();

      for (let page = 1; page <= maxPages; page++) {
        const response = await this.api.get('/events', {
          params: {
            pageSize: normalizedPageSize,
            pageNumber: page,
            expandRecurring,
            ...(parkCode ? { parkCode } : {}),
            ...(stateCode ? { stateCode } : {}),
            ...(q ? { q } : {}),
            ...(dateStart ? { dateStart } : {}),
            ...(dateEnd ? { dateEnd } : {}),
            ...(eventType ? { eventType } : {}),
          }
        });

        const events = response.data.data || [];
        if (!events || events.length === 0) break;

        totalFetched += events.length;

        const validEvents = events.filter(event => {
          if (includePast) {
            return true;
          }

          const startDate = new Date(event.date || event.datestart || event.dates?.[0]);
          const endDate = new Date(event.dateend);

          if (!isNaN(endDate.getTime()) && endDate >= today) return true;
          if (!isNaN(startDate.getTime()) && startDate >= today) return true;

          return false;
        });

        allEvents = allEvents.concat(validEvents);

        console.log(`📅 Fetched page ${page}/${maxPages}, ${totalFetched} total events, ${allEvents.length} kept`);

        if (allEvents.length >= normalizedLimit) break;
        if (events.length < normalizedPageSize) break;

        await new Promise(resolve => setTimeout(resolve, 200));
      }

      allEvents = this._dedupeNpsEvents(allEvents);

      // Sort by effective date: ongoing/past-start events sort as "today"
      // so they appear alongside current events, not buried at the top
      const now = new Date();
      allEvents.sort((a, b) => {
        const rawA = new Date(a.date || a.datestart || a.dates?.[0]);
        const rawB = new Date(b.date || b.datestart || b.dates?.[0]);
        const dateA = rawA < now ? now : rawA;
        const dateB = rawB < now ? now : rawB;
        return dateA - dateB;
      });

      if (!hasFilters) {
        this.setEventsCache(allEvents);
        if (allEvents.length > 0) {
          await this._saveSnapshot('bulk-events', allEvents);
        }
      } else if (queryCacheKey) {
        if (allEvents.length > 0) {
          this._setEndpointCache(queryCacheKey, allEvents, 'eventsQuery', { allowEmpty: true });
          await this._saveSnapshot(queryCacheKey, allEvents);
        }
      }

      console.log(`✅ Events fetch complete: ${allEvents.length} kept events out of ${totalFetched} total`);
      return allEvents.slice(0, normalizedLimit);
    } catch (error) {
      if (error.response?.status === 429) {
        if (!hasFilters && this.eventsCache.data) {
          console.warn('⚠️ NPS 429 rate limit on events — returning stale cache');
          return this._dedupeNpsEvents(this.eventsCache.data).slice(0, normalizedLimit);
        }
        if (hasFilters && queryCacheKey) {
          const cachedQueryEvents = this._getEndpointCache(queryCacheKey, 'eventsQuery');
          if (Array.isArray(cachedQueryEvents) && cachedQueryEvents.length > 0) {
            console.warn(`⚠️ NPS 429 on filtered events — returning cached query results for ${queryCacheKey}`);
            return cachedQueryEvents.slice(0, normalizedLimit);
          }
          const querySnapshot = await this._loadSnapshot(queryCacheKey, this.endpointCacheTTLs.eventsQuery);
          if (Array.isArray(querySnapshot?.data) && querySnapshot.data.length > 0) {
            console.warn(`⚠️ NPS 429 on filtered events — returning snapshot for ${queryCacheKey}`);
            const dedupedSnapshot = this._dedupeNpsEvents(querySnapshot.data);
            this._setEndpointCache(queryCacheKey, dedupedSnapshot, 'eventsQuery', { allowEmpty: true });
            return dedupedSnapshot.slice(0, normalizedLimit);
          }
        }
        const snapshot = !hasFilters ? await this._loadSnapshot('bulk-events', this.eventsCache.ttl) : null;
        if (Array.isArray(snapshot?.data) && snapshot.data.length > 0) {
          console.warn('⚠️ NPS 429 on bulk events — returning stale snapshot');
          const dedupedSnapshot = this._dedupeNpsEvents(snapshot.data);
          this.setEventsCache(dedupedSnapshot);
          return dedupedSnapshot.slice(0, normalizedLimit);
        }
        const dbSnapshot = !hasFilters ? await this._loadSnapshot('bulk-events', Infinity) : null;
        if (Array.isArray(dbSnapshot?.data) && dbSnapshot.data.length > 0) {
          console.warn('⚠️ NPS 429 on bulk events — returning DB snapshot');
          const dedupedSnapshot = this._dedupeNpsEvents(dbSnapshot.data);
          this.setEventsCache(dedupedSnapshot);
          return dedupedSnapshot.slice(0, normalizedLimit);
        }
        console.warn('⚠️ NPS 429 on bulk events — no cache available, returning empty');
        return [];
      }
      console.error('NPS API Error (getAllEvents):', error.message);
      return [];
    }
  }

  async getEventsTotal(options = {}) {
    const {
      parkCode,
      stateCode,
      q,
      dateStart,
      dateEnd,
      eventType,
      expandRecurring = false,
    } = options;
    const summaryCacheKey = this._buildQueryCacheKey('events-summary', {
      parkCode,
      stateCode,
      q,
      dateStart,
      dateEnd,
      eventType,
      expandRecurring,
    });

    const cachedSummary = this._getEndpointCache(summaryCacheKey, 'eventsSummary');
    if (typeof cachedSummary === 'number' && cachedSummary > 0) {
      console.log(`📦 Returning cached event summary for ${summaryCacheKey}`);
      return cachedSummary;
    }

    const summarySnapshot = await this._loadSnapshot(summaryCacheKey, this.endpointCacheTTLs.eventsSummary);
    const snapshotTotal = Number(summarySnapshot?.data);
    if (Number.isFinite(snapshotTotal) && snapshotTotal > 0) {
      this._setEndpointCache(summaryCacheKey, snapshotTotal, 'eventsSummary', { allowEmpty: true });
      console.log(`🗄️ Returning cached event summary snapshot for ${summaryCacheKey}`);
      return snapshotTotal;
    }

    try {
      const response = await this.api.get('/events', {
        params: {
          pageSize: 1,
          pageNumber: 1,
          expandRecurring,
          ...(parkCode ? { parkCode } : {}),
          ...(stateCode ? { stateCode } : {}),
          ...(q ? { q } : {}),
          ...(dateStart ? { dateStart } : {}),
          ...(dateEnd ? { dateEnd } : {}),
          ...(eventType ? { eventType } : {}),
        }
      });
      const total = Number(response.data?.total || 0);
      if (total > 0) {
        this._setEndpointCache(summaryCacheKey, total, 'eventsSummary', { allowEmpty: true });
        await this._saveSnapshot(summaryCacheKey, total);
      }
      return total;
    } catch (error) {
      console.error('NPS API Error (getEventsTotal):', error.message);
      if (Number.isFinite(snapshotTotal) && snapshotTotal > 0) {
        return snapshotTotal;
      }
      return 0;
    }
  }

  // Get events by park (cached)
  async getEventsByPark(parkCode) {
    const cacheKey = `events_${parkCode}`;
    const cached = this._getEndpointCache(cacheKey, 'alerts'); // reuse 30min TTL
    if (cached) return cached;

    try {
      const data = await this.getAllEvents({ parkCode, pageSize: 100, limit: 100 });
      console.log(`Events for ${parkCode}: ${data.length}`);
      this._setEndpointCache(cacheKey, data, 'alerts');
      return data;
    } catch (error) {
      if (error.response?.status === 429) {
        console.warn(`⚠️ NPS 429 on events for ${parkCode}`);
        return [];
      }
      console.error('NPS API Error (getEventsByPark):', error.message);
      return [];
    }
  }

  // Get all activities — uses bulk paginated fetch with caching
  async getAllActivities(limit = 500) {
    const cachedActivities = this.getCachedActivities();
    if (cachedActivities) {
      return cachedActivities.slice(0, limit);
    }

    // Try MongoDB snapshot before hitting NPS API
    const snapshot = await this._loadSnapshot('bulk-activities', this.activitiesCache.ttl);
    if (snapshot && !snapshot.stale) {
      this.setActivitiesCache(snapshot.data);
      return snapshot.data.slice(0, limit);
    }

    if (this._isRateLimited()) {
      if (snapshot?.data) {
        this.setActivitiesCache(snapshot.data);
        return snapshot.data.slice(0, limit);
      }
      return [];
    }

    try {
      console.log('🔄 Fetching all activities from NPS API (bulk)...');

      let allActivities = [];
      const pageSize = 50;
      const maxPages = 40;
      let start = 0;

      for (let page = 0; page < maxPages; page++) {
        const response = await this.api.get('/thingstodo', {
          params: { limit: pageSize, start }
        });

        const activities = response.data.data;
        if (!activities || activities.length === 0) break;

        allActivities = allActivities.concat(activities);
        start += pageSize;

        console.log(`🎯 Fetched page at offset ${start}, ${allActivities.length} activities so far`);

        if (activities.length < pageSize) break; // last page
        if (allActivities.length >= limit) break;

        // Small delay between pages
        await new Promise(resolve => setTimeout(resolve, 200));
      }

      this.setActivitiesCache(allActivities);

      console.log(`✅ Total activities fetched (bulk): ${allActivities.length}`);
      await this._saveSnapshot('bulk-activities', allActivities);
      return allActivities.slice(0, limit);
    } catch (error) {
      // On 429, return stale cache or empty array — don't crash the warm-up
      if (error.response?.status === 429) {
        if (this.activitiesCache.data) {
          console.warn('⚠️ NPS 429 rate limit on activities — returning stale cache');
          return this.activitiesCache.data.slice(0, limit);
        }
        if (snapshot?.data) {
          console.warn('⚠️ NPS 429 on bulk activities — returning stale snapshot');
          this.setActivitiesCache(snapshot.data);
          return snapshot.data.slice(0, limit);
        }
        const dbSnapshot = await this._loadSnapshot('bulk-activities', Infinity);
        if (dbSnapshot?.data) {
          console.warn('⚠️ NPS 429 on bulk activities — returning DB snapshot');
          this.setActivitiesCache(dbSnapshot.data);
          return dbSnapshot.data.slice(0, limit);
        }
        console.warn('⚠️ NPS 429 rate limit on activities — no cache available, returning empty');
        return [];
      }
      console.error('NPS API Error (getAllActivities):', error.message);
      throw new Error(`Failed to fetch all activities: ${error.message}`);
    }
  }

  // Get activity by ID
  async getActivityById(activityId) {
    try {
      const response = await this.api.get('/thingstodo', {
        params: { id: activityId }
      });
      
      if (response.data.data && response.data.data.length > 0) {
        console.log(`✅ Activity found: ${response.data.data[0].title}`);
        return response.data.data[0];
      }
      
      console.log(`❌ Activity not found: ${activityId}`);
      return null;
    } catch (error) {
      console.error(`❌ NPS API Error (getActivityById for ${activityId}):`, error.message);
      throw new Error(`Failed to fetch activity ${activityId}: ${error.message}`);
    }
  }

  async _paginateNpsEndpoint(path, { pageSize = 100, maxPages = 50, params = {} } = {}) {
    let all = [];
    let start = 0;

    for (let page = 0; page < maxPages; page++) {
      if (this._isRateLimited()) break;

      const response = await this.api.get(path, {
        params: { limit: pageSize, start, ...params }
      });

      const batch = response.data?.data;
      if (!batch?.length) break;

      all = all.concat(batch);
      start += pageSize;

      if (batch.length < pageSize) break;
      await new Promise((resolve) => setTimeout(resolve, 150));
    }

    return all;
  }

  async getActivityTaxonomy() {
    const cacheKey = 'activity-taxonomy';
    const snapshot = await this._loadSnapshot(cacheKey, this.activityTaxonomyCache.ttl);
    if (snapshot && !snapshot.stale) {
      this.activityTaxonomyCache = { ...this.activityTaxonomyCache, data: snapshot.data, timestamp: Date.now() };
      return snapshot.data;
    }

    if (this._isCacheValid(this.activityTaxonomyCache)) {
      return this.activityTaxonomyCache.data;
    }

    if (this._isRateLimited()) {
      if (snapshot?.data) return snapshot.data;
      return this.activityTaxonomyCache.data || [];
    }

    try {
      const activities = await this._paginateNpsEndpoint('/activities', { pageSize: 100, maxPages: 10 });
      this.activityTaxonomyCache = { ...this.activityTaxonomyCache, data: activities, timestamp: Date.now() };
      await this._saveSnapshot(cacheKey, activities);
      return activities;
    } catch (error) {
      if (snapshot?.data) return snapshot.data;
      console.error('NPS API Error (getActivityTaxonomy):', error.message);
      return this.activityTaxonomyCache.data || [];
    }
  }

  async getTopicTaxonomy() {
    const cacheKey = 'topic-taxonomy';
    const snapshot = await this._loadSnapshot(cacheKey, this.topicTaxonomyCache.ttl);
    if (snapshot && !snapshot.stale) {
      this.topicTaxonomyCache = { ...this.topicTaxonomyCache, data: snapshot.data, timestamp: Date.now() };
      return snapshot.data;
    }

    if (this._isCacheValid(this.topicTaxonomyCache)) {
      return this.topicTaxonomyCache.data;
    }

    if (this._isRateLimited()) {
      if (snapshot?.data) return snapshot.data;
      return this.topicTaxonomyCache.data || [];
    }

    try {
      const topics = await this._paginateNpsEndpoint('/topics', { pageSize: 100, maxPages: 20 });
      this.topicTaxonomyCache = { ...this.topicTaxonomyCache, data: topics, timestamp: Date.now() };
      await this._saveSnapshot(cacheKey, topics);
      return topics;
    } catch (error) {
      if (snapshot?.data) return snapshot.data;
      console.error('NPS API Error (getTopicTaxonomy):', error.message);
      return this.topicTaxonomyCache.data || [];
    }
  }

  async getParksForActivityId(activityId) {
    if (!activityId) return [];

    const cacheKey = `activity-parks-${activityId}`;
    const cached = this._getEndpointListCache(cacheKey, 'activities');
    if (cached) return cached;

    if (this._isRateLimited()) {
      console.warn(`⚠️ NPS rate-limited — skipping activities/parks for ${activityId}`);
      return [];
    }

    try {
      const response = await this.api.get('/activities/parks', {
        params: { id: activityId, limit: 500 }
      });
      const rows = response.data?.data || [];
      const parks = rows.flatMap((row) => {
        if (Array.isArray(row?.parks)) return row.parks;
        if (row?.parkCode) return [row];
        return [];
      });
      this._setEndpointCache(cacheKey, parks, 'activities');
      return parks;
    } catch (error) {
      if (error.response?.status === 429) {
        console.warn(`⚠️ NPS 429 on activities/parks for ${activityId}`);
        return [];
      }
      console.error(`NPS API Error (getParksForActivityId ${activityId}):`, error.message);
      return [];
    }
  }

  async getParksForTopicId(topicId) {
    if (!topicId) return [];

    const cacheKey = `topic-parks-${topicId}`;
    const cached = this._getEndpointListCache(cacheKey, 'activities');
    if (cached) return cached;

    if (this._isRateLimited()) {
      console.warn(`⚠️ NPS rate-limited — skipping topics/parks for ${topicId}`);
      return [];
    }

    try {
      const response = await this.api.get('/topics/parks', {
        params: { id: topicId, limit: 500 }
      });
      const rows = response.data?.data || [];
      const parks = rows.flatMap((row) => {
        if (Array.isArray(row?.parks)) return row.parks;
        if (row?.parkCode) return [row];
        return [];
      });
      this._setEndpointCache(cacheKey, parks, 'activities');
      return parks;
    } catch (error) {
      if (error.response?.status === 429) {
        console.warn(`⚠️ NPS 429 on topics/parks for ${topicId}`);
        return [];
      }
      console.error(`NPS API Error (getParksForTopicId ${topicId}):`, error.message);
      return [];
    }
  }

  async getAmenityTaxonomy() {
    const cacheKey = 'amenity-taxonomy';
    const snapshot = await this._loadSnapshot(cacheKey, this.amenityTaxonomyCache.ttl);
    if (snapshot && !snapshot.stale) {
      this.amenityTaxonomyCache = { ...this.amenityTaxonomyCache, data: snapshot.data, timestamp: Date.now() };
      return snapshot.data;
    }

    if (this._isCacheValid(this.amenityTaxonomyCache)) {
      return this.amenityTaxonomyCache.data;
    }

    if (this._isRateLimited()) {
      if (snapshot?.data) return snapshot.data;
      return this.amenityTaxonomyCache.data || [];
    }

    try {
      const amenities = await this._paginateNpsEndpoint('/amenities', { pageSize: 100, maxPages: 10 });
      this.amenityTaxonomyCache = { ...this.amenityTaxonomyCache, data: amenities, timestamp: Date.now() };
      await this._saveSnapshot(cacheKey, amenities);
      return amenities;
    } catch (error) {
      if (snapshot?.data) return snapshot.data;
      console.error('NPS API Error (getAmenityTaxonomy):', error.message);
      return this.amenityTaxonomyCache.data || [];
    }
  }

  async _loadThingstodoListings(scanLimit = 1200) {
    try {
      return await this.getAllActivities(scanLimit);
    } catch {
      return this.getCachedActivities() || [];
    }
  }

  _mapThingstodoListing(item, { includeLongDescription = false } = {}) {
    const firstImage = Array.isArray(item.images) ? item.images.find((img) => img?.url) : null;
    const imageUrl = firstImage?.url
      ? firstImage.url.startsWith('http')
        ? firstImage.url
        : `https://www.nps.gov${firstImage.url.startsWith('/') ? firstImage.url : `/${firstImage.url}`}`
      : null;
    return {
      id: item.id,
      title: item.title,
      parkCode: item.parkCode || item.relatedParks?.[0]?.parkCode,
      parkName: item.relatedParks?.[0]?.fullName || item.parkName,
      shortDescription: item.shortDescription || item.description,
      longDescription: includeLongDescription ? item.longDescription : undefined,
      activityTags: (item.activities || []).map((a) => a.name).filter(Boolean),
      image: imageUrl,
      imageAlt: firstImage?.altText || firstImage?.alt || item.title || null,
      url: item.url || (item.parkCode ? `https://www.nps.gov/thingstodo/${item.id}.htm` : null)
    };
  }

  async getThingsToDoForActivityName(activityName, limit = 12, { includeLongDescription = false } = {}) {
    if (!activityName) return [];
    const needle = activityName.toLowerCase();

    try {
      const listings = await this._loadThingstodoListings(Math.min(limit * 25, 1200));

      const matched = listings.filter((item) => {
        const types = item?.activities || [];
        return types.some((a) => a?.name?.toLowerCase() === needle || a?.name?.toLowerCase().includes(needle));
      });

      return matched
        .slice(0, limit)
        .map((item) => this._mapThingstodoListing(item, { includeLongDescription }));
    } catch (error) {
      console.error('getThingsToDoForActivityName:', error.message);
      return [];
    }
  }

  _findNpsArticleMatch(items, { title, slug }) {
    const slugNeedle = (slug || '').toLowerCase();
    const titleLower = (title || '').toLowerCase();

    return (
      items.find((a) => a.title?.toLowerCase() === titleLower) ||
      items.find((a) => slugNeedle && a.url?.toLowerCase().includes(`/000/${slugNeedle}.htm`)) ||
      items.find((a) => slugNeedle && a.url?.toLowerCase().includes(`/${slugNeedle}.htm`)) ||
      items.find((a) => slugNeedle && a.url?.toLowerCase().includes(`/${slugNeedle}/`))
    );
  }

  /**
   * NPS app activity/topic pages use /articles (e.g. /articles/000/astronomy.htm).
   * Taxonomy endpoints only return id + name.
   */
  async getNpsGuideForDiscover({ title, slug }) {
    if (!title) return null;

    const cacheKey = `nps-guide-v2-${slug || title}`.toLowerCase();
    const cached = this._getEndpointListCache(cacheKey, 'activities');
    if (cached) return cached;

    try {
      const { fetchNpsArticleBody, fetchNpsYouMightAlsoLike } = require('../utils/npsArticleScraper');
      const response = await this.api.get('/articles', {
        params: { q: title, limit: 25 }
      });
      const items = response.data?.data || [];
      const match = this._findNpsArticleMatch(items, { title, slug });

      if (!match?.url) return null;

      const summary = match.listingDescription || '';
      let body = '';
      let sections = [];
      let video = null;
      try {
        const parsed = await fetchNpsArticleBody(match.url);
        body = parsed.body || '';
        sections = parsed.sections || [];
        video = parsed.video || null;
        if (!body && summary) {
          body = summary;
        }
      } catch (scrapeError) {
        console.warn(`getNpsGuideForDiscover scrape failed for ${match.url}:`, scrapeError.message);
        if (!body && summary) {
          body = summary;
        }
      }
      let youMightAlsoLike = [];
      try {
        youMightAlsoLike = await fetchNpsYouMightAlsoLike({
          query: title,
          excludePageUrl: match.url,
          rows: 6
        });
      } catch (ymalError) {
        console.warn(`getNpsGuideForDiscover YMAL failed for ${title}:`, ymalError.message);
      }

      const result = {
        id: match.id,
        title: match.title,
        url: match.url,
        summary,
        description: body || summary,
        body,
        sections,
        video,
        youMightAlsoLike,
        image: match.listingImage?.url || null,
        imageAlt: match.listingImage?.altText || match.title,
        source: 'nps-articles'
      };
      this._setEndpointCache(cacheKey, result, 'activities');
      return result;
    } catch (error) {
      console.warn('getNpsGuideForDiscover:', error.message);
      return null;
    }
  }

  /** @deprecated use getNpsGuideForDiscover */
  async getNpsArticleForDiscover(params) {
    return this.getNpsGuideForDiscover(params);
  }

  async getThingsToDoForTopicName(topicName, limit = 12, { includeLongDescription = false } = {}) {
    if (!topicName) return [];
    const needle = topicName.toLowerCase();

    try {
      const listings = await this._loadThingstodoListings(Math.min(limit * 25, 1200));

      const matched = listings.filter((item) => {
        const topics = item?.topics || [];
        const topicMatch = topics.some((t) => {
          const name = (t?.name || '').toLowerCase();
          return name === needle || name.includes(needle) || needle.includes(name);
        });
        if (topicMatch) return true;

        const tags = item?.tags || [];
        return tags.some((tag) => String(tag).toLowerCase().includes(needle));
      });

      return matched
        .slice(0, limit)
        .map((item) => this._mapThingstodoListing(item, { includeLongDescription }));
    } catch (error) {
      console.error('getThingsToDoForTopicName:', error.message);
      return [];
    }
  }

  async getRelatedTagsFromThingstodo(activityName, limit = 10) {
    if (!activityName) return [];
    const needle = activityName.toLowerCase();
    const listings = await this._loadThingstodoListings(1500);
    const counts = new Map();

    listings.forEach((item) => {
      const types = item?.activities || [];
      const matchesPrimary = types.some(
        (a) => a?.name?.toLowerCase() === needle || a?.name?.toLowerCase().includes(needle)
      );
      if (!matchesPrimary) return;

      types.forEach((a) => {
        const name = a?.name?.trim();
        if (!name) return;
        const lower = name.toLowerCase();
        if (lower === needle) return;
        counts.set(name, (counts.get(name) || 0) + 1);
      });
    });

    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([name, count]) => ({ name, count, slug: null, kind: 'program-tag' }));
  }

  async getUpcomingEventsForParkCodes(parkCodes = [], limit = 12) {
    const unique = [...new Set((parkCodes || []).map((c) => c?.toLowerCase()).filter(Boolean))];
    if (!unique.length) return [];
    if (this._isRateLimited()) return [];

    const chunks = [];
    for (let i = 0; i < unique.length; i += 10) {
      chunks.push(unique.slice(i, i + 10));
    }
    const perChunk = Math.max(3, Math.ceil(limit / Math.min(chunks.length, 4)));
    const maxChunks = Math.min(chunks.length, 4);
    const collected = [];
    const seen = new Set();

    for (let i = 0; i < maxChunks; i += 1) {
      if (this._isRateLimited()) break;
      try {
        const response = await this.api.get('/events', {
          params: {
            parkCode: chunks[i].join(','),
            dateStart: new Date().toISOString().slice(0, 10),
            limit: perChunk
          }
        });
        (response.data?.data || []).forEach((event) => {
          const key = event.id || event.eventid || `${event.title}-${event.sitecode}`;
          if (seen.has(key)) return;
          seen.add(key);
          collected.push(event);
        });
      } catch (error) {
        if (error.response?.status === 429) {
          console.warn('⚠️ NPS 429 on events batch');
          break;
        }
        console.warn('getUpcomingEventsForParkCodes:', error.message);
      }
    }

    return collected.slice(0, limit);
  }

  async deleteSnapshot(key) {
    try {
      await NpsSnapshot.deleteOne({ key });
      console.log(`🗄️ Deleted snapshot "${key}"`);
    } catch (error) {
      console.warn(`⚠️ Failed to delete snapshot "${key}":`, error.message);
    }
  }

}

module.exports = new NPSService();
