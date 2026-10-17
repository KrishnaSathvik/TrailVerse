import { afterEach, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { TripGuidance } from '../TripWorkspaceView';

afterEach(cleanup);

it('omits guidance when there is nothing relevant', () => {
  const { container } = render(<TripGuidance plan={{ days: [] }} />);
  expect(container).toBeEmptyDOMElement();
});

it.each([
  ['Shuttle', 'https://www.nps.gov/zion/planyourvisit/zion-canyon-shuttle-system.htm'],
  ['Hotel', 'https://hotel.example/reservations'],
  ['Permit', 'https://www.recreation.gov/permits/123456'],
  ['Restaurant', 'https://restaurant.example/reserve'],
  ['Rental car', 'https://rental.example/locations/springdale'],
  ['Attraction', 'https://museum.example/tickets'],
  ['Tour', 'https://operator.example/book'],
  ['Camping', 'https://www.recreation.gov/camping/campgrounds/232447'],
])('renders %s as a clickable resource in one Things to Know section after reload', (heading, url) => {
  const plan = JSON.parse(JSON.stringify({ days: [], narrativeSections: [{ placement: 'after_plan', heading, markdown: `Check [official information](${url}). Availability is not confirmed.` }] }));
  render(<TripGuidance plan={plan} />);
  expect(screen.getAllByRole('heading', { name: 'Things to Know' })).toHaveLength(1);
  expect(screen.queryByText('Before booking')).not.toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'official information' })).toHaveAttribute('href', url);
});
