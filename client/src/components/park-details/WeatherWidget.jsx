import React, { useState, useEffect } from 'react';
import { Cloud, CloudRain, Sun, Wind, Droplets, Eye, Loader2, Snowflake } from '@components/icons';
import weatherService from '../../services/weatherService.ts';
import { logWeatherWidgetUsage } from '../../utils/analytics';

const WeatherWidget = ({ latitude, longitude, parkName: _parkName }) => {
  const [weatherData, setWeatherData] = useState(null);
  const [forecastData, setForecastData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Weather data state
  // const [weatherError, setWeatherError] = useState(null); // Removed unused state

  useEffect(() => {
    const fetchWeatherData = async () => {
      if (!latitude || !longitude) {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);

        // Fetch current weather and forecast in parallel
        const [currentWeather, forecast] = await Promise.all([
          weatherService.getWeather(latitude, longitude),
          weatherService.getForecast(latitude, longitude)
        ]);

        setWeatherData(currentWeather);
        setForecastData(forecast);
        
        // Log successful weather widget usage
        logWeatherWidgetUsage(_parkName || 'unknown', true);
      } catch (err) {
        console.error('Error fetching weather data:', err);
        
        // eslint-disable-next-line no-unused-vars
        let _errorType = 'unknown';
        if (err.message?.includes('rate limit')) {
          setError('Weather data temporarily unavailable due to high usage. Please try again later.');
          _errorType = 'rate_limit';
        } else if (err.message?.includes('API key')) {
          setError('Weather service configuration issue. Please contact support.');
          // eslint-disable-next-line no-unused-vars
          const _errorType = 'api_key';
        } else {
          setError('Unable to load weather data. Please try again later.');
          // eslint-disable-next-line no-unused-vars
          const _errorType = 'general';
        }
        
        // Log weather widget error
        logWeatherWidgetUsage(_parkName || 'unknown', false, null);
      } finally {
        setLoading(false);
      }
    };

    fetchWeatherData();
  }, [latitude, longitude]);

  // Process weather data for display
  const getDisplayWeather = () => {
    if (loading || error || !weatherData) {
      return null;
    }

    const current = weatherData;
    const forecast = forecastData;

    return {
      current: {
        temp: Math.round(current.main?.temp || 72),
        condition: current.weather?.[0]?.description || 'Partly Cloudy',
        humidity: current.main?.humidity || 65,
        windSpeed: Math.round(current.wind?.speed || 8),
        visibility: Math.round((current.visibility || 10000) / 1609.34) // Convert meters to miles
      },
      forecast: forecast?.list ? groupForecastByDay(forecast.list) : []
    };
  };

  // Group forecast data by day to avoid duplicate day names
  const groupForecastByDay = (forecastList) => {
    const dailyForecast = {};
    
    // Group forecast entries by day
    forecastList.forEach((item) => {
      const date = new Date(item.dt * 1000);
      const dayKey = date.toDateString();
      
      if (!dailyForecast[dayKey]) {
        dailyForecast[dayKey] = {
          day: date.toLocaleDateString('en-US', { weekday: 'short' }),
          temps: [],
          icons: []
        };
      }
      
      dailyForecast[dayKey].temps.push(item.main?.temp || 70);
      dailyForecast[dayKey].icons.push(item.weather?.[0]?.icon || '02d');
    });
    
    // Convert to array and calculate high/low temps for each day
    return Object.values(dailyForecast)
      .slice(0, 5) // Limit to 5 days
      .map(day => ({
        day: day.day,
        high: Math.round(Math.max(...day.temps)),
        low: Math.round(Math.min(...day.temps)),
        icon: getWeatherIconFromCode(day.icons[Math.floor(day.icons.length / 2)]) // Use middle forecast icon
      }));
  };

  // Helper function to convert Fahrenheit to Celsius
  const fahrenheitToCelsius = (fahrenheit) => {
    return Math.round((fahrenheit - 32) * 5/9);
  };

  const getWeatherIconFromCode = (iconCode) => {
    if (!iconCode) return 'cloud';
    
    // Clear sky
    if (iconCode.includes('01')) return 'sun';
    
    // Cloudy conditions
    if (iconCode.includes('02') || iconCode.includes('03') || iconCode.includes('04')) return 'cloud';
    
    // Rain conditions
    if (iconCode.includes('09') || iconCode.includes('10') || iconCode.includes('11')) return 'rain';
    
    // Snow conditions
    if (iconCode.includes('13')) return 'snow';
    
    // Fog/mist conditions
    if (iconCode.includes('50')) return 'cloud';
    
    return 'cloud';
  };

  const getWeatherIcon = (icon) => {
    switch (icon) {
      case 'sun': return Sun;
      case 'cloud': return Cloud;
      case 'rain': return CloudRain;
      case 'snow': return Snowflake;
      default: return Cloud;
    }
  };

  const displayWeather = getDisplayWeather();

  return (
    <div className="rounded-2xl p-6 backdrop-blur"
      style={{
        backgroundColor: 'var(--surface)',
        borderWidth: '1px',
        borderColor: 'var(--border)'
      }}
    >
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-xl font-bold"
          style={{ color: 'var(--text-primary)' }}
        >
          Weather Forecast
        </h3>
        {loading && (
          <Loader2 className="h-5 w-5 animate-spin" style={{ color: 'var(--text-secondary)' }} />
        )}
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200">
          <p className="text-sm text-red-600">{error}</p>
          <p className="text-xs text-red-500 mt-1">
            {error.includes('key') ? 'Please configure your OpenWeatherAPI key' : 'Weather data unavailable'}
          </p>
        </div>
      )}

      {!displayWeather && !loading && !error && (
        <div className="mb-4 p-3 rounded-lg bg-gray-50 border border-gray-200">
          <p className="text-sm text-gray-600">Weather data not available</p>
        </div>
      )}

      {/* Current Weather */}
      {displayWeather && (
        <div className="mb-6 p-4 rounded-xl"
          style={{
            backgroundColor: 'var(--surface-hover)',
            borderWidth: '1px',
            borderColor: 'var(--border)'
          }}
        >
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-sm mb-1" style={{ color: 'var(--text-secondary)' }}>
              Current
            </p>
            <div className="text-4xl font-bold"
              style={{ color: 'var(--text-primary)' }}
            >
              {displayWeather.current.temp}°F
              <span className="text-lg font-normal ml-2" style={{ color: 'var(--text-tertiary)' }}>
                ({fahrenheitToCelsius(displayWeather.current.temp)}°C)
              </span>
            </div>
            <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
              {displayWeather.current.condition}
            </p>
          </div>
          <Cloud className="h-16 w-16 text-blue-400" />
        </div>

        <div className="grid grid-cols-3 gap-3 text-xs">
          <div className="flex items-center gap-1"
            style={{ color: 'var(--text-secondary)' }}
          >
            <Droplets className="h-3 w-3" />
            <span>{displayWeather.current.humidity}%</span>
          </div>
          <div className="flex items-center gap-1"
            style={{ color: 'var(--text-secondary)' }}
          >
            <Wind className="h-3 w-3" />
            <span>{displayWeather.current.windSpeed} mph</span>
          </div>
          <div className="flex items-center gap-1"
            style={{ color: 'var(--text-secondary)' }}
          >
            <Eye className="h-3 w-3" />
            <span>{displayWeather.current.visibility} mi</span>
          </div>
        </div>
        </div>
      )}

      {/* 5-Day Forecast */}
      {displayWeather && (
        <div className="space-y-2">
          {displayWeather.forecast.map((day, _index) => {
          const Icon = getWeatherIcon(day.icon);
          return (
            <div
              key={_index}
              className="flex items-center justify-between p-3 rounded-lg hover:bg-white/5 transition"
            >
              <span className="text-sm font-medium w-12"
                style={{ color: 'var(--text-secondary)' }}
              >
                {day.day}
              </span>
              <Icon className="h-5 w-5 text-blue-400" />
              <div className="flex items-center gap-2 text-sm">
                <span className="font-semibold"
                  style={{ color: 'var(--text-primary)' }}
                >
                  {day.high}°F
                </span>
                <span style={{ color: 'var(--text-tertiary)' }}>
                  {day.low}°F
                </span>
                <span className="text-xs ml-1" style={{ color: 'var(--text-tertiary)' }}>
                  ({fahrenheitToCelsius(day.high)}°/{fahrenheitToCelsius(day.low)}°C)
                </span>
              </div>
            </div>
          );
          })}
        </div>
      )}
    </div>
  );
};

export default WeatherWidget;
