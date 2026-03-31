const axios = require('axios');
const ParkSnapshot = require('../models/ParkSnapshot');

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

    // Cache system for events
    this.eventsCache = {
      data: null,
      timestamp: null,
      ttl: 6 * 60 * 60 * 1000 // 6 hours — events don't change by the minute
    };

    // Cache all parks aggressively since the upstream dataset is relatively static
    this.parksCache = {
      data: null,
      timestamp: null,
      ttl: 24 * 60 * 60 * 1000 // 24 hours
    };

    // Cache for activities (bulk fetch, rarely changes)
    this.activitiesCache = {
      data: null,
      timestamp: null,
      ttl: 24 * 60 * 60 * 1000 // 24 hours
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

    // Per-endpoint caches for individual park data
    this.endpointCache = new Map();
    this.endpointCacheTTLs = {
      alerts: 30 * 60 * 1000,        // 30 min — time-sensitive
      activities: 24 * 60 * 60 * 1000, // 24 hours
      campgrounds: 24 * 60 * 60 * 1000, // 24 hours
      visitorcenters: 24 * 60 * 60 * 1000, // 24 hours
      parksByState: 24 * 60 * 60 * 1000, // 24 hours
      places: 24 * 60 * 60 * 1000,     // 24 hours
      tours: 24 * 60 * 60 * 1000,      // 24 hours
      webcams: 24 * 60 * 60 * 1000     // 24 hours
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
    if (this.isCacheValid()) {
      console.log('📦 Returning cached events');
      return this.eventsCache.data;
    }
    return null;
  }

  // Set events cache
  setEventsCache(data) {
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
      console.log('📦 Returning cached activities');
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
    const entry = this.endpointCache.get(key);
    if (!entry) return null;
    const ttl = this.endpointCacheTTLs[type] || 30 * 60 * 1000;
    if (Date.now() - entry.timestamp > ttl) {
      this.endpointCache.delete(key);
      return null;
    }
    return entry.data;
  }

  _setEndpointCache(key, data) {
    this.endpointCache.set(key, { data, timestamp: Date.now() });
  }

  isParksCacheValid() {
    if (!this.parksCache.data || !this.parksCache.timestamp) {
      return false;
    }
    return Date.now() - this.parksCache.timestamp < this.parksCache.ttl;
  }

  getCachedParks() {
    if (this.isParksCacheValid()) {
      console.log('📦 Returning cached parks');
      return this.parksCache.data;
    }
    return null;
  }

  setParksCache(data) {
    this.parksCache = {
      data,
      timestamp: Date.now(),
      ttl: 24 * 60 * 60 * 1000
    };
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

        // Safety limit to prevent infinite loops (but allow for 474+ parks)
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
      // Prefer the full parks dataset because it is already cached aggressively and
      // avoids extra per-park NPS calls that can trigger 429s on detail pages.
      const cachedParks = this.getCachedParks();
      const cachedMatch = findParkByCode(cachedParks || []);
      if (cachedMatch) {
        return cachedMatch;
      }

      const allParks = await this.getAllParks();
      const fullDatasetMatch = findParkByCode(allParks);
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
      this._setEndpointCache(cacheKey, data);
      return data;
    } catch (error) {
      console.error('NPS API Error:', error.message);
      throw new Error(`Failed to fetch parks for state ${stateCode}: ${error.message}`);
    }
  }

  // Get park activities (cached)
  async getParkActivities(parkCode) {
    const cacheKey = `activities_${parkCode}`;
    const cached = this._getEndpointCache(cacheKey, 'activities');
    if (cached) return cached;

    try {
      const response = await this.api.get('/thingstodo', {
        params: { parkCode, limit: 50 }
      });
      const data = response.data.data;
      console.log(`✅ Activities for ${parkCode}: ${data.length} found`);
      this._setEndpointCache(cacheKey, data);
      return data;
    } catch (error) {
      if (error.response?.status === 429) {
        console.warn(`⚠️ NPS 429 on activities for ${parkCode}`);
        return [];
      }
      console.error(`❌ NPS API Error (getParkActivities for ${parkCode}):`, error.message);
      throw new Error(`Failed to fetch activities for ${parkCode}: ${error.message}`);
    }
  }

  // Bulk-fetch all alerts from NPS API and group by parkCode
  async getAllAlerts() {
    if (this._isCacheValid(this.alertsCache) && this.alertsCache.data) {
      console.log('📦 Returning cached bulk alerts');
      return this.alertsCache.data;
    }

    console.log('🔄 Fetching all alerts from NPS API (bulk)...');

    let allAlerts = [];
    const pageSize = 50;
    let start = 0;

    try {
      while (true) {
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
        const code = alert.parkCode;
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
      return alertsByPark;
    } catch (error) {
      if (error.response?.status === 429) {
        if (this.alertsCache.data) {
          console.warn('⚠️ NPS 429 on bulk alerts — returning stale cache');
          return this.alertsCache.data;
        }
        console.warn('⚠️ NPS 429 on bulk alerts — no cache available, returning empty');
        return {};
      }
      console.error('NPS API Error (getAllAlerts):', error.message);
      return {};
    }
  }

  // Get park alerts — serves from bulk cache first, falls back to per-park call
  async getParkAlerts(parkCode) {
    // Check bulk alerts cache first
    if (this._isCacheValid(this.alertsCache) && this.alertsCache.data) {
      return this.alertsCache.data[parkCode] || [];
    }

    // Check per-endpoint cache
    const cacheKey = `alerts_${parkCode}`;
    const cached = this._getEndpointCache(cacheKey, 'alerts');
    if (cached) return cached;

    try {
      const response = await this.api.get('/alerts', {
        params: { parkCode }
      });
      const data = response.data.data;
      console.log(`✅ Alerts for ${parkCode}: ${data.length} found`);
      this._setEndpointCache(cacheKey, data);
      return data;
    } catch (error) {
      if (error.response?.status === 429) {
        console.warn(`⚠️ NPS 429 on alerts for ${parkCode}`);
        return [];
      }
      console.error(`❌ NPS API Error (getParkAlerts for ${parkCode}):`, error.message);
      throw new Error(`Failed to fetch alerts for ${parkCode}: ${error.message}`);
    }
  }

  // Bulk-fetch all campgrounds and group by parkCode
  async getAllCampgrounds() {
    if (this._isCacheValid(this.campgroundsCache) && this.campgroundsCache.data) {
      console.log('📦 Returning cached bulk campgrounds');
      return this.campgroundsCache.data;
    }

    console.log('🔄 Fetching all campgrounds from NPS API (bulk)...');

    let allCampgrounds = [];
    const pageSize = 50;
    let start = 0;

    try {
      while (true) {
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
        const code = cg.parkCode;
        if (!code) continue;
        if (!byPark[code]) byPark[code] = [];
        byPark[code].push(cg);
      }

      this.campgroundsCache = { ...this.campgroundsCache, data: byPark, timestamp: Date.now() };
      console.log(`✅ Total campgrounds fetched (bulk): ${allCampgrounds.length} across ${Object.keys(byPark).length} parks`);
      return byPark;
    } catch (error) {
      if (error.response?.status === 429) {
        if (this.campgroundsCache.data) {
          console.warn('⚠️ NPS 429 on bulk campgrounds — returning stale cache');
          return this.campgroundsCache.data;
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
    if (this._isCacheValid(this.campgroundsCache) && this.campgroundsCache.data) {
      return this.campgroundsCache.data[parkCode] || [];
    }

    const cacheKey = `campgrounds_${parkCode}`;
    const cached = this._getEndpointCache(cacheKey, 'campgrounds');
    if (cached) return cached;

    try {
      const response = await this.api.get('/campgrounds', {
        params: { parkCode, limit: 50 }
      });
      const data = response.data.data;
      console.log(`✅ Campgrounds for ${parkCode}: ${data.length} found`);
      this._setEndpointCache(cacheKey, data);
      return data;
    } catch (error) {
      if (error.response?.status === 429) {
        console.warn(`⚠️ NPS 429 on campgrounds for ${parkCode}`);
        return [];
      }
      console.error(`❌ NPS API Error (getParkCampgrounds for ${parkCode}):`, error.message);
      throw new Error(`Failed to fetch campgrounds for ${parkCode}: ${error.message}`);
    }
  }

  // Bulk-fetch all visitor centers and group by parkCode
  async getAllVisitorCenters() {
    if (this._isCacheValid(this.visitorCentersCache) && this.visitorCentersCache.data) {
      console.log('📦 Returning cached bulk visitor centers');
      return this.visitorCentersCache.data;
    }

    console.log('🔄 Fetching all visitor centers from NPS API (bulk)...');

    let allVCs = [];
    const pageSize = 50;
    let start = 0;

    try {
      while (true) {
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
        const code = vc.parkCode;
        if (!code) continue;
        if (!byPark[code]) byPark[code] = [];
        byPark[code].push(vc);
      }

      this.visitorCentersCache = { ...this.visitorCentersCache, data: byPark, timestamp: Date.now() };
      console.log(`✅ Total visitor centers fetched (bulk): ${allVCs.length} across ${Object.keys(byPark).length} parks`);
      return byPark;
    } catch (error) {
      if (error.response?.status === 429) {
        if (this.visitorCentersCache.data) {
          console.warn('⚠️ NPS 429 on bulk visitor centers — returning stale cache');
          return this.visitorCentersCache.data;
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
    if (this._isCacheValid(this.visitorCentersCache) && this.visitorCentersCache.data) {
      return this.visitorCentersCache.data[parkCode] || [];
    }

    const cacheKey = `visitorcenters_${parkCode}`;
    const cached = this._getEndpointCache(cacheKey, 'visitorcenters');
    if (cached) return cached;

    try {
      const response = await this.api.get('/visitorcenters', {
        params: { parkCode, limit: 50 }
      });
      const data = response.data.data;
      console.log(`✅ Visitor Centers for ${parkCode}: ${data.length} found`);
      this._setEndpointCache(cacheKey, data);
      return data;
    } catch (error) {
      if (error.response?.status === 429) {
        console.warn(`⚠️ NPS 429 on visitor centers for ${parkCode}`);
        return [];
      }
      console.error(`❌ NPS API Error (getParkVisitorCenters for ${parkCode}):`, error.message);
      throw new Error(`Failed to fetch visitor centers for ${parkCode}: ${error.message}`);
    }
  }

  // --- Bulk places ---

  async getAllPlaces() {
    if (this._isCacheValid(this.placesCache) && this.placesCache.data) {
      console.log('📦 Returning cached bulk places');
      return this.placesCache.data;
    }

    console.log('🔄 Fetching all places from NPS API (bulk)...');

    let allPlaces = [];
    const pageSize = 50;
    let start = 0;

    try {
      while (true) {
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
        const code = place.relatedParks?.[0]?.parkCode || place.parkCode;
        if (!code) continue;
        if (!byPark[code]) byPark[code] = [];
        byPark[code].push(place);
      }

      this.placesCache = { ...this.placesCache, data: byPark, timestamp: Date.now() };
      console.log(`✅ Total places fetched (bulk): ${allPlaces.length} across ${Object.keys(byPark).length} parks`);
      return byPark;
    } catch (error) {
      if (error.response?.status === 429) {
        if (this.placesCache.data) {
          console.warn('⚠️ NPS 429 on bulk places — returning stale cache');
          return this.placesCache.data;
        }
        console.warn('⚠️ NPS 429 on bulk places — no cache available, returning empty');
        return {};
      }
      console.error('NPS API Error (getAllPlaces):', error.message);
      return {};
    }
  }

  async getParkPlaces(parkCode) {
    if (this._isCacheValid(this.placesCache) && this.placesCache.data) {
      return this.placesCache.data[parkCode] || [];
    }

    const cacheKey = `places_${parkCode}`;
    const cached = this._getEndpointCache(cacheKey, 'places');
    if (cached) return cached;

    try {
      const response = await this.api.get('/places', {
        params: { parkCode, limit: 50 }
      });
      const data = response.data.data;
      this._setEndpointCache(cacheKey, data);
      return data;
    } catch (error) {
      if (error.response?.status === 429) {
        console.warn(`⚠️ NPS 429 on places for ${parkCode}`);
        return [];
      }
      console.error(`❌ NPS API Error (getParkPlaces for ${parkCode}):`, error.message);
      return [];
    }
  }

  // --- Bulk tours ---

  async getAllTours() {
    if (this._isCacheValid(this.toursCache) && this.toursCache.data) {
      console.log('📦 Returning cached bulk tours');
      return this.toursCache.data;
    }

    console.log('🔄 Fetching all tours from NPS API (bulk)...');

    let allTours = [];
    const pageSize = 50;
    let start = 0;

    try {
      while (true) {
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
        const code = tour.park?.parkCode || tour.parkCode;
        if (!code) continue;
        if (!byPark[code]) byPark[code] = [];
        byPark[code].push(tour);
      }

      this.toursCache = { ...this.toursCache, data: byPark, timestamp: Date.now() };
      console.log(`✅ Total tours fetched (bulk): ${allTours.length} across ${Object.keys(byPark).length} parks`);
      return byPark;
    } catch (error) {
      if (error.response?.status === 429) {
        if (this.toursCache.data) {
          console.warn('⚠️ NPS 429 on bulk tours — returning stale cache');
          return this.toursCache.data;
        }
        console.warn('⚠️ NPS 429 on bulk tours — no cache available, returning empty');
        return {};
      }
      console.error('NPS API Error (getAllTours):', error.message);
      return {};
    }
  }

  async getParkTours(parkCode) {
    if (this._isCacheValid(this.toursCache) && this.toursCache.data) {
      return this.toursCache.data[parkCode] || [];
    }

    const cacheKey = `tours_${parkCode}`;
    const cached = this._getEndpointCache(cacheKey, 'tours');
    if (cached) return cached;

    try {
      const response = await this.api.get('/tours', {
        params: { parkCode, limit: 50 }
      });
      const data = response.data.data;
      this._setEndpointCache(cacheKey, data);
      return data;
    } catch (error) {
      if (error.response?.status === 429) {
        console.warn(`⚠️ NPS 429 on tours for ${parkCode}`);
        return [];
      }
      console.error(`❌ NPS API Error (getParkTours for ${parkCode}):`, error.message);
      return [];
    }
  }

  // --- Bulk webcams ---

  async getAllWebcams() {
    if (this._isCacheValid(this.webcamsCache) && this.webcamsCache.data) {
      console.log('📦 Returning cached bulk webcams');
      return this.webcamsCache.data;
    }

    console.log('🔄 Fetching all webcams from NPS API (bulk)...');

    let allWebcams = [];
    const pageSize = 50;
    let start = 0;

    try {
      while (true) {
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
        const code = cam.relatedParks?.[0]?.parkCode || cam.parkCode;
        if (!code) continue;
        if (!byPark[code]) byPark[code] = [];
        byPark[code].push(cam);
      }

      this.webcamsCache = { ...this.webcamsCache, data: byPark, timestamp: Date.now() };
      console.log(`✅ Total webcams fetched (bulk): ${allWebcams.length} across ${Object.keys(byPark).length} parks`);
      return byPark;
    } catch (error) {
      if (error.response?.status === 429) {
        if (this.webcamsCache.data) {
          console.warn('⚠️ NPS 429 on bulk webcams — returning stale cache');
          return this.webcamsCache.data;
        }
        console.warn('⚠️ NPS 429 on bulk webcams — no cache available, returning empty');
        return {};
      }
      console.error('NPS API Error (getAllWebcams):', error.message);
      return {};
    }
  }

  async getParkWebcams(parkCode) {
    if (this._isCacheValid(this.webcamsCache) && this.webcamsCache.data) {
      return this.webcamsCache.data[parkCode] || [];
    }

    const cacheKey = `webcams_${parkCode}`;
    const cached = this._getEndpointCache(cacheKey, 'webcams');
    if (cached) return cached;

    try {
      const response = await this.api.get('/webcams', {
        params: { parkCode, limit: 50 }
      });
      const data = response.data.data;
      this._setEndpointCache(cacheKey, data);
      return data;
    } catch (error) {
      if (error.response?.status === 429) {
        console.warn(`⚠️ NPS 429 on webcams for ${parkCode}`);
        return [];
      }
      console.error(`❌ NPS API Error (getParkWebcams for ${parkCode}):`, error.message);
      return [];
    }
  }

  // Get all events from NPS API with caching — uses bulk paginated fetch
  async getAllEvents(limit = 100) {
    try {
      // Check cache first
      const cachedEvents = this.getCachedEvents();
      if (cachedEvents) {
        return cachedEvents.slice(0, limit);
      }

      console.log('🔄 Cache miss - fetching fresh events from NPS API (bulk)...');

      let allEvents = [];
      const today = new Date();
      const pageSize = 50; // NPS events endpoint max per page
      let start = 0;

      // Paginated bulk fetch — no per-park iteration
      while (true) {
        const response = await this.api.get('/events', {
          params: { limit: pageSize, start }
        });

        const events = response.data.data;
        if (!events || events.length === 0) break;

        // Filter to future events only
        const validEvents = events.filter(event => {
          const eventDate = new Date(event.datestart || event.date);
          return eventDate >= today;
        });

        allEvents = allEvents.concat(validEvents);
        start += pageSize;

        console.log(`📅 Fetched page at offset ${start}, ${allEvents.length} future events so far`);

        if (events.length < pageSize) break; // last page

        // Small delay between pages
        await new Promise(resolve => setTimeout(resolve, 200));
      }

      // Sort events by date
      allEvents.sort((a, b) => new Date(a.datestart || a.date) - new Date(b.datestart || b.date));

      // Cache the results
      this.setEventsCache(allEvents);

      console.log(`✅ Total events fetched (bulk): ${allEvents.length}`);
      return allEvents.slice(0, limit);
    } catch (error) {
      // On 429, return stale cache if available
      if (error.response?.status === 429 && this.eventsCache.data) {
        console.warn('⚠️ NPS 429 rate limit on events — returning stale cache');
        return this.eventsCache.data.slice(0, limit);
      }
      console.error('NPS API Error (getAllEvents):', error.message);
      return [];
    }
  }

  // Get events by park (cached)
  async getEventsByPark(parkCode) {
    const cacheKey = `events_${parkCode}`;
    const cached = this._getEndpointCache(cacheKey, 'alerts'); // reuse 30min TTL
    if (cached) return cached;

    try {
      const response = await this.api.get('/events', {
        params: { parkCode, limit: 50 }
      });
      const data = response.data.data;
      console.log(`Events for ${parkCode}: ${data.length}`);
      this._setEndpointCache(cacheKey, data);
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
    try {
      const cachedActivities = this.getCachedActivities();
      if (cachedActivities) {
        return cachedActivities.slice(0, limit);
      }

      console.log('🔄 Fetching all activities from NPS API (bulk)...');

      let allActivities = [];
      const pageSize = 50;
      let start = 0;

      while (true) {
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
      return allActivities.slice(0, limit);
    } catch (error) {
      // On 429, return stale cache or empty array — don't crash the warm-up
      if (error.response?.status === 429) {
        if (this.activitiesCache.data) {
          console.warn('⚠️ NPS 429 rate limit on activities — returning stale cache');
          return this.activitiesCache.data.slice(0, limit);
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

}

module.exports = new NPSService();
