import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import WeatherWidget from '../park-details/WeatherWidget';
import weatherService from '../../services/weatherService';
import React from 'react';

// Mock the weather service
vi.mock('../../services/weatherService', () => ({
  default: {
    getParkWeather: vi.fn(),
  },
}));

// Mock @components/icons
vi.mock('@components/icons', () => ({
  Cloud: () => <div data-testid="cloud-icon">Cloud</div>,
  CloudRain: () => <div data-testid="cloudrain-icon">CloudRain</div>,
  Sun: () => <div data-testid="sun-icon">Sun</div>,
  Wind: () => <div data-testid="wind-icon">Wind</div>,
  Droplets: () => <div data-testid="droplets-icon">Droplets</div>,
  Eye: () => <div data-testid="eye-icon">Eye</div>,
  Loader2: () => <div data-testid="loader-icon">Loader</div>,
  Snowflake: () => <div data-testid="snowflake-icon">Snowflake</div>,
}));

describe('WeatherWidget', () => {
  const mockWeatherData = {
    main: {
      temp: 77,
      humidity: 60,
    },
    weather: [{ description: 'Clear sky', icon: '01d' }],
    visibility: 10000,
    wind: { speed: 5 },
  };

  const mockForecastData = {
    list: [
      {
        dt: 1704153600,
        main: { temp: 82 },
        weather: [{ icon: '01d' }],
      },
      {
        dt: 1704164400,
        main: { temp: 68 },
        weather: [{ icon: '01d' }],
      },
    ],
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders loading state initially', () => {
    render(<WeatherWidget parkCode="acad" latitude={40.7128} longitude={-74.0060} />);
    expect(screen.getByLabelText('Loading')).toBeInTheDocument();
  });

  it('renders weather data when loaded successfully', async () => {
    weatherService.getParkWeather.mockResolvedValue({ current: mockWeatherData, forecast: mockForecastData });

    render(<WeatherWidget parkCode="acad" latitude={40.7128} longitude={-74.0060} />);

    await waitFor(() => {
      expect(screen.getByText((_, element) => element?.textContent === '77°F(25°C)')).toBeInTheDocument();
      expect(screen.getByText('Clear sky')).toBeInTheDocument();
    });
  });

  it('handles rate limit errors gracefully', async () => {
    const rateLimitError = new Error('rate limit exceeded');
    weatherService.getParkWeather.mockRejectedValue(rateLimitError);

    render(<WeatherWidget parkCode="acad" latitude={40.7128} longitude={-74.0060} />);

    await waitFor(() => {
      expect(screen.getByText(/Weather data temporarily unavailable due to high usage/)).toBeInTheDocument();
    });
  });

  it('handles API key errors', async () => {
    const apiKeyError = new Error('API key invalid');
    weatherService.getParkWeather.mockRejectedValue(apiKeyError);

    render(<WeatherWidget parkCode="acad" latitude={40.7128} longitude={-74.0060} />);

    await waitFor(() => {
      expect(screen.getByText(/Weather service configuration issue/)).toBeInTheDocument();
    });
  });

  it('handles general errors', async () => {
    const generalError = new Error('Network error');
    weatherService.getParkWeather.mockRejectedValue(generalError);

    render(<WeatherWidget parkCode="acad" latitude={40.7128} longitude={-74.0060} />);

    await waitFor(() => {
      expect(screen.getByText(/Unable to load weather data/)).toBeInTheDocument();
    });
  });

  it('does not fetch weather data when coordinates are missing', async () => {
    render(<WeatherWidget latitude={null} longitude={null} />);

    await waitFor(() => {
      expect(weatherService.getParkWeather).not.toHaveBeenCalled();
    });
  });

  it('displays forecast data correctly', async () => {
    weatherService.getParkWeather.mockResolvedValue({ current: mockWeatherData, forecast: mockForecastData });

    render(<WeatherWidget parkCode="acad" latitude={40.7128} longitude={-74.0060} />);

    await waitFor(() => {
      expect(screen.getByText('Mon')).toBeInTheDocument();
      expect(screen.getByText((_, element) => element?.textContent === '82°F')).toBeInTheDocument();
      expect(screen.getByText((_, element) => element?.textContent === '68°F')).toBeInTheDocument();
    });
  });
});
