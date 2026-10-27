import React from 'react';
import { renderToString } from 'react-dom/server';
import { fireEvent, render, screen } from '@testing-library/react';
import ParkAlertsSummary from '../ParkAlertsSummary';
import ParkSearchParamsBridge from '../ParkSearchParamsBridge';

// React inserts <!-- --> between adjacent text nodes in server HTML.
const serverHtml = (element) => renderToString(element).replace(/<!-- -->/g, '');

const mockSearch = { current: '' };
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(mockSearch.current),
}));

const alerts = [
  { id: 'a1', category: 'Park Closure', title: 'Tioga Road closed for winter' },
  { id: 'a2', category: 'Information', title: 'No overnight parking on Glacier Point Road' },
  { id: 'a3', category: 'Caution', title: 'Rockfall near Half Dome' },
  { id: 'a4', category: 'Information', title: 'Wawona campground reservations required' },
];

describe('park page server HTML', () => {
  it('server-renders the alert summary with an as-of cue and nps.gov attribution', () => {
    const html = serverHtml(
      <ParkAlertsSummary
        parkName="Yosemite National Park"
        alerts={alerts}
        asOfLabel="Oct 26, 2026"
        npsUrl="https://www.nps.gov/yose/index.htm"
        onViewAll={() => {}}
      />
    );
    expect(html).toContain('4 current NPS alerts');
    expect(html).toContain('Tioga Road closed for winter');
    expect(html).toContain('+1 more in the Alerts tab');
    expect(html).not.toContain('Wawona campground');
    expect(html).toContain('as of Oct 26, 2026');
    expect(html).toContain('href="https://www.nps.gov/yose/index.htm"');
    expect(html).toContain('nps.gov');
  });

  it('says there are no alerts rather than rendering an empty list', () => {
    const html = serverHtml(
      <ParkAlertsSummary parkName="Fort Bowie National Historic Site" alerts={[]} asOfLabel="Oct 26, 2026" />
    );
    expect(html).toContain('No current NPS alerts');
    expect(html).not.toContain('See all alerts');
  });

  it('switches the cue to live once the client refetches', () => {
    const html = serverHtml(
      <ParkAlertsSummary parkName="Zion National Park" alerts={alerts} asOfLabel="Oct 26, 2026" isLive />
    );
    expect(html).toContain('updated live from the NPS');
  });

  it('opens the alerts tab from the summary', () => {
    const onViewAll = vi.fn();
    render(<ParkAlertsSummary parkName="Zion National Park" alerts={alerts} onViewAll={onViewAll} />);
    fireEvent.click(screen.getByRole('button', { name: 'See all alerts' }));
    expect(onViewAll).toHaveBeenCalledTimes(1);
  });

  it('bridge reports the query string after mount and on change', () => {
    const onChange = vi.fn();
    mockSearch.current = 'tab=alerts&from=%2Fexplore';
    const { rerender } = render(<ParkSearchParamsBridge onChange={onChange} />);
    expect(onChange).toHaveBeenLastCalledWith('tab=alerts&from=%2Fexplore');
    mockSearch.current = 'tab=camping';
    rerender(<ParkSearchParamsBridge onChange={onChange} />);
    expect(onChange).toHaveBeenLastCalledWith('tab=camping');
  });
});
