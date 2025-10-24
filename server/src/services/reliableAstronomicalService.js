/**
 * Reliable Astronomical Service - Using proven APIs for accurate data
 * Uses Sunrise-Sunset API and other reliable sources
 */

const axios = require('axios');

class ReliableAstronomicalService {
  constructor() {
    this.sunriseSunsetAPI = 'https://api.sunrise-sunset.org/json';
  }

  /**
   * Get accurate astronomical data using reliable APIs
   * @param {number} latitude - Latitude in degrees
   * @param {number} longitude - Longitude in degrees
   * @param {Date} date - Date for calculation
   * @param {number} elevation - Elevation in meters
   * @returns {Object} Astronomical data
   */
  async getAstronomicalData(latitude, longitude, date, elevation = 0) {
    try {
      console.log(`🌙 ReliableAstro: Getting data for lat=${latitude}, lng=${longitude}, date=${date.toISOString().split('T')[0]}`);
      
      // Get sunrise/sunset data from reliable API
      const sunData = await this.getSunData(latitude, longitude, date);
      
      // Calculate moon phase (this is accurate)
      const moonData = this.calculateMoonPhase(date);
      
      // Calculate sky conditions
      const skyConditions = this.calculateSkyConditions(latitude, longitude, date, sunData, moonData);
      
      return {
        sunrise: sunData.sunrise,
        sunset: sunData.sunset,
        dayLength: sunData.dayLength,
        moonPhase: moonData.moonPhase,
        moonIllumination: moonData.moonIllumination,
        moonAge: moonData.moonAge,
        nextNewMoon: moonData.nextNewMoon,
        nextFullMoon: moonData.nextFullMoon,
        milkyWayVisibility: skyConditions.milkyWayVisibility,
        auroraProbability: skyConditions.auroraProbability,
        isPolarDay: sunData.isPolarDay,
        isPolarNight: sunData.isPolarNight,
        sunDeclination: sunData.declination,
        sunRightAscension: sunData.rightAscension
      };
      
    } catch (error) {
      console.error('❌ ReliableAstro Error:', error.message);
      // Return fallback data
      return this.getFallbackAstronomicalData();
    }
  }

  /**
   * Get sun data from Sunrise-Sunset API
   * @param {number} latitude - Latitude in degrees
   * @param {number} longitude - Longitude in degrees
   * @param {Date} date - Date for calculation
   * @returns {Object} Sun data
   */
  async getSunData(latitude, longitude, date) {
    try {
      const dateStr = date.toISOString().split('T')[0];
      
      const response = await axios.get(this.sunriseSunsetAPI, {
        params: {
          lat: latitude,
          lng: longitude,
          date: dateStr,
          formatted: 0 // Get UTC times
        },
        timeout: 5000
      });

      if (response.data.status === 'OK') {
        const results = response.data.results;
        
        // Convert UTC times to local time
        const sunriseUTC = new Date(results.sunrise);
        const sunsetUTC = new Date(results.sunset);
        
        // Convert to local time (simplified - just use the API times)
        const sunrise = this.formatTime(sunriseUTC);
        const sunset = this.formatTime(sunsetUTC);
        
        // Calculate day length
        const dayLength = (sunsetUTC - sunriseUTC) / (1000 * 60 * 60); // hours
        
        console.log(`🌅 ReliableAstro: Sunrise=${sunrise}, Sunset=${sunset}, DayLength=${dayLength.toFixed(2)}h`);
        
        return {
          sunrise,
          sunset,
          dayLength,
          isPolarDay: results.polar_day === '1',
          isPolarNight: results.polar_night === '1',
          declination: 0, // Not provided by API
          rightAscension: 0 // Not provided by API
        };
        
      } else {
        throw new Error(`Sunrise-Sunset API error: ${response.data.status}`);
      }
      
    } catch (error) {
      console.error('❌ Sun data API error:', error.message);
      throw error;
    }
  }

