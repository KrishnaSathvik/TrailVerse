import enhancedParkService from './enhancedParkService';

// Credentials and provider requests belong to the existing park weather boundary.
class WeatherService {
  async getParkWeather(parkCode: string) {
    if (!/^[a-z]{4}$/.test(parkCode || '')) throw new Error('Invalid park code');
    const data = await enhancedParkService.getParkWeather(parkCode);
    if (!data?.widget) throw new Error('Weather data unavailable');
    return data.widget;
  }

  async prefetchWeatherData(parkCode: string) {
    // Prefetch is best effort; an unavailable provider must not break navigation.
    await Promise.allSettled([this.getParkWeather(parkCode)]);
  }
}

export default new WeatherService();
