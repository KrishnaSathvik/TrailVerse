import React from 'react';
import { Cloud, CloudRain, Sun, Wind, Droplets, Eye } from 'lucide-react';

const WeatherWidget = ({ weather }) => {
  const mockWeather = weather || {
    current: {
      temp: 72,
      condition: 'Partly Cloudy',
      humidity: 65,
      windSpeed: 8,
      visibility: 10
    },
    forecast: [
      { day: 'Mon', high: 75, low: 55, icon: 'sun' },
      { day: 'Tue', high: 78, low: 58, icon: 'sun' },
      { day: 'Wed', high: 70, low: 52, icon: 'cloud' },
      { day: 'Thu', high: 68, low: 50, icon: 'rain' },
      { day: 'Fri', high: 72, low: 54, icon: 'cloud' }
    ]
  };

  const getWeatherIcon = (icon) => {
    switch (icon) {
      case 'sun': return Sun;
      case 'cloud': return Cloud;
      case 'rain': return CloudRain;
      default: return Cloud;
    }
  };

  return (
    <div className="rounded-2xl p-6 backdrop-blur"
      style={{
        backgroundColor: 'var(--surface)',
        borderWidth: '1px',
        borderColor: 'var(--border)'
      }}
    >
      <h3 className="text-xl font-bold mb-6"
        style={{ color: 'var(--text-primary)' }}
      >
        Weather Forecast
      </h3>

      {/* Current Weather */}
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
              {mockWeather.current.temp}°F
            </div>
            <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
              {mockWeather.current.condition}
            </p>
          </div>
          <Cloud className="h-16 w-16 text-blue-400" />
        </div>

        <div className="grid grid-cols-3 gap-3 text-xs">
          <div className="flex items-center gap-1"
            style={{ color: 'var(--text-secondary)' }}
          >
            <Droplets className="h-3 w-3" />
            <span>{mockWeather.current.humidity}%</span>
          </div>
          <div className="flex items-center gap-1"
            style={{ color: 'var(--text-secondary)' }}
          >
            <Wind className="h-3 w-3" />
            <span>{mockWeather.current.windSpeed} mph</span>
          </div>
          <div className="flex items-center gap-1"
            style={{ color: 'var(--text-secondary)' }}
          >
            <Eye className="h-3 w-3" />
            <span>{mockWeather.current.visibility} mi</span>
          </div>
        </div>
      </div>

      {/* 5-Day Forecast */}
      <div className="space-y-2">
        {mockWeather.forecast.map((day, index) => {
          const Icon = getWeatherIcon(day.icon);
          return (
            <div
              key={index}
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
                  {day.high}°
                </span>
                <span style={{ color: 'var(--text-tertiary)' }}>
                  {day.low}°
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default WeatherWidget;
