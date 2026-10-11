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

it('leaves guest signup to the single conversation card without another gate', () => {
  render(<TrailieTripCard plan={plan} locked onOpen={vi.fn()} />);
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(screen.queryByText('Viewpoint')).not.toBeInTheDocument();
});
it('opens one canonical trip workspace', () => {
  const onOpen = vi.fn();
  render(<TrailieTripCard plan={plan} onOpen={onOpen} />);
  expect(screen.getByText('Trip created')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Open trip' }));
  expect(onOpen).toHaveBeenCalledWith('itinerary');
  expect(screen.getAllByRole('button')).toHaveLength(1);
});
it('summarizes only changed days without reducing the full trip day count', () => {
  render(<TrailieTripCard plan={{ parkName: 'Park', days: [{dayNumber:1,label:'Forest',stops:[]},{dayNumber:2,label:'Rest',stops:[{name:'Lake'}]}] }} refinement={{isRefinement:true,changedDayNumbers:[2]}} onOpen={vi.fn()} />);
  expect(screen.getByText('Trip updated')).toBeInTheDocument();
  expect(screen.getByText('2 days')).toBeInTheDocument();
  expect(screen.queryByText('Forest')).not.toBeInTheDocument();
  expect(screen.getByText('Lake')).toBeInTheDocument();
});
it('does not offer a map without grounded pins and restricts post-login destinations', () => {
  render(<TrailieTripCard plan={{ days: [{ stops: [{ name: 'Unknown place' }] }] }} locked />);
  expect(screen.queryByRole('button', { name: 'View map' })).not.toBeInTheDocument();
  expect(tripSurfacePath('abc', 'map')).toBe('/plan-ai/abc/map');
  expect(tripSurfacePath('abc', 'itinerary')).toBe('/plan-ai/abc/plan');
  expect(tripSurfacePath('abc', 'https://example.com')).toBe('/plan-ai/abc?chat=true');
});
