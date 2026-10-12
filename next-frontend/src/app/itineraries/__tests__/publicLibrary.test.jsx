import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ItineraryCatalog from '../ItineraryCatalog';
import PublicItinerary from '../[slug]/PublicItinerary';
import ItineraryPage from '../[slug]/page';

vi.mock('@/components/common/Header', () => ({ default: () => null }));
vi.mock('@/components/common/Footer', () => ({ default: () => null }));
vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('not-found'); } }));
vi.mock('@/components/itinerary/TripWorkspaceView', () => ({ default: ({ publicMode, view, onViewChange, lead }) => <div data-testid="workspace" data-public={publicMode}>{lead}{view}<button onClick={() => onViewChange('map')}>Open map</button></div> }));
afterEach(cleanup);
const sample = { slug: 'test-trip', title: 'Example park', description: 'A relaxed trip.', prompt: 'Plan a relaxed park trip.', tags: ['Weekend', 'Fall'], images: [], plan: { days: [{ dayNumber: 1, label: 'Coast', stops: [] }, { dayNumber: 2, label: 'Mountains', stops: [] }], tripGuidance: [{ text: 'Check park access.', source: 'https://www.nps.gov/' }] } };

describe('public itinerary library', () => {
  it('separates the frozen itinerary link from a new personalized conversation', () => {
    render(<ItineraryCatalog samples={[sample]} />);
    expect(screen.getByRole('link', { name: 'View itinerary →' })).toHaveAttribute('href', '/itineraries/test-trip');
    const href = screen.getByRole('link', { name: 'Plan a similar trip' }).getAttribute('href');
    const url = new URL(href, 'https://example.com');
    expect(url.searchParams.get('entry')).toBe('new-trip');
    expect(url.searchParams.get('ask')).toContain(sample.prompt);
    expect(url.searchParams.has('tripId')).toBe(false);
  });
  it('filters without turning unavailable results into fake itinerary links', () => {
    render(<ItineraryCatalog samples={[sample]} />);
    fireEvent.click(screen.getByRole('button', { name: '7+ days' }));
    expect(screen.queryByRole('link', { name: 'View itinerary →' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Fall' }));
    expect(screen.getByRole('link', { name: 'View itinerary →' })).toBeInTheDocument();
  });
  it('uses public workspace mode, shows the exact public question, and starts a version from it', () => {
    const before = JSON.stringify(sample);
    render(<PublicItinerary sample={sample} />);
    expect(screen.getByTestId('workspace')).toHaveAttribute('data-public', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Open map' }));
    expect(screen.getByTestId('workspace')).toHaveTextContent('map');
    expect(screen.getByRole('navigation', { name: 'Breadcrumb' })).toHaveTextContent('Sample itineraries');
    expect(screen.getByText(`“${sample.prompt}”`)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Plan my version/ })).toBeDisabled();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Family' }));
    const ask = new URL(screen.getByRole('link', { name: /Plan my version/ }).getAttribute('href'), 'https://example.com').searchParams.get('ask');
    expect(ask).toBe('Plan a 2-day Example park trip for a family with kids, similar to this sample. The sample I’m looking at: Day 1: Coast; Day 2: Mountains.');
    expect(JSON.stringify(sample)).toBe(before);
  });
  it('returns 404 for unpublished samples without querying account APIs', async () => {
    await expect(ItineraryPage({ params: Promise.resolve({ slug: 'unpublished' }) })).rejects.toThrow('not-found');
  });
});
