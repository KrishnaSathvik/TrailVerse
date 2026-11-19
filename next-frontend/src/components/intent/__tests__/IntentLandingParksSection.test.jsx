import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/intentLandingApi', () => ({ fetchIntentLandingParks: vi.fn() }));
vi.mock('@/components/intent/IntentTopMatches', () => ({ default: () => null }));

import { fetchIntentLandingParks } from '@/lib/intentLandingApi';
import IntentLandingParksSection from '../IntentLandingParksSection';

const landing = { path: '/quiet-national-parks', title: 'Quiet parks', metaDescription: 'd', searchQuery: 'quiet', updatedAt: '2026-11-01' };
const originalPhase = process.env.NEXT_PHASE;

afterEach(() => {
  process.env.NEXT_PHASE = originalPhase;
  vi.restoreAllMocks();
});

describe('IntentLandingParksSection', () => {
  it('renders the client fallback instead of failing the build when the API is down', async () => {
    process.env.NEXT_PHASE = 'phase-production-build';
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    fetchIntentLandingParks.mockRejectedValue(new Error('HTTP 502 from api'));
    const element = await IntentLandingParksSection({ landing });
    const matches = element.props.children[1];
    expect(matches.props.initialParks).toEqual([]);
  });

  it('still throws at runtime so ISR keeps the last good page', async () => {
    process.env.NEXT_PHASE = 'phase-production-server';
    fetchIntentLandingParks.mockRejectedValue(new Error('HTTP 502 from api'));
    await expect(IntentLandingParksSection({ landing })).rejects.toThrow('HTTP 502');
  });

  it('passes server-fetched parks through when the API is up', async () => {
    fetchIntentLandingParks.mockResolvedValue({ parks: [{ fullName: 'Great Basin National Park', parkCode: 'grba' }] });
    const element = await IntentLandingParksSection({ landing });
    expect(element.props.children[1].props.initialParks).toHaveLength(1);
  });
});
