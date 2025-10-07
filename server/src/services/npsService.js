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

  // Get all parks
  async getAllParks(limit = 500) {
    try {
      const response = await this.api.get('/parks', {
        params: { limit }
      });
      return response.data.data;
    } catch (error) {
      console.error('NPS API Error:', error.message);
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

}

module.exports = new NPSService();
