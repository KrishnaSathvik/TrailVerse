import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import TrailieItinerary from '@/components/trailie-response/TrailieItinerary';
import { installGoogleMapsMock, uninstallGoogleMapsMock } from '@/test-utils/googleMapsMock';

const PLAN = {
  parkName: 'Zion National Park',
  days: [{
    dayNumber: 1,
    label: 'Day 1 · Canyon floor',
    stops: [{
      name: 'Pa’rus Trail',
      timeWindow: 'Late afternoon',
      duration: 90,
      note: 'A relaxed river walk.',
      evidenceStatus: 'official_guidance',
    }],
  }],
};

describe('TrailieItinerary', () => {
  afterEach(() => {
    cleanup();
    uninstallGoogleMapsMock();
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('uses one quiet timeline surface with the daypart above each activity and no evidence jargon', () => {
    render(<TrailieItinerary plan={PLAN} />);
    const itinerary = screen.getByLabelText('Trip itinerary');
    expect(itinerary).not.toHaveClass('rounded-2xl', 'border');

    const stop = screen.getByText('Pa’rus Trail').closest('li');
    expect(stop.firstElementChild).toHaveAttribute('aria-hidden', 'true');
    const daypart = within(stop).getByText('Late afternoon');
    expect(within(stop).getByText(/1 hr 30 min/)).toBeInTheDocument();
    expect(daypart.compareDocumentPosition(screen.getByText('Pa’rus Trail')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.queryByText('Official guidance')).not.toBeInTheDocument();
  });

  it('keeps practical guidance visible and only adds textually distinct why copy', () => {
    const plan = {
      parkName: 'Zion National Park',
      days: [{
        dayNumber: 1,
        stops: [
          {
            name: 'Zion Lodge area',
            note: 'Refill water and use the restrooms before the afternoon walk.',
            why: 'A useful support stop near the next trail.',
          },
          {
            name: 'Pa’rus Trail',
            note: 'Use the paved river path for sunset.',
            why: '  Use the paved river path for sunset! ',
          },
        ],
      }],
    };

    render(<TrailieItinerary plan={plan} />);
    expect(screen.getByText('Refill water and use the restrooms before the afternoon walk.')).toBeInTheDocument();
    expect(screen.getByText('A useful support stop near the next trail.')).toBeInTheDocument();
    expect(screen.getAllByText(/Use the paved river path for sunset/)).toHaveLength(1);
  });

  it.each([[25, '25 min by road'], [149, '2 hr 29 min by road']])('renders a verified %i-minute itinerary transfer as %s', (minutes, label) => {
    const plan = {
      parkName: 'Big Bend National Park',
      days: [{
        dayNumber: 1,
        stops: [
          { id: 'a', name: 'Panther Junction', duration: 30 },
          { id: 'b', name: 'Lost Mine Trail', duration: 180, drivingTimeFromPreviousMin: 25 },
          { name: 'Window View', duration: 45, drivingTimeFromPreviousMin: null },
        ],
        travelEdges: [{ sourceStopId: 'a', targetStopId: 'b', relationship: 'transfer', status: 'verified', travelMode: 'driving', durationSeconds: minutes * 60, source: { evidenceId: 'route', provider: 'google_maps' } }],
      }],
    };

    render(<TrailieItinerary plan={plan} />);
    expect(screen.getByText(label)).toHaveAttribute('data-drive-transition', 'true');
    expect(screen.queryByText('0 min drive')).not.toBeInTheDocument();
  });

  it('shows a day overnight base once without deleting a lodging stop', () => {
    const plan = {
      parkName: 'Olympic National Park',
      days: [{
        dayNumber: 1,
        overnightLocation: 'Port Angeles',
        stops: [{ name: 'Check in at Lake Crescent Lodge', type: 'lodging', note: 'Front desk closes at 9 PM.' }],
      }],
    };

    render(<TrailieItinerary plan={plan} />);
    expect(screen.getByText('Stay')).toBeInTheDocument();
    expect(screen.getByText('Port Angeles')).toBeInTheDocument();
    expect(screen.getByText('Check in at Lake Crescent Lodge')).toBeInTheDocument();
    expect(screen.getByText('Check in at Lake Crescent Lodge').closest('li')).toHaveAttribute('data-stop-treatment', 'supporting');
  });

  it('demotes only explicit supporting types and keeps ordinary experiences standard', () => {
    const plan = {
      parkName: 'Yellowstone National Park',
      days: [{
        dayNumber: 1,
        stops: [
          { name: 'Old Faithful', type: 'geothermal' },
          { name: 'Lunch at Canyon Village', type: 'restaurant' },
          { name: 'Recovery break', type: 'rest' },
          { name: 'Drive to Mammoth', type: 'transit' },
        ],
      }],
    };

    render(<TrailieItinerary plan={plan} />);
    expect(screen.getByText('Old Faithful').closest('li')).toHaveAttribute('data-stop-treatment', 'experience');
    for (const name of ['Lunch at Canyon Village', 'Recovery break', 'Drive to Mammoth']) {
      expect(screen.getByText(name).closest('li')).toHaveAttribute('data-stop-treatment', 'supporting');
    }
    expect(screen.getByText('Lunch at Canyon Village').closest('li').firstElementChild).toHaveTextContent('2');
  });

  it('renders duplicate canonical stop IDs once each without a duplicate-key warning', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const plan = {
      parkName: 'Olympic National Park',
      days: [{
        dayNumber: 2,
        stops: [
          { id: 'day-1-stop-2', name: 'Beach Access Trail' },
          { id: 'day-1-stop-2', name: 'Beach Overlook' },
        ],
      }],
    };

    render(<TrailieItinerary plan={plan} />);

    expect(screen.getAllByText('Beach Access Trail')).toHaveLength(1);
    expect(screen.getAllByText('Beach Overlook')).toHaveLength(1);
    expect(screen.getByText('Beach Access Trail').closest('li').firstElementChild).toHaveTextContent('1');
    expect(screen.getByText('Beach Overlook').closest('li').firstElementChild).toHaveTextContent('2');
    expect(consoleError.mock.calls.flat().join(' ')).not.toMatch(/same key|unique.*key/i);
  });

  it('reads canonical physicalDifficulty and exposureLevel fields as secondary metadata', () => {
    const plan = {
      parkName: 'Glacier National Park',
      days: [{
        dayNumber: 1,
        stops: [{
          name: 'Highline Trail',
          timeWindow: 'Early morning',
          duration: 240,
          physicalDifficulty: 'strenuous',
          exposureLevel: 'high',
        }],
      }],
    };

    render(<TrailieItinerary plan={plan} />);
    expect(screen.getByText('Early morning')).toBeInTheDocument();
    expect(screen.getByText(/4 hr.*strenuous.*high exposure/i)).toBeInTheDocument();
  });

  it('renders nothing extra for an ordinary stop with no requirements (Badlands acceptance case)', () => {
    render(<TrailieItinerary plan={PLAN} />);
    expect(screen.queryByText('Permit required')).not.toBeInTheDocument();
    expect(screen.queryByText('Vehicle restriction')).not.toBeInTheDocument();
  });

  // P1-6 — shape matches server/src/utils/travelerRequirementsContract.js
  // `attachTravelerRequirements` output verbatim (see that module's real-data
  // test, travelerRequirementsContract.test.js) — permit case.
  const PLAN_WITH_STOP_REQUIREMENT = {
    parkName: 'Redwood National and State Parks',
    days: [{
      dayNumber: 1,
      stops: [{
        name: 'Hike to the Tall Trees Grove',
        timeWindow: 'Morning',
        duration: 240,
        note: 'The trip’s backcountry centerpiece.',
        requirements: [{
          id: 'stop|1|permit|Hike to the Tall Trees Grove',
          kind: 'permit',
          category: 'action_required',
          severity: 'required',
          scope: 'stop',
          title: 'Permit required',
          requirement: 'A free reservation is required. These are only issued online.',
        }],
      }],
    }],
  };

  it('renders a quiet callout on the exact stop that carries a permit requirement', () => {
    render(<TrailieItinerary plan={PLAN_WITH_STOP_REQUIREMENT} />);
    expect(screen.getByText('Permit required')).toBeInTheDocument();
    expect(screen.getByText(/free reservation is required/i)).toBeInTheDocument();
  });

  it('renders a day-scoped callout once, not repeated per stop, when a requirement covers the whole day', () => {
    const plan = {
      parkName: 'Test Park',
      days: [{
        dayNumber: 1,
        stops: [{ name: 'Stop A', duration: 60 }, { name: 'Stop B', duration: 60 }],
        requirements: [{
          id: 'day|1|seasonal_access|shared',
          kind: 'seasonal_access',
          category: 'condition_check',
          severity: 'check',
          scope: 'day',
          title: 'Seasonal access',
          requirement: 'This district closes seasonally; confirm the road is open before you go.',
        }],
      }],
    };
    render(<TrailieItinerary plan={plan} />);
    expect(screen.getByText('Good to know')).toBeInTheDocument();
    expect(screen.getAllByText('Seasonal access')).toHaveLength(1);
  });

  // Map affordances — see itineraryMapStops.js and TripMapSheet.jsx.
  describe('trip map affordances', () => {
    it('numbers stops per day, matching the order pins would use on the map', () => {
      const plan = {
        parkName: 'Test Park',
        days: [{
          dayNumber: 1,
          stops: [{ name: 'Stop A', duration: 60 }, { name: 'Stop B', duration: 60 }],
        }],
      };
      render(<TrailieItinerary plan={plan} />);
      const stopA = screen.getByText('Stop A').closest('li');
      const stopB = screen.getByText('Stop B').closest('li');
      expect(stopA.firstElementChild).toHaveTextContent('1');
      expect(stopB.firstElementChild).toHaveTextContent('2');
    });

    it('does not offer a trip map when no stop has canonical coordinates (no fabricated pins)', () => {
      render(<TrailieItinerary plan={PLAN} />);
      expect(screen.queryByRole('button', { name: 'View trip map' })).not.toBeInTheDocument();
    });

    it('offers a trip map, and a per-stop map-focus icon, only for stops with canonical coordinates', () => {
      const plan = {
        parkName: 'Badlands National Park',
        days: [{
          dayNumber: 1,
          stops: [
            { name: 'Notch Trail', type: 'trail', latitude: 43.75, longitude: -101.94, coordinateSource: 'resolved_metadata' },
            { name: 'Lunch break', type: 'meal' },
          ],
        }],
      };
      render(<TrailieItinerary plan={plan} />);
      expect(screen.getByRole('button', { name: 'View trip map' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Show Notch Trail on the trip map/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Show Notch Trail on the trip map/i })).toHaveClass('h-11', 'w-11');
      expect(screen.getByRole('button', { name: 'View Day 1 on the trip map' })).toHaveClass('h-11', 'w-11');
      expect(screen.queryByRole('button', { name: /Show Lunch break on the trip map/i })).not.toBeInTheDocument();
    });

    it('keeps trip and stop map controls in keyboard reading order', () => {
      const plan = {
        parkName: 'Badlands National Park',
        days: [{
          dayNumber: 1,
          stops: [{ name: 'Notch Trail', type: 'trail', latitude: 43.75, longitude: -101.94, coordinateSource: 'resolved_metadata' }],
        }],
      };
      render(<TrailieItinerary plan={plan} />);

      userEvent.tab();
      expect(screen.getByRole('button', { name: 'View trip map' })).toHaveFocus();
      userEvent.tab();
      expect(screen.getByRole('button', { name: 'View Day 1 on the trip map' })).toHaveFocus();
      userEvent.tab();
      expect(screen.getByRole('button', { name: /Show Notch Trail on the trip map/i })).toHaveFocus();
    });

    it('uses canonical day identity in the heading and map label for a filtered subset', () => {
      const plan = {
        parkName: 'Olympic National Park',
        days: [{
          dayNumber: 2,
          label: 'Day 2 · An easy coast day',
          stops: [{ name: 'Beach Access Trail', latitude: 47.61, longitude: -124.37, coordinateSource: 'resolved_metadata' }],
        }],
      };

      render(<TrailieItinerary plan={plan} />);

      expect(screen.getByText('Day 2')).toBeInTheDocument();
      expect(screen.queryByText('Day 1')).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'View Day 2 on the trip map' })).toBeInTheDocument();
    });

    it('degrades gracefully for a partial-coordinate plan without crashing', () => {
      const plan = {
        parkName: 'Glacier National Park',
        days: [
          {
            dayNumber: 1,
            stops: [
              { name: 'Hidden Lake Overlook', type: 'trail', latitude: 48.7, longitude: -113.7, coordinateSource: 'resolved_metadata' },
              { name: 'Logan Pass area', type: 'landmark' }, // mappable but missing coordinates
            ],
          },
          {
            dayNumber: 2,
            stops: [{ name: 'Avalanche Lake Trail', type: 'trail' }], // no coordinates at all this day
          },
        ],
      };
      expect(() => render(<TrailieItinerary plan={plan} />)).not.toThrow();
      // Day 1 has one mapped stop, so the map affordance still appears.
      expect(screen.getByRole('button', { name: 'View trip map' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Show Hidden Lake Overlook on the trip map/i })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /Show Logan Pass area on the trip map/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /Show Avalanche Lake Trail on the trip map/i })).not.toBeInTheDocument();
    });

    it('opens the trip map in abstract-edges mode with zero Directions calls', async () => {
      vi.stubEnv('NEXT_PUBLIC_GMAPS_MAP_ID', 'test-map-id');
      const maps = installGoogleMapsMock();
      vi.spyOn(globalThis, 'fetch').mockImplementation(() => {
        throw new Error('network is forbidden in itinerary map tests');
      });
      const plan = {
        parkName: 'Zion National Park',
        days: [{
          id: 'zion-day-1',
          dayNumber: 1,
          travelEdges: [{
            sourceStopId: 'canyon-overlook',
            targetStopId: 'parus-trail',
            relationship: 'transfer',
            modeIntent: 'drive',
          }],
          stops: [
            {
              id: 'canyon-overlook',
              name: 'Canyon Overlook',
              type: 'viewpoint',
              latitude: 37.2132,
              longitude: -112.9401,
              coordinateSource: 'trailverse_catalog',
            },
            {
              id: 'parus-trail',
              name: "Pa'rus Trail",
              type: 'trail',
              latitude: 37.2002,
              longitude: -112.9869,
              coordinateSource: 'trailverse_catalog',
              drivingTimeFromPreviousMin: null,
            },
          ],
        }],
      };

      render(<TrailieItinerary plan={plan} />);
      await userEvent.click(screen.getByRole('button', { name: 'View trip map' }));

      await waitFor(() => {
        expect(maps.polylineCalls).toHaveLength(1);
      });
      expect(maps.directionsInstances).toHaveLength(0);
      expect(maps.geocoderInstances).toHaveLength(0);
      expect(maps.placesAutocompleteInstances).toHaveLength(0);
      expect(maps.edgeLabels()).toHaveLength(0);
      expect(globalThis.fetch).not.toHaveBeenCalled();
    });
  });
});
