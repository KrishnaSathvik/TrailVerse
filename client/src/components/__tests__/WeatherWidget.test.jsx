import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import WeatherWidget from '../park-details/WeatherWidget';
import weatherService from '../../services/weatherService';

// Mock the weather service
vi.mock('../../services/weatherService', () => ({
  default: {
    getWeather: vi.fn(),
    getForecast: vi.fn(),
  },
}));

// Mock lucide-react icons
vi.mock('lucide-react', () => ({
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
    temperature: 25,
    feelsLike: 27,
    humidity: 60,
    pressure: 1013,
    visibility: 10000,
    windSpeed: 5,
    windDirection: 180,
    description: 'Clear sky',
    icon: '01d',
    timestamp: Date.now(),
  };

  const mockForecastData = [
    {
      date: '2024-01-02',
      temperature: { min: 20, max: 28 },
      description: 'Partly cloudy',
      icon: '02d',
      precipitation: 0,
      humidity: 55,
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders loading state initially', () => {
    render(<WeatherWidget latitude={40.7128} longitude={-74.0060} />);
    expect(screen.getByTestId('loader-icon')).toBeInTheDocument();
  });

  it('renders weather data when loaded successfully', async () => {
    weatherService.getWeather.mockResolvedValue(mockWeatherData);
    weatherService.getForecast.mockResolvedValue(mockForecastData);

    render(<WeatherWidget latitude={40.7128} longitude={-74.0060} />);

    await waitFor(() => {
      expect(screen.getByText('25°C')).toBeInTheDocument();
      expect(screen.getByText('Clear sky')).toBeInTheDocument();
      expect(screen.getByText('Feels like 27°C')).toBeInTheDocument();
    });
  });

  it('handles rate limit errors gracefully', async () => {
    const rateLimitError = new Error('rate limit exceeded');
    weatherService.getWeather.mockRejectedValue(rateLimitError);
    weatherService.getForecast.mockRejectedValue(rateLimitError);

    render(<WeatherWidget latitude={40.7128} longitude={-74.0060} />);

    await waitFor(() => {
      expect(screen.getByText(/Weather data temporarily unavailable due to high usage/)).toBeInTheDocument();
    });
  });

  it('handles API key errors', async () => {
    const apiKeyError = new Error('API key invalid');
    weatherService.getWeather.mockRejectedValue(apiKeyError);
    weatherService.getForecast.mockRejectedValue(apiKeyError);

    render(<WeatherWidget latitude={40.7128} longitude={-74.0060} />);

    await waitFor(() => {
      expect(screen.getByText(/Weather service configuration issue/)).toBeInTheDocument();
    });
  });

  it('handles general errors', async () => {
    const generalError = new Error('Network error');
    weatherService.getWeather.mockRejectedValue(generalError);
    weatherService.getForecast.mockRejectedValue(generalError);

    render(<WeatherWidget latitude={40.7128} longitude={-74.0060} />);

    await waitFor(() => {
      expect(screen.getByText(/Unable to load weather data/)).toBeInTheDocument();
    });
  });

  it('does not fetch weather data when coordinates are missing', async () => {
    render(<WeatherWidget latitude={null} longitude={null} />);

    await waitFor(() => {
      expect(weatherService.getWeather).not.toHaveBeenCalled();
      expect(weatherService.getForecast).not.toHaveBeenCalled();
    });
  });

  it('displays forecast data correctly', async () => {
    weatherService.getWeather.mockResolvedValue(mockWeatherData);
    weatherService.getForecast.mockResolvedValue(mockForecastData);

    render(<WeatherWidget latitude={40.7128} longitude={-74.0060} />);

    await waitFor(() => {
      expect(screen.getByText('Wed')).toBeInTheDocument(); // Day of week
      expect(screen.getByText('20° / 28°')).toBeInTheDocument(); // Temperature range
    });
  });
});
