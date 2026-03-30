const axios = require('axios');

const NPS_API_BASE = 'https://developer.nps.gov/api/v1';
const API_KEY = process.env.NPS_API_KEY;

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
      ttl: 30 * 60 * 1000 // 30 minutes cache
    };

    // Cache all parks aggressively since the upstream dataset is relatively static
    this.parksCache = {
      data: null,
      timestamp: null,
      ttl: 24 * 60 * 60 * 1000 // 24 hours
    };
  }

  // Check if cache is valid
  isCacheValid() {
    if (!this.eventsCache.data || !this.eventsCache.timestamp) {
      return false;
    }
    return Date.now() - this.eventsCache.timestamp < this.eventsCache.ttl;
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
      data: data,
      timestamp: Date.now(),
      ttl: 30 * 60 * 1000
    };
    console.log('💾 Events cached for 30 minutes');
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
      return allParks;
    } catch (error) {
      console.error('NPS API Error:', error.message);

      if (this.parksCache.data) {
        console.warn('⚠️ Returning stale cached parks after NPS failure');
        return this.parksCache.data;
      }

      throw new Error(`Failed to fetch parks: ${error.message}`);
    }
  }

  // Get park by code
  async getParkByCode(parkCode) {
    try {
      const response = await this.api.get('/parks', {
        params: { parkCode }
      });
      return response.data.data[0];
    } catch (error) {
      console.error('NPS API Error:', error.message);
      throw new Error(`Failed to fetch park ${parkCode}: ${error.message}`);
    }
  }

  // Get parks by state
  async getParksByState(stateCode) {
    try {
      const response = await this.api.get('/parks', {
        params: { stateCode, limit: 100 }
      });
      return response.data.data;
    } catch (error) {
      console.error('NPS API Error:', error.message);
      throw new Error(`Failed to fetch parks for state ${stateCode}: ${error.message}`);
    }
  }

  // Get park activities
  async getParkActivities(parkCode) {
    try {
      const response = await this.api.get('/thingstodo', {
        params: { parkCode, limit: 50 }
      });
      console.log(`✅ Activities for ${parkCode}: ${response.data.data.length} found`);
      return response.data.data;
    } catch (error) {
      console.error(`❌ NPS API Error (getParkActivities for ${parkCode}):`, error.message);
      throw new Error(`Failed to fetch activities for ${parkCode}: ${error.message}`);
    }
  }

  // Get park alerts
  async getParkAlerts(parkCode) {
    try {
      const response = await this.api.get('/alerts', {
        params: { parkCode }
      });
      console.log(`✅ Alerts for ${parkCode}: ${response.data.data.length} found`);
      return response.data.data;
    } catch (error) {
      console.error(`❌ NPS API Error (getParkAlerts for ${parkCode}):`, error.message);
      throw new Error(`Failed to fetch alerts for ${parkCode}: ${error.message}`);
    }
  }

  // Get park campgrounds
  async getParkCampgrounds(parkCode) {
    try {
      const response = await this.api.get('/campgrounds', {
        params: { parkCode, limit: 50 }
      });
      console.log(`✅ Campgrounds for ${parkCode}: ${response.data.data.length} found`);
      return response.data.data;
    } catch (error) {
      console.error(`❌ NPS API Error (getParkCampgrounds for ${parkCode}):`, error.message);
      throw new Error(`Failed to fetch campgrounds for ${parkCode}: ${error.message}`);
    }
  }

  // Get park visitor centers
  async getParkVisitorCenters(parkCode) {
    try {
      const response = await this.api.get('/visitorcenters', {
        params: { parkCode, limit: 50 }
      });
      console.log(`✅ Visitor Centers for ${parkCode}: ${response.data.data.length} found`);
      return response.data.data;
    } catch (error) {
      console.error(`❌ NPS API Error (getParkVisitorCenters for ${parkCode}):`, error.message);
      throw new Error(`Failed to fetch visitor centers for ${parkCode}: ${error.message}`);
    }
  }

  // Get all events from NPS API with caching and proper date filtering
  async getAllEvents(limit = 100) {
    try {
      // Check cache first
      const cachedEvents = this.getCachedEvents();
      if (cachedEvents) {
        return cachedEvents.slice(0, limit);
      }

      console.log('🔄 Cache miss - fetching fresh events from NPS API...');
      
      // First, get all parks to ensure we cover all possible events
      const allParks = await this.getAllParks(500);
      const parkCodes = allParks.map(park => park.parkCode).filter(code => code);
      
      console.log(`Fetching events from ${parkCodes.length} parks...`);
      
      let allEvents = [];
      const today = new Date('2025-10-02'); // October 2, 2025
      
      // Process parks in batches to avoid overwhelming the API
      const batchSize = 10;
      for (let i = 0; i < parkCodes.length; i += batchSize) {
        const batch = parkCodes.slice(i, i + batchSize);
        
        // Process batch in parallel
        const batchPromises = batch.map(async (parkCode) => {
          try {
            const response = await this.api.get('/events', {
              params: { parkCode, limit: 20 }
            });
            
            if (response.data.data && response.data.data.length > 0) {
              // Filter events to only include future dates and add parkCode
              const validEvents = response.data.data
                .filter(event => {
                  const eventDate = new Date(event.datestart || event.date);
                  return eventDate >= today;
                })
                .map(event => ({
                  ...event,
                  parkCode: parkCode
                }));
              
              return validEvents;
            }
            return [];
          } catch (parkError) {
            console.log(`No events found for park ${parkCode}`);
            return [];
          }
        });
        
        const batchResults = await Promise.all(batchPromises);
        allEvents = allEvents.concat(batchResults.flat());
        
        // Log progress
        console.log(`Processed ${Math.min(i + batchSize, parkCodes.length)}/${parkCodes.length} parks, found ${allEvents.length} events so far`);
        
        // If we have enough events, we can stop
        if (allEvents.length >= limit) {
          break;
        }
      }

      // Sort events by date and limit results
      allEvents.sort((a, b) => new Date(a.datestart || a.date) - new Date(b.datestart || b.date));
      
      // Cache the results
      this.setEventsCache(allEvents);
      
      console.log(`Total real events fetched from ${parkCodes.length} parks: ${allEvents.length}`);
      return allEvents.slice(0, limit);
    } catch (error) {
      console.error('NPS API Error (getAllEvents):', error.message);
      return [];
    }
  }

  // Get events by park
  async getEventsByPark(parkCode) {
    try {
      const response = await this.api.get('/events', {
        params: { parkCode, limit: 50 }
      });
      console.log(`Events for ${parkCode}: ${response.data.data.length}`);
      return response.data.data;
    } catch (error) {
      console.error('NPS API Error (getEventsByPark):', error.message);
      return [];
    }
  }

  // Get all activities across all parks
  async getAllActivities(limit = 500) {
    try {
      console.log('🔄 Fetching all activities across all parks...');
      
      // First, get all parks
      const allParks = await this.getAllParks(600);
      const parkCodes = allParks.map(park => park.parkCode).filter(code => code);
      
      console.log(`📊 Fetching activities from ${parkCodes.length} parks...`);
      
      let allActivities = [];
      
      // Process parks in batches to avoid overwhelming the API
      const batchSize = 10;
      for (let i = 0; i < parkCodes.length; i += batchSize) {
        const batch = parkCodes.slice(i, i + batchSize);
        
        // Process batch in parallel
        const batchPromises = batch.map(async (parkCode) => {
          try {
            const response = await this.api.get('/thingstodo', {
              params: { parkCode, limit: 50 }
            });
            
            if (response.data.data && response.data.data.length > 0) {
              // Add parkCode to each activity for reference
              return response.data.data.map(activity => ({
                ...activity,
                parkCode: parkCode
              }));
            }
            return [];
          } catch (parkError) {
            console.log(`No activities found for park ${parkCode}`);
            return [];
          }
        });
        
        const batchResults = await Promise.all(batchPromises);
        allActivities = allActivities.concat(batchResults.flat());
        
        // Log progress
        console.log(`📦 Processed ${Math.min(i + batchSize, parkCodes.length)}/${parkCodes.length} parks, found ${allActivities.length} activities so far`);
        
        // If we have enough activities, we can stop
        if (allActivities.length >= limit) {
          break;
        }
      }
      
      console.log(`✅ Total activities fetched: ${allActivities.length}`);
      return allActivities.slice(0, limit);
    } catch (error) {
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
