import axios from 'axios';
import globalCacheManager from './globalCacheManager';
import cacheService from './cacheService';
// import type { WeatherData, ForecastData } from '../types/weather';

const OPENWEATHER_API_KEY = import.meta.env.VITE_OPENWEATHER_API_KEY;
const API_BASE = 'https://api.openweathermap.org/data/2.5';

// Debug: Log API key status (remove in production)
if (!OPENWEATHER_API_KEY) {
  console.warn('⚠️ VITE_OPENWEATHER_API_KEY is not set! Weather data will fall back to sample data.');
  console.warn('Environment check:', {
    NODE_ENV: process.env.NODE_ENV,
    hasKey: !!import.meta.env.VITE_OPENWEATHER_API_KEY,
    keyLength: import.meta.env.VITE_OPENWEATHER_API_KEY?.length || 0
  });
} else {
  console.log('✅ OpenWeatherAPI key loaded successfully');

}

class WeatherService {
  private requestQueue: any[];
  private isProcessing: boolean;
  private lastRequestTime: number;
  private minRequestInterval: number;

  constructor() {
    this.requestQueue = [];
    this.isProcessing = false;
    this.lastRequestTime = 0;
    this.minRequestInterval = 1000; // 1 second between requests
  }

  // Rate limiting helper
  async throttleRequest(): Promise<void> {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    
    if (timeSinceLastRequest < this.minRequestInterval) {
      const delay = this.minRequestInterval - timeSinceLastRequest;
      await new Promise(resolve => setTimeout(resolve, delay));
    }
    
    this.lastRequestTime = Date.now();
  }

  async getWeather(latitude: number, longitude: number) {
    if (!OPENWEATHER_API_KEY) {
      console.warn('OpenWeatherAPI key not configured, using fallback data');
      return this.getFallbackWeatherData(latitude, longitude);
    }

    const params = {
      lat: latitude.toString(),
      lon: longitude.toString(),
      appid: OPENWEATHER_API_KEY,
      units: 'imperial'
    };
    
    const cacheKey = `${API_BASE}/weather?${new URLSearchParams(params).toString()}`;
    
    try {
      const result = await globalCacheManager.get(
        cacheKey,
        'weather',
        async () => {
          // Apply rate limiting
          await this.throttleRequest();
          
          const response = await axios.get(`${API_BASE}/weather`, { 
            params,
            timeout: 10000 // 10 second timeout
          });
          return response.data;
        }
      );
      return result.data;
    } catch (error: any) {
      if (error.response?.status === 401) {
        throw new Error('Invalid OpenWeatherAPI key - please check your configuration');
      } else if (error.response?.status === 429) {
        // Return cached data if available, otherwise use fallback
        const cachedData = this.getCachedWeatherData(cacheKey);
        if (cachedData) {
          console.warn('Rate limit exceeded, returning cached weather data');
          return cachedData;
        }
        console.warn('Rate limit exceeded, using fallback weather data');
        return this.getFallbackWeatherData(latitude, longitude);
      } else if (error.response?.status >= 500) {
        // Return cached data if available, otherwise use fallback
        const cachedData = this.getCachedWeatherData(cacheKey);
        if (cachedData) {
          console.warn('Weather service unavailable, returning cached data');
          return cachedData;
        }
        console.warn('Weather service unavailable, using fallback data');
        return this.getFallbackWeatherData(latitude, longitude);
      }
      throw error;
    }
  }

