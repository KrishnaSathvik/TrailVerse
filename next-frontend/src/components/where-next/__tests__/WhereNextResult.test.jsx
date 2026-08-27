import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import WhereNextResult from '../WhereNextResult';
import {
  containsForbiddenCoverageCopy,
  exploreParkHref,
  returningStep,
  sanitizeWhereNextAnalytics,
  trailieHref,
} from '@/lib/whereNext';

vi.mock('next/link', () => ({
  default: ({ children, href, ...props }) => <a href={href} {...props}>{children}</a>,
}));

describe('Where Next result (AE1, AE2, AE3, AE6)', () => {
  it('Banff has no coverage copy and no Explore/Trailie (AE1)', () => {
    const { container } = render(
      <WhereNextResult
        pick={{
          displayName: 'Banff',
          rawInput: 'Banff',
          parkCode: null,
          canonicalName: null,
          travelWindow: 'summer_2027',
        }}
        stats={{ volumeTier: 'early', destinationCount: 0, leaders: [] }}
      />
    );
    expect(containsForbiddenCoverageCopy(container.textContent)).toBe(false);
    expect(screen.queryByRole('link', { name: /explore/i })).toBeNull();
    expect(screen.queryByRole('link', { name: /trailie/i })).toBeNull();
    expect(screen.getByText(/your destination is counted/i)).toBeTruthy();
  });

  it('Glacier NPS pick links to park page and Trailie (AE2)', () => {
    render(
      <WhereNextResult
        pick={{
          displayName: 'Glacier National Park',
          canonicalName: 'Glacier National Park',
          parkCode: 'glac',
          travelWindow: null,
        }}
        stats={{ volumeTier: 'early', destinationCount: 37, leaders: [] }}
      />
    );
    const explore = screen.getByRole('link', { name: /explore/i });
    const trailie = screen.getByRole('link', { name: /trailie/i });
    expect(explore.getAttribute('href')).toBe(exploreParkHref('Glacier National Park'));
    expect(explore.getAttribute('href')).toBe('/parks/glacier-national-park');
    expect(trailie.getAttribute('href')).toBe(trailieHref('glac', 'Glacier National Park'));
    expect(trailie.getAttribute('href')).toContain('park=glac');
    expect(trailie.getAttribute('href')).toContain('Glacier');
  });

  it('does not show a numbered leaderboard at 12 votes (AE3)', () => {
    render(
      <WhereNextResult
        pick={{ displayName: 'Yosemite National Park', canonicalName: 'Yosemite National Park', parkCode: 'yose' }}
        stats={{ volumeTier: 'early', totalActive: 12, destinationCount: 3, leaders: [] }}
      />
    );
    expect(screen.queryByRole('list')).toBeNull();
    expect(screen.getByText(/help shape the first TrailVerse travel list/i)).toBeTruthy();
  });

  it('Vermont unmatched has no state-hub explore (AE6)', () => {
    render(
      <WhereNextResult
        pick={{ displayName: 'Vermont', rawInput: 'Vermont', parkCode: null }}
        stats={{ volumeTier: 'early', leaders: [] }}
      />
    );
    expect(screen.queryByRole('link', { name: /explore/i })).toBeNull();
    expect(screen.queryByRole('link', { href: /\/parks\/state\// })).toBeNull();
  });

  it('Tokyo unmatched is counted with no coverage copy or CTAs', () => {
    const { container } = render(
      <WhereNextResult
        pick={{
          displayName: 'Tokyo',
          rawInput: 'Tokyo',
          parkCode: null,
          canonicalName: null,
        }}
        stats={{ volumeTier: 'early', destinationCount: 0, leaders: [] }}
      />
    );
    expect(containsForbiddenCoverageCopy(container.textContent)).toBe(false);
    expect(screen.queryByRole('link', { name: /explore/i })).toBeNull();
    expect(screen.queryByRole('link', { name: /trailie/i })).toBeNull();
    expect(screen.getByText(/your destination is counted/i)).toBeTruthy();
  });
});

describe('returningStep', () => {
  it('asks optional When? when a saved pick has no travel window', () => {
    expect(returningStep({ displayName: 'Banff', parkCode: null, travelWindow: null })).toBe('when');
    expect(returningStep({ displayName: 'Glacier National Park', parkCode: 'glac' })).toBe('when');
  });

  it('opens result when a travel window was already chosen', () => {
    expect(returningStep({
      displayName: 'Glacier National Park',
      parkCode: 'glac',
      travelWindow: 'summer_2027',
    })).toBe('result');
    expect(returningStep({
      displayName: 'Banff',
      travelWindow: 'someday',
    })).toBe('result');
  });

  it('stays on search when there is no active pick', () => {
    expect(returningStep(null)).toBe('search');
  });
});

describe('sanitizeWhereNextAnalytics', () => {
  it('strips raw free text keys', () => {
    const safe = sanitizeWhereNextAnalytics({
      parkCode: 'glac',
      rawInput: 'Banff',
      query: 'japan',
      destination: 'Italy',
      matched: false,
    });
    expect(safe).toEqual({ parkCode: 'glac', matched: false });
  });
});
