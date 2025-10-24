const axios = require('axios');

class ElevationService {
  constructor() {
    this.cache = new Map();
    this.cacheTimeout = 24 * 60 * 60 * 1000; // 24 hours
  }

  async getElevation(lat, lng) {
    const cacheKey = `${lat},${lng}`;
    const cached = this.cache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
      console.log(`🏔️ Using cached elevation for ${lat},${lng}: ${cached.elevation}`);
      return cached.elevation;
    }

    try {
      console.log(`🏔️ Fetching elevation for ${lat},${lng}`);
      
      // Try OpenElevation API first (free, no key required)
      const response = await axios.get(`https://api.open-elevation.com/api/v1/lookup`, {
        params: {
          locations: `${lat},${lng}`
        },
        timeout: 5000
      });

      if (response.data && response.data.results && response.data.results.length > 0) {
        const elevation = Math.round(response.data.results[0].elevation);
        const elevationFormatted = this.formatElevation(elevation);
        
        // Cache the result
        this.cache.set(cacheKey, {
          elevation: elevationFormatted,
          timestamp: Date.now()
        });
        
        console.log(`🏔️ Real elevation from OpenElevation API: ${elevation}m (${elevationFormatted})`);
        return elevationFormatted;
      }
    } catch (error) {
      console.warn(`🏔️ OpenElevation API failed: ${error.message}`);
    }

    try {
      // Fallback to USGS Elevation Point Query Service
      const usgsResponse = await axios.get(`https://nationalmap.gov/epqs/pqs.php`, {
        params: {
          x: lng,
          y: lat,
          units: 'Meters',
          output: 'json'
        },
        timeout: 5000
      });

      if (usgsResponse.data && usgsResponse.data.USGS_Elevation_Point_Query_Service && 
          usgsResponse.data.USGS_Elevation_Point_Query_Service.Elevation_Query) {
        const elevation = Math.round(parseFloat(usgsResponse.data.USGS_Elevation_Point_Query_Service.Elevation_Query.Elevation));
        const elevationFormatted = this.formatElevation(elevation);
        
        // Cache the result
        this.cache.set(cacheKey, {
          elevation: elevationFormatted,
          timestamp: Date.now()
        });
        
        console.log(`🏔️ Real elevation from USGS API: ${elevation}m (${elevationFormatted})`);
        return elevationFormatted;
      }
    } catch (error) {
      console.warn(`🏔️ USGS Elevation API failed: ${error.message}`);
    }

    // Final fallback to park-specific known elevations
    console.log(`🏔️ Using fallback elevation for ${lat},${lng}`);
    return this.getFallbackElevation(lat, lng);
  }

  formatElevation(elevationMeters) {
    if (elevationMeters >= 1000) {
      return `${(elevationMeters / 1000).toFixed(1)}k ft`;
    } else {
      return `${Math.round(elevationMeters * 3.28084)}ft`;
    }
  }

  getFallbackElevation(lat, lng) {
    // Known elevations for major National Parks (in meters)
    const knownElevations = {
      // Rocky Mountain National Park
      '40.3428,-105.6836': '3,700m',
      // Grand Canyon National Park
      '36.1069,-112.1129': '2,100m',
      // Great Smoky Mountains National Park
      '35.6012,-83.5082': '2,000m',
      // Yellowstone National Park
      '44.4280,-110.5885': '2,400m',
      // Glacier National Park
      '48.7596,-113.7870': '1,800m',
      // Death Valley National Park
      '36.5054,-117.0794': '86m',
      // Yosemite National Park
      '37.8651,-119.5383': '1,200m',
      // Acadia National Park
      '44.3386,-68.2733': '460m',
      // Zion National Park
      '37.2982,-113.0263': '1,200m',
      // Arches National Park
      '38.7331,-109.5925': '1,500m'
    };

    const key = `${parseFloat(lat).toFixed(4)},${parseFloat(lng).toFixed(4)}`;
    return knownElevations[key] || '1,500m';
  }
}

module.exports = new ElevationService();