  async getForecast(latitude: number, longitude: number) {
    if (!OPENWEATHER_API_KEY) {
      console.warn('OpenWeatherAPI key not configured, using fallback data');
      return this.getFallbackForecastData(latitude, longitude);
    }

    const params = {
      lat: latitude.toString(),
      lon: longitude.toString(),
      appid: OPENWEATHER_API_KEY,
      units: 'imperial',
      cnt: '5' // 5 day forecast
    };
    
    const cacheKey = `${API_BASE}/forecast?${new URLSearchParams(params).toString()}`;
    
    try {
      const result = await globalCacheManager.get(
        cacheKey,
        'forecast',
        async () => {
          // Apply rate limiting
          await this.throttleRequest();
          
          const response = await axios.get(`${API_BASE}/forecast`, { 
            params,
            timeout: 10000 // 10 second timeout
          });
          return response.data;
        }
      );
      return result.data;
    } catch (error: any) {
      if (error.response?.status === 401) {
        throw new Error('Invalid OpenWeatherAPI key - please check your configuration');
      } else if (error.response?.status === 429) {
        // Return cached data if available, otherwise use fallback
        const cachedData = this.getCachedForecastData(cacheKey);
        if (cachedData) {
          console.warn('Rate limit exceeded, returning cached forecast data');
          return cachedData;
        }
        console.warn('Rate limit exceeded, using fallback forecast data');
        return this.getFallbackForecastData(latitude, longitude);
      } else if (error.response?.status >= 500) {
        // Return cached data if available, otherwise use fallback
        const cachedData = this.getCachedForecastData(cacheKey);
        if (cachedData) {
          console.warn('Weather service unavailable, returning cached forecast data');
          return cachedData;
        }
        console.warn('Weather service unavailable, using fallback forecast data');
        return this.getFallbackForecastData(latitude, longitude);
      }
      throw error;
    }
  }

  // Helper method to get cached weather data
  getCachedWeatherData(cacheKey: string) {
    // Get cached data synchronously from cacheService
    // This is used as fallback when API fails or rate limits are hit
    return cacheService.get(cacheKey, 'weather');
  }

  // Helper method to get cached forecast data
  getCachedForecastData(cacheKey: string) {
    // Get cached data synchronously from cacheService
    // This is used as fallback when API fails or rate limits are hit
    return cacheService.get(cacheKey, 'forecast');
  }

  // Fallback weather data when API is unavailable
  getFallbackWeatherData(latitude: number, longitude: number) {
    // Generate consistent fallback data based on coordinates
    const seed = Math.floor((latitude + longitude) * 1000) % 100;
    
    const conditions = ['Clear', 'Partly Cloudy', 'Cloudy', 'Overcast'];
    const condition = conditions[seed % conditions.length];
    
    const baseTemp = 65 + (seed % 30); // 65-95°F range
    
    return {
      main: {
        temp: baseTemp,
        humidity: 45 + (seed % 40), // 45-85%
        pressure: 1013 + (seed % 20) // 1013-1033 hPa
      },
      weather: [{
        description: condition,
        icon: condition === 'Clear' ? '01d' : condition === 'Partly Cloudy' ? '02d' : '04d'
      }],
      wind: {
        speed: 5 + (seed % 15) // 5-20 mph
      },
      visibility: 10000 - (seed % 2000), // 8-10 km
      dt: Math.floor(Date.now() / 1000)
    };
  }

  // Fallback forecast data when API is unavailable
  getFallbackForecastData(latitude: number, longitude: number) {
    const seed = Math.floor((latitude + longitude) * 1000) % 100;
    const list = [];
    
    for (let i = 0; i < 5; i++) {
      const daySeed = (seed + i * 7) % 100;
      const baseTemp = 65 + (daySeed % 30);
      
      list.push({
        dt: Math.floor(Date.now() / 1000) + (i * 24 * 60 * 60),
        main: {
          temp_max: baseTemp + 5,
          temp_min: baseTemp - 10
        },
        weather: [{
          icon: daySeed % 2 === 0 ? '01d' : '02d'
        }]
      });
    }
    
    return { list };
  }

  // Prefetch weather data for better UX
  async prefetchWeatherData(latitude: number, longitude: number) {
    if (!latitude || !longitude) return;
    
    const params = {
      lat: latitude.toString(),
      lon: longitude.toString(),
      appid: OPENWEATHER_API_KEY || '',
      units: 'imperial'
    };
    
    const weatherCacheKey = `${API_BASE}/weather?${new URLSearchParams(params).toString()}`;
    const forecastParams = { ...params, cnt: '5' };
    const forecastCacheKey = `${API_BASE}/forecast?${new URLSearchParams(forecastParams).toString()}`;
    
    // Prefetch both weather and forecast
    await Promise.allSettled([
      globalCacheManager.prefetch(
        weatherCacheKey,
        'weather',
        async () => {
          const response = await axios.get(`${API_BASE}/weather`, { params });
          return response.data;
        }
      ),
      globalCacheManager.prefetch(
        forecastCacheKey,
        'forecast',
        async () => {
          const response = await axios.get(`${API_BASE}/forecast`, { params: forecastParams });
          return response.data;
        }
      )
    ]);
  }
}

export default new WeatherService();
