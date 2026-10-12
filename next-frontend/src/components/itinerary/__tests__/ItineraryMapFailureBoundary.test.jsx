import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import ItineraryMapView from '../ItineraryMapView';

afterEach(() => { cleanup(); delete window.google; vi.restoreAllMocks(); });

it('degrades to the blocked map state instead of crashing the page when the Maps runtime throws', () => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  // Simulates a torn-down map after a Maps auth failure: constructing anything throws.
  const broken = () => { throw new TypeError("Cannot read properties of undefined (reading 'getRootNode')"); };
  window.google = { maps: { Map: broken, LatLngBounds: broken, marker: { AdvancedMarkerElement: broken } } };
  const days = [{ id: 'd1', dayNumber: 1, stops: [{ id: 'a', name: 'A', latitude: 40, longitude: -110, mapped: true }] }];
  render(<div><p>Itinerary still here</p><ItineraryMapView days={days} /></div>);
  expect(screen.getByText('Itinerary still here')).toBeInTheDocument();
  expect(screen.getByTestId('itinerary-map-runtime-blocked')).toBeInTheDocument();
});
