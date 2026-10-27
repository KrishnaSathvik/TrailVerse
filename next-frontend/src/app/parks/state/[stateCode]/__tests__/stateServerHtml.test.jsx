import React from 'react';
import { renderToString } from 'react-dom/server';
import { render, waitFor } from '@testing-library/react';
import StateParkPageClient from '../StateParkPageClient';

const serverHtml = (element) => renderToString(element).replace(/<!-- -->/g, '');

const nav = { search: '', searchParamsCalls: 0 };
vi.mock('next/navigation', () => ({
  usePathname: () => '/parks/state/utah',
  useSearchParams: () => {
    nav.searchParamsCalls += 1;
    return new URLSearchParams(nav.search);
  },
}));

vi.mock('@/hooks/useParkRatings', () => ({ useParkRatings: () => ({ data: null }) }));
vi.mock('@/hooks/useReturnNavigation', () => ({
  useReturnNavigation: ({ defaultHref, defaultLabel }) => ({ backHref: defaultHref, backLabel: defaultLabel }),
}));

const parks = [
  { parkCode: 'zion', fullName: 'Zion National Park', states: 'UT', designation: 'National Park', description: 'Sandstone canyons.', images: [] },
  { parkCode: 'arch', fullName: 'Arches National Park', states: 'UT', designation: 'National Park', description: 'Natural stone arches.', images: [] },
];

const props = {
  stateName: 'Utah',
  parks,
  intro: 'From Zion National Park and Arches National Park, 2 National Park Service sites in Utah offer trails.',
  npsGuide: null,
};

beforeEach(() => {
  nav.search = '';
  nav.searchParamsCalls = 0;
});

describe('state hub server HTML', () => {
  it('renders the H1, intro and park links without reading search params', () => {
    const html = serverHtml(<StateParkPageClient {...props} />);
    // useSearchParams during prerender bails the page out to client rendering.
    expect(nav.searchParamsCalls).toBe(0);
    expect(html).toMatch(/<h1[^>]*>Utah<\/h1>/);
    expect(html).toContain('2 National Park Service sites in Utah offer trails');
    expect(html).toContain('All parks (2)');
    expect(html).toContain('Zion National Park');
    expect(html).toContain('href="/parks/zion-national-park?from=%2Fparks%2Fstate%2Futah"');
    expect(html).toContain('href="/parks/arches-national-park?from=%2Fparks%2Fstate%2Futah"');
  });

  it('adds the live query string to ?from= after hydration', async () => {
    nav.search = 'sort=name&from=%2Fexplore';
    const { container } = render(<StateParkPageClient {...props} />);
    await waitFor(() => {
      const link = container.querySelector('a[href^="/parks/zion-national-park"]');
      expect(link.getAttribute('href')).toBe(
        '/parks/zion-national-park?from=%2Fparks%2Fstate%2Futah%3Fsort%3Dname'
      );
    });
    expect(nav.searchParamsCalls).toBeGreaterThan(0);
  });

  it('shows the empty-state copy when a state has no parks', () => {
    const html = serverHtml(<StateParkPageClient {...props} parks={[]} />);
    expect(html).toContain('No National Park Service sites are listed for Utah right now.');
  });
});