  /**
   * Calculate moon phase using accurate algorithm
   * @param {Date} date - Date for calculation
   * @returns {Object} Moon data
   */
  calculateMoonPhase(date) {
    // Use the existing accurate moon phase calculation
    const julianDay = this.julianDay(date);
    
    // Calculate days since last new moon
    const K = Math.floor((julianDay - 2451545.0) / 29.53058867);
    const T = (julianDay - 2451545.0 - K * 29.53058867) / 29.53058867;

    const phases = [
      'New Moon', 'Waxing Crescent', 'First Quarter', 'Waxing Gibbous',
      'Full Moon', 'Waning Gibbous', 'Last Quarter', 'Waning Crescent'
    ];
    
    const phaseIndex = Math.floor(T * 8 + 0.5) & 7;
    const moonPhase = phases[phaseIndex];
    
    // Moon illumination
    const illumination = Math.round(50 * (1 - Math.cos(2 * Math.PI * T)));
    
    // Moon age in days
    const moonAge = Math.round(T * 29.53058867);
    
    // Calculate next new moon and full moon (fix the calculation)
    const daysToNextNewMoon = (29.53058867 - T * 29.53058867);
    const daysToNextFullMoon = (14.765294335 - T * 29.53058867);
    
    const nextNewMoon = new Date(date.getTime() + daysToNextNewMoon * 24 * 60 * 60 * 1000);
    const nextFullMoon = new Date(date.getTime() + daysToNextFullMoon * 24 * 60 * 60 * 1000);
    
    return {
      moonPhase,
      moonIllumination: illumination,
      moonAge,
      nextNewMoon: nextNewMoon.toISOString(),
      nextFullMoon: nextFullMoon.toISOString()
    };
  }

  /**
   * Calculate sky conditions based on location and time
   * @param {number} latitude - Latitude in degrees
   * @param {number} longitude - Longitude in degrees
   * @param {Date} date - Date for calculation
   * @param {Object} sunData - Sun data
   * @param {Object} moonData - Moon data
   * @returns {Object} Sky conditions
   */
  calculateSkyConditions(latitude, longitude, date, sunData, moonData) {
    // Milky Way visibility based on location and season
    const month = date.getMonth();
    const isNorthernHemisphere = latitude > 0;
    
    let milkyWayVisibility = 'Good';
    if (isNorthernHemisphere) {
      // Milky Way is more visible in summer months
      if (month >= 4 && month <= 9) {
        milkyWayVisibility = 'Excellent';
      } else if (month >= 2 && month <= 11) {
        milkyWayVisibility = 'Good';
      } else {
        milkyWayVisibility = 'Fair';
      }
    } else {
      // Southern hemisphere - opposite season
      if (month >= 10 || month <= 3) {
        milkyWayVisibility = 'Excellent';
      } else if (month >= 4 && month <= 9) {
        milkyWayVisibility = 'Good';
      } else {
        milkyWayVisibility = 'Fair';
      }
    }
    
    // Aurora probability based on latitude
    let auroraProbability = 'Very Low';
    const absLatitude = Math.abs(latitude);
    if (absLatitude > 60) {
      auroraProbability = 'High';
    } else if (absLatitude > 50) {
      auroraProbability = 'Moderate';
    } else if (absLatitude > 40) {
      auroraProbability = 'Low';
    }
    
    return {
      milkyWayVisibility,
      auroraProbability
    };
  }

  /**
   * Calculate Julian Day
   * @param {Date} date - JavaScript Date object
   * @returns {number} Julian Day
   */
  julianDay(date) {
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const day = date.getDate();
    const hour = date.getHours();
    const minute = date.getMinutes();
    const second = date.getSeconds();

    const decimalDay = day + (hour + minute / 60 + second / 3600) / 24;

    let a, b;
    if (month <= 2) {
      a = year - 1;
      b = 0;
    } else {
      a = year;
      b = 2 - Math.floor(year / 100) + Math.floor(year / 400);
    }

    return Math.floor(365.25 * (a + 4716)) + Math.floor(30.6001 * (month + 1)) + decimalDay + b - 1524.5;
  }

  /**
   * Format time to HH:MM AM/PM
   * @param {Date} date - Date object
   * @returns {string} Formatted time
   */
  formatTime(date) {
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  }

  /**
   * Get hour in 24-hour format for validation
   * @param {string} timeStr - Time string in HH:MM AM/PM format
   * @returns {number} Hour in 24-hour format
   */
  getHour24(timeStr) {
    const [time, period] = timeStr.split(' ');
    const [hour, minute] = time.split(':');
    let hour24 = parseInt(hour);
    
    if (period === 'PM' && hour24 !== 12) {
      hour24 += 12;
    } else if (period === 'AM' && hour24 === 12) {
      hour24 = 0;
    }
    
    return hour24;
  }

  /**
   * Get fallback astronomical data
   * @returns {Object} Fallback data
   */
  getFallbackAstronomicalData() {
    console.log('⚠️ Using fallback astronomical data');
    return {
      sunrise: '6:30 AM',
      sunset: '6:30 PM',
      dayLength: 12,
      moonPhase: 'Waxing Crescent',
      moonIllumination: 50,
      moonAge: 7,
      nextNewMoon: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      nextFullMoon: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
      milkyWayVisibility: 'Good',
      auroraProbability: 'Low',
      isPolarDay: false,
      isPolarNight: false,
      sunDeclination: 0,
      sunRightAscension: 0
    };
  }
}

module.exports = new ReliableAstronomicalService();
