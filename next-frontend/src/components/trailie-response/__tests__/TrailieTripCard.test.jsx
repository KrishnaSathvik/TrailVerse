import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import TrailieTripCard from '../TrailieTripCard';
import { tripSurfacePath } from '@/lib/tripSurfacePath';

const plan = { parkName: 'Zion', days: [{ stops: [{ name: 'Viewpoint', type: 'viewpoint', latitude: 37, longitude: -112, coordinateSource: 'trailverse_catalog' }] }] };
beforeEach(() => {
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value: function () { this.setAttribute('open', ''); } });
  Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value: function () { this.removeAttribute('open'); } });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

it.each(['itinerary', 'map'])('gates guest %s access and preserves the clicked destination', surface => {
  const onOpen = vi.fn();
  render(<TrailieTripCard plan={plan} locked onOpen={onOpen} />);
  expect(screen.queryByText('Viewpoint')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: `View ${surface}` }));
  expect(onOpen).not.toHaveBeenCalled();
  expect(screen.getByRole('dialog', { name: 'Your trip is ready' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: `Sign in to view ${surface}` }));
  expect(onOpen).toHaveBeenCalledWith(surface);
});
it.each(['itinerary', 'map'])('opens account %s access directly', surface => {
  const onOpen = vi.fn();
  render(<TrailieTripCard plan={plan} onOpen={onOpen} />);
  fireEvent.click(screen.getByRole('button', { name: `View ${surface}` }));
  expect(onOpen).toHaveBeenCalledWith(surface);
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});
it('does not offer a map without grounded pins and restricts post-login destinations', () => {
  render(<TrailieTripCard plan={{ days: [{ stops: [{ name: 'Unknown place' }] }] }} locked />);
  expect(screen.queryByRole('button', { name: 'View map' })).not.toBeInTheDocument();
  expect(tripSurfacePath('abc', 'map')).toBe('/plan-ai/abc/map');
  expect(tripSurfacePath('abc', 'itinerary')).toBe('/plan-ai/abc/plan');
  expect(tripSurfacePath('abc', 'https://example.com')).toBe('/plan-ai/abc?chat=true');
});
