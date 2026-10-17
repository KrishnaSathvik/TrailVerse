import { render, screen, cleanup } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ItinerariesPage from '../page';
import SharedTripPage from '../../plan-ai/shared/[shareId]/page';
import { SAMPLE_ITINERARIES } from '@/data/sampleItineraries';
import { getSharedTrip } from '@/lib/sharedTrips';

vi.mock('@/data/publicItineraries', async importOriginal => ({ ...(await importOriginal()), PUBLIC_ITINERARIES: [] }));
vi.mock('@/lib/sharedTrips', () => ({ getSharedTrip: vi.fn() }));
vi.mock('@/components/common/Header', () => ({ default: () => null }));
vi.mock('@/components/common/Footer', () => ({ default: () => null }));
vi.mock('@/components/shared-trip/SharedTripPageClient', () => ({ default: () => null }));
vi.mock('next/navigation', () => ({
  redirect: (url) => { throw new Error(`redirect:${url}`); },
  notFound: () => { throw new Error('not-found'); },
}));

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe('sample itinerary destinations', () => {
  it('shows only reviewed frozen samples and does not fetch private/shared trips', async () => {
    const { container } = render(await ItinerariesPage());
    expect(getSharedTrip).not.toHaveBeenCalled();
    expect(screen.getByText('Our sample itinerary library is being prepared.')).toBeInTheDocument();
    expect(screen.queryByText('View itinerary →')).not.toBeInTheDocument();
    expect(JSON.parse(container.querySelector('script').textContent).hasPart).toEqual([]);
  });

  it('recovers old bookmarked sample URLs when their saved trip is missing', async () => {
    getSharedTrip.mockResolvedValue(null);
    const sample = SAMPLE_ITINERARIES[0];
    await expect(SharedTripPage({ params: Promise.resolve({ shareId: sample.shareId }) }))
      .rejects.toThrow(`redirect:/plan-ai?entry=new-trip&ask=${encodeURIComponent(sample.prompt)}`);
  });

  it('keeps genuinely unknown shares as 404s', async () => {
    getSharedTrip.mockResolvedValue(null);
    await expect(SharedTripPage({ params: Promise.resolve({ shareId: 'unknown' }) })).rejects.toThrow('not-found');
  });

  it('does not misrepresent backend failures as missing or revoked shares', async () => {
    getSharedTrip.mockRejectedValue(new Error('unavailable'));
    await expect(SharedTripPage({ params: Promise.resolve({ shareId: 'existing' }) })).rejects.toThrow('unavailable');
  });
});
