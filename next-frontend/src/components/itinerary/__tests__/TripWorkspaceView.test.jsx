import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import TripWorkspaceView from '../TripWorkspaceView';

vi.mock('../ItineraryMapView', () => ({
  DAY_COLORS: ['green', 'blue'],
  ITINERARY_MAP_PATH_MODE: { NONE: 'none' },
  default: ({ days, onMarkerClick, preview }) => preview ? <div>Map preview</div> : <div>{days.flatMap(day => day.stops.map(stop => <button key={`${day.id}-${stop.id}`} onClick={() => onMarkerClick(stop.id, day.id)}>Select {stop.name}</button>))}</div>,
}));
vi.mock('@/components/trailie-response/TrailieItinerary', () => ({ default: ({ plan }) => <div data-testid="itinerary">{plan.days.map(d => `Day ${d.dayNumber}`).join(',')}</div> }));
afterEach(cleanup);
const pin = (id, mapped = true) => ({ id, name: id, type: 'viewpoint', ...(mapped ? { latitude: 40, longitude: -110, coordinateSource: 'trailverse_catalog' } : {}) });
const plan = { parkName: 'Example park', intro: 'Two easy days.', narrativeSections: [{ heading: 'Before booking', markdown: 'Reserve lodging early.' }], days: [
  { id: 'one', dayNumber: 1, label: 'Arrival walk', overnightLocation: 'Town', stops: [pin('A'), pin('B', false)], travelEdges: [],
    dayStructure: { type: 'sightseeing', summary: 's', startPeriod: 'morning', endPeriod: 'evening', blocks: [{ kind: 'experience', periods: ['afternoon'], label: 'Free time', note: 'n', stopIds: [] }] } },
  { id: 'two', dayNumber: 2, label: 'Canyon day', stops: [pin('C'), pin('D')], travelEdges: [{ sourceStopId: 'C', targetStopId: 'D', relationship: 'transfer', status: 'unverified' }] },
] };

it('opens on Overview with the trip story, day list, map preview and trip-level guidance', () => {
  render(<TripWorkspaceView plan={plan} />);
  expect(screen.getByRole('tab', { name: 'Overview' })).toHaveAttribute('aria-selected', 'true');
  expect(screen.queryByRole('tab', { name: 'All' })).not.toBeInTheDocument();
  expect(screen.getByText('Two easy days.')).toBeInTheDocument();
  expect(within(screen.getByLabelText('Trip days')).getByText('Canyon day')).toBeInTheDocument();
  // Cost contract: no Google Map instance on Overview; only an affordance to open the Map tab.
  expect(screen.queryByText('Map preview')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /^Select / })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Open the map for Example park' })).toBeInTheDocument();
  expect(screen.getByText('3 places on the map')).toBeInTheDocument();
  expect(screen.queryByText(/in the itinerary only/)).not.toBeInTheDocument();
  // Trip-level notes live in the single Things to Know panel, not a second heading.
  expect(screen.getByRole('heading', { name: 'Things to Know' })).toBeInTheDocument();
  expect(screen.queryByText('Before booking')).not.toBeInTheDocument();
  expect(screen.getByText('Reserve lodging early.')).toBeInTheDocument();
  expect(screen.queryByTestId('itinerary')).not.toBeInTheDocument();
});

it('shows exactly one day at a time and walks between days', () => {
  render(<TripWorkspaceView plan={plan} />);
  fireEvent.click(screen.getByText('Canyon day'));
  expect(screen.getByTestId('itinerary')).toHaveTextContent('Day 2');
  expect(screen.getByRole('tab', { name: 'Day 2' })).toHaveAttribute('aria-selected', 'true');
  fireEvent.click(screen.getByRole('button', { name: '← Day 1' }));
  expect(screen.getByTestId('itinerary')).toHaveTextContent(/^Day 1$/);
});

