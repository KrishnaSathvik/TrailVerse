import { beforeEach, describe, expect, it, vi } from 'vitest';
import weatherService from '../weatherService';
import enhancedParkService from '../enhancedParkService';
vi.mock('../enhancedParkService', () => ({ default: { getParkWeather: vi.fn() } }));
describe('weather backend boundary', () => {
  beforeEach(() => vi.clearAllMocks());
  it('uses the canonical park wrapper and preserves display payload', async () => {
    const widget = { current: { main: { temp: 77 } }, forecast: { list: [] } };
    enhancedParkService.getParkWeather.mockResolvedValue({ widget });
    expect(await weatherService.getParkWeather('acad')).toEqual(widget);
    expect(enhancedParkService.getParkWeather).toHaveBeenCalledWith('acad');
  });
  it('rejects arbitrary coordinates/URLs before dispatch', async () => {
    await expect(weatherService.getParkWeather('../other')).rejects.toThrow('Invalid park code');
    expect(enhancedParkService.getParkWeather).not.toHaveBeenCalled();
  });
  it('does not substitute fabricated conditions for unavailable weather', async () => {
    enhancedParkService.getParkWeather.mockResolvedValue({ current: {} });
    await expect(weatherService.getParkWeather('acad')).rejects.toThrow('unavailable');
  });
  it('prefetches by park code and contains failures', async () => {
    enhancedParkService.getParkWeather.mockRejectedValue(new Error('offline'));
    await expect(weatherService.prefetchWeatherData('acad')).resolves.toBeUndefined();
    expect(enhancedParkService.getParkWeather).toHaveBeenCalledWith('acad');
  });
});
