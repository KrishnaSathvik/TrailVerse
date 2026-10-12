import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import TripWorkspaceView from '../TripWorkspaceView';
vi.mock('../ItineraryMapView', () => ({ default: props => <div data-testid={props.preview ? 'map-preview' : 'map'} data-path={props.pathMode} data-day={props.activeDayId} />, DAY_COLORS: ['green'], ITINERARY_MAP_PATH_MODE: { NONE: 'none' } }));
afterEach(cleanup);
const plan = { parkName: 'Example Park', days: [{ id: 'd1', dayNumber: 1, label: 'Forest', stops: [{id:'a', name:'Forest trail', type:'trail', latitude:40, longitude:-110, coordinateSource:'stored'}] }] };
it('loads no map on Overview or Day and retains one canonical day selection for the Map tab', () => {
 const onViewChange = vi.fn();
 render(<TripWorkspaceView plan={plan} onViewChange={onViewChange} />);
 expect(screen.queryByTestId('map')).not.toBeInTheDocument();
 expect(screen.queryByTestId('map-preview')).not.toBeInTheDocument();
 expect(screen.getByRole('heading', { name: 'Example Park' })).toBeInTheDocument();
 fireEvent.click(screen.getByRole('tab', {name:'Day 1', exact:true}));
 expect(screen.queryByTestId('map')).not.toBeInTheDocument();
 expect(screen.queryByTestId('map-preview')).not.toBeInTheDocument();
 fireEvent.click(screen.getByRole('tab',{name:'Map', exact:true}));
 expect(onViewChange).toHaveBeenCalledWith('map','d1');
});
it('map view uses canonical abstract transfers with All and individual days', () => {
 render(<TripWorkspaceView plan={plan} view="map" />);
 expect(screen.getByTestId('map')).toHaveAttribute('data-path','abstract-edges');
 expect(screen.getByTestId('map')).toHaveAttribute('data-day','all');
 fireEvent.click(screen.getByRole('button',{name:'Day 1',exact:true}));
 expect(screen.getByTestId('map')).toHaveAttribute('data-day','d1');
 expect(screen.queryByLabelText('Trip itinerary')).not.toBeInTheDocument();
});