it('scopes missing locations to the selected map day and never invents transfer copy', () => {
  render(<TripWorkspaceView plan={plan} view="map" />);
  expect(screen.getByText('Day 1 · 1 place')).toBeInTheDocument();
  expect(screen.getByText('Day 2 · 2 places')).toBeInTheDocument();
  expect(screen.queryByText(/not shown on map/)).not.toBeInTheDocument();
  expect(screen.getByText(/1 flexible experience stays in the day plan/)).toBeInTheDocument();
  const days = screen.getByRole('group', { name: 'Map days' });
  fireEvent.click(within(days).getByRole('button', { name: 'Day 1' }));
  expect(screen.getByText('1 place not shown on map')).toBeInTheDocument();
  fireEvent.click(within(days).getByRole('button', { name: 'Day 2' }));
  expect(screen.queryByText(/not shown on map/)).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Select D' }));
  expect(screen.queryByLabelText('Transfer to this stop')).not.toBeInTheDocument();
});

it('labels a verified road transfer on the selected stop only', () => {
  const roadPlan = structuredClone(plan);
  Object.assign(roadPlan.days[1].travelEdges[0], { status: 'verified', travelMode: 'driving', durationSeconds: 8940, source: { evidenceId: 'route', provider: 'google_maps' } });
  render(<TripWorkspaceView plan={roadPlan} view="map" />);
  fireEvent.click(screen.getByRole('button', { name: 'Select D' }));
  expect(screen.getByLabelText('Transfer to this stop')).toHaveTextContent('2 hr 29 min by road');
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

it('lists grounded park rules once under Things to know with their sources', () => {
  render(<TripWorkspaceView plan={{ ...plan, tripGuidance: [{ text: 'Check park access.', source: 'https://www.nps.gov/' }] }} />);
  const section = screen.getByRole('region', { name: 'Things to know' });
  expect(within(section).getByText(/Check park access\./)).toBeInTheDocument();
  expect(within(section).getByRole('link', { name: 'Source' })).toHaveAttribute('href', 'https://www.nps.gov/');
});

it('sample reading mode retains assumptions and guidance without changing the saved plan', () => {
  const before = JSON.stringify(plan);
  render(<TripWorkspaceView plan={plan} publicMode sampleReadingMode />);
  expect(screen.getByRole('region', { name: 'Overview', exact: true })).toBeVisible();
  expect(screen.queryByLabelText('Trip at a glance')).not.toBeInTheDocument();
  expect(screen.getByText('Seasonal access, reservations and conditions change; confirm them for your dates.')).toBeVisible();
  expect(screen.getByText('Two easy days.')).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Before you go' })).toBeInTheDocument();
  expect(screen.getByText('Reserve lodging early.')).toBeVisible();
  expect(screen.getByText('Reserve lodging early.').closest('details')).toBeNull();
  expect(screen.getByText('sightseeing day')).toBeInTheDocument();
  fireEvent.click(screen.getByText('Canyon day'));
  expect(screen.getByTestId('itinerary')).toHaveTextContent('Day 2');
  expect(JSON.stringify(plan)).toBe(before);
});


it('keeps owner controls available with the clean overview and no At a glance card', () => {
  render(<TripWorkspaceView plan={plan} sampleReadingMode actions={<button>Export PDF</button>} editor={<button>Edit trip</button>} />);
  expect(screen.queryByLabelText('Trip at a glance')).not.toBeInTheDocument();
  expect(screen.getByRole('region', { name: 'Overview', exact: true })).toBeVisible();
  expect(screen.getByRole('button', { name: 'Export PDF' })).toBeVisible();
  expect(screen.getByRole('button', { name: 'Edit trip' })).toBeVisible();
  fireEvent.click(screen.getByRole('tab', { name: 'Day 1', exact: true }));
  expect(screen.getByTestId('itinerary')).toHaveTextContent('Day 1');
  expect(screen.getByRole('button', { name: 'Edit trip' })).toBeVisible();
});
