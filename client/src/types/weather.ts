export interface WeatherData {
  temperature: number;
  feelsLike: number;
  humidity: number;
  pressure: number;
  visibility: number;
  windSpeed: number;
  windDirection: number;
  description: string;
  icon: string;
  timestamp: number;
}

export interface ForecastData {
  date: string;
  temperature: {
    min: number;
    max: number;
  };
  description: string;
  icon: string;
  precipitation: number;
  humidity: number;
}

export interface WeatherWidgetProps {
  latitude: number;
  longitude: number;
  parkName?: string;
}

export interface ProcessedWeatherData {
  temperature: number;
  feelsLike: number;
  humidity: number;
  pressure: number;
  visibility: number;
  windSpeed: number;
  windDirection: string;
  description: string;
  icon: string;
  iconComponent: React.ComponentType<any>;
  timestamp: string;
}

export interface ProcessedForecastData {
  date: string;
  day: string;
  temperature: {
    min: number;
    max: number;
  };
  description: string;
  icon: string;
  iconComponent: React.ComponentType<any>;
  precipitation: number;
  humidity: number;
}
