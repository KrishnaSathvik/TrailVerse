import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import TripWorkspaceView from '../TripWorkspaceView';

vi.mock('../ItineraryMapView', () => ({
  DAY_COLORS: ['green', 'blue'],
  default: ({ days, onMarkerClick }) => <div>{days.flatMap(day => day.stops.map(stop => <button key={`${day.id}-${stop.id}`} onClick={() => onMarkerClick(stop.id, day.id)}>Select {stop.name}</button>))}</div>,
}));
vi.mock('@/components/trailie-response/TrailieItinerary', () => ({ default: () => null }));
afterEach(cleanup);
const pin = (id, mapped = true) => ({ id, name: id, type: 'viewpoint', ...(mapped ? { latitude: 40, longitude: -110, coordinateSource: 'trailverse_catalog' } : {}) });
const plan = { parkName: 'Example park', days: [
  { id: 'one', dayNumber: 1, stops: [pin('A'), pin('B', false)], travelEdges: [] },
  { id: 'two', dayNumber: 2, stops: [pin('C'), pin('D')], travelEdges: [{ sourceStopId: 'C', targetStopId: 'D', relationship: 'transfer', status: 'unverified' }] },
] };
it('keeps All quiet and scopes missing locations to their selected day', () => {
  render(<TripWorkspaceView plan={plan} view="map" />);
  expect(screen.getByText('Day 1 · 1 stop')).toBeInTheDocument();
  expect(screen.getByText('Day 2 · 2 stops')).toBeInTheDocument();
  expect(screen.queryByText(/not shown on map/)).not.toBeInTheDocument();
  expect(screen.queryByText('Travel time unavailable')).not.toBeInTheDocument();
  expect(screen.getByText('Dashed lines connect itinerary stops.')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Day 1', exact: true }));
  expect(screen.getByText('1 stop not shown on map')).toBeInTheDocument();
  expect(screen.queryByText(/Dashed lines/)).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Day 2', exact: true }));
  expect(screen.queryByText(/not shown on map/)).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Select D' }));
  expect(screen.getByLabelText('Transfer to this stop')).toHaveTextContent('Travel time unavailable');
});
it('shows access uncertainty only with the selected road transfer', () => {
  const roadPlan = structuredClone(plan);
  Object.assign(roadPlan.days[1].travelEdges[0], { status: 'verified', travelMode: 'driving', durationSeconds: 8940, source: { evidenceId: 'route', provider: 'google_maps' } });
  render(<TripWorkspaceView plan={roadPlan} view="map" />);
  expect(screen.queryByText(/Access mode depends/)).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Select D' }));
  expect(screen.getByLabelText('Transfer to this stop')).toHaveTextContent('2 hr 29 min by road');
  expect(screen.getAllByText('Access mode depends on travel dates.')).toHaveLength(1);
  fireEvent.click(screen.getByRole('button', { name: 'Select C' }));
  expect(screen.queryByLabelText('Transfer to this stop')).not.toBeInTheDocument();
});

it('public mode suppresses private actions and editors even when callers provide them', () => {
  render(<TripWorkspaceView plan={plan} publicMode actions={<button>Delete trip</button>} editor={<button>Add stop</button>} />);
  expect(screen.getByText('Sample itinerary')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Delete trip' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Add stop' })).not.toBeInTheDocument();
  expect(screen.getByRole('tab', { name: 'Map' })).toBeInTheDocument();
});
