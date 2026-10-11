import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import TripWorkspaceView from '../TripWorkspaceView';
vi.mock('../ItineraryMapView', () => ({ default: props => <div data-testid="map" data-path={props.pathMode} data-day={props.activeDayId} />, DAY_COLORS: ['green'] }));
afterEach(cleanup);
const plan = { parkName: 'Example Park', days: [{ id: 'd1', dayNumber: 1, label: 'Forest', stops: [{id:'a', name:'Forest trail', type:'trail', latitude:40, longitude:-110, coordinateSource:'stored'}] }] };
it('starts temporal-first without a map and retains one canonical day selection', () => {
 const onViewChange = vi.fn();
 render(<TripWorkspaceView plan={plan} onViewChange={onViewChange} />);
 expect(screen.queryByTestId('map')).not.toBeInTheDocument();
 expect(screen.getByRole('heading', { name: 'Example Park' })).toBeInTheDocument();
 fireEvent.click(screen.getByRole('button', {name:'Day 1', exact:true}));
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
