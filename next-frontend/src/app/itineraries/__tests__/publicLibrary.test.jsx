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
  it('uses public workspace mode, shows the exact public question without a personalization form', () => {
    const before = JSON.stringify(sample);
    render(<PublicItinerary sample={sample} />);
    expect(screen.getByTestId('workspace')).toHaveAttribute('data-public', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Open map' }));
    expect(screen.getByTestId('workspace')).toHaveTextContent('map');
    expect(screen.getByRole('navigation', { name: 'Breadcrumb' })).toHaveTextContent('Sample itineraries');
    expect(screen.getByText(`“${sample.prompt}”`)).toBeInTheDocument();
    expect(screen.getByText('What we asked Trailie')).toBeVisible();
    expect(screen.getByText('What we asked Trailie').closest('details')).toBeNull();
    expect(screen.queryByRole('region', { name: 'Make this trip yours' })).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Browse more sample/ })).toHaveAttribute('href', '/itineraries');
    expect(JSON.stringify(sample)).toBe(before);
  });
  it('keeps the captured answer available without replacing the itinerary', () => {
    render(<PublicItinerary sample={{ ...sample, response: 'Arrival travel is outside these two days.', plan: { ...sample.plan, generatedAt: '2026-10-15T12:00:00Z' } }} />);
    const answer = screen.getByText('Trailie’s original answer').closest('details');
    expect(answer).not.toHaveAttribute('open');
    expect(answer).toHaveTextContent('Arrival travel is outside these two days.');
    expect(answer).toHaveTextContent('Recorded October 15, 2026.');
    expect(screen.getByTestId('workspace')).toBeInTheDocument();
  });
  it('returns 404 for unpublished samples without querying account APIs', async () => {
    await expect(ItineraryPage({ params: Promise.resolve({ slug: 'unpublished' }) })).rejects.toThrow('not-found');
  });
});
