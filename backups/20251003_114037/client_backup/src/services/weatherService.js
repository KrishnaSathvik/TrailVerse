import axios from 'axios';
import cacheService from './cacheService';

const OPENWEATHER_API_KEY = process.env.REACT_APP_OPENWEATHER_API_KEY;
const API_BASE = 'https://api.openweathermap.org/data/2.5';

class WeatherService {
  async getWeather(latitude, longitude) {
    try {
      const params = {
        lat: latitude,
        lon: longitude,
        appid: OPENWEATHER_API_KEY,
        units: 'imperial'
      };
      
      const cacheKey = cacheService.generateKey(`${API_BASE}/weather`, params, 'weather');
      
      // Check cache first
      const cachedData = cacheService.get(cacheKey, 'weather');
      if (cachedData) {
        return cachedData;
      }
      
      const response = await axios.get(`${API_BASE}/weather`, { params });
      
      // Cache the response
      cacheService.set(cacheKey, response.data, 'weather');
      
      return response.data;
    } catch (error) {
      console.error('Weather API Error:', error);
      
      // Try to return cached data as fallback
      const params = {
        lat: latitude,
        lon: longitude,
        appid: OPENWEATHER_API_KEY,
        units: 'imperial'
      };
      const cacheKey = cacheService.generateKey(`${API_BASE}/weather`, params, 'weather');
      const cachedData = cacheService.get(cacheKey, 'weather');
      
      if (cachedData) {
        return cachedData;
      }
      
      return null;
    }
  }

  async getForecast(latitude, longitude) {
    try {
      const params = {
        lat: latitude,
        lon: longitude,
        appid: OPENWEATHER_API_KEY,
        units: 'imperial',
        cnt: 5 // 5 day forecast
      };
      
      const cacheKey = cacheService.generateKey(`${API_BASE}/forecast`, params, 'forecast');
      
      // Check cache first
      const cachedData = cacheService.get(cacheKey, 'forecast');
      if (cachedData) {
        return cachedData;
      }
      
      const response = await axios.get(`${API_BASE}/forecast`, { params });
      
      // Cache the response
      cacheService.set(cacheKey, response.data, 'forecast');
      
      return response.data;
    } catch (error) {
      console.error('Forecast API Error:', error);
      
      // Try to return cached data as fallback
      const params = {
        lat: latitude,
        lon: longitude,
        appid: OPENWEATHER_API_KEY,
        units: 'imperial',
        cnt: 5
      };
      const cacheKey = cacheService.generateKey(`${API_BASE}/forecast`, params, 'forecast');
      const cachedData = cacheService.get(cacheKey, 'forecast');
      
      if (cachedData) {
        return cachedData;
      }
      
      return null;
    }
  }

  // Prefetch weather data for better UX
  async prefetchWeatherData(latitude, longitude) {
    if (!latitude || !longitude) return;
    
    try {
      await Promise.all([
        this.getWeather(latitude, longitude),
        this.getForecast(latitude, longitude)
      ]);
    } catch (error) {
      // Silent fail - prefetch is optional
    }
  }
}

export default new WeatherService();
