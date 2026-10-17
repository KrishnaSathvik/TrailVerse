import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import TravelLogisticsSections from '@/components/plan-ai/TravelLogisticsSections';

const PROVENANCE = {
  evidenceStatus: 'verified',
  observedAt: null,
  sourceUpdatedAt: null,
  officialUrl: null,
  livePrice: false,
  liveAvailability: false,
};

const YELLOWSTONE_LOGISTICS = {
  schemaVersion: 1,
  inventoryMode: 'planning',
  transport: {
    mode: 'fly',
    departure: {
      city: 'St. Louis',
      airportCode: 'STL',
      status: 'available',
    },
    airportsStatus: 'available',
    airports: [
      {
        airportCode: 'JAC',
        entityId: 'airport:JAC',
        name: 'Jackson Hole Airport',
        groundTransfer: {
          durationMinutes: 100,
          distanceMeters: 145000,
          distanceMiles: 90.1,
          destinationLabel: 'Yellowstone National Park',
          evidenceStatus: 'verified',
        },
        evidenceStatus: 'verified',
        provenance: {
          ...PROVENANCE,
          sourceType: 'google_maps',
          sourceName: 'Google Maps',
        },
      },
      {
        airportCode: 'BZN',
        entityId: 'airport:BZN',
        name: 'Bozeman Yellowstone International Airport',
        groundTransfer: {
          durationMinutes: 115,
          distanceMeters: 225308,
          distanceMiles: 140,
          destinationLabel: 'Yellowstone National Park',
          evidenceStatus: 'verified',
        },
        evidenceStatus: 'verified',
        provenance: {
          ...PROVENANCE,
          sourceType: 'google_maps',
          sourceName: 'Google Maps',
        },
      },
    ],
    routeLegsStatus: 'available',
    routeLegs: [
      {
        legId: 'leg:yellowstone',
        originEntityId: 'airport:BZN',
        destinationEntityId: 'nps:park:yell',
        originLabel: 'Bozeman Yellowstone International Airport',
        destinationLabel: 'Yellowstone National Park',
        durationMinutes: 310,
        distanceMeters: 257495,
        distanceMiles: 160,
        evidenceStatus: 'verified',
        feasibility: {
          exceedsDailyDriveCap: true,
          maxDailyDriveMinutes: 240,
          driveDurationMinutes: 310,
        },
        provenance: {
          ...PROVENANCE,
          sourceType: 'google_maps',
          sourceName: 'Google Maps',
        },
      },
    ],
    driveCap: {
      maxDailyDriveMinutes: 240,
      status: 'available',
    },
  },
  stays: {
    accommodationClass: 'lodging',
    stayPreference: 'lodge',
    insidePark: {
      status: 'verified',
      properties: [
        {
          propertyId: 'yell:old-faithful-inn',
          parkCode: 'yell',
          placeId: null,
          name: 'Old Faithful Inn',
          propertyType: 'lodge',
          locationClass: 'inside_park',
          rating: null,
          address: null,
          officialUrl: 'https://www.yellowstonenationalparklodges.com/lodgings/hotel/old-faithful-inn/',
          reservationUrl: null,
          mapsUrl: null,
          amenitiesSummary: null,
          rvSuitable: null,
          evidenceStatus: 'verified',
          provenance: {
            ...PROVENANCE,
            sourceType: 'curated_catalog',
            sourceName: 'Yellowstone National Park Lodges',
          },
        },
      ],
    },
    gateway: {
      status: 'available',
      areaLabel: 'West Yellowstone, MT',
      properties: [
        {
          propertyId: 'google-place:p1',
          parkCode: null,
          placeId: 'p1',
          name: 'Gateway Inn',
          propertyType: 'hotel',
          locationClass: 'gateway',
          rating: 4.4,
          address: 'West Yellowstone, MT',
          officialUrl: null,
          reservationUrl: null,
          mapsUrl: null,
          amenitiesSummary: null,
          rvSuitable: null,
          evidenceStatus: 'verified',
          nightlyRate: '$250',
          provenance: {
            ...PROVENANCE,
            sourceType: 'google_places',
            sourceName: 'Google Places',
          },
        },
      ],
    },
    campgrounds: {
      status: 'available',
      properties: [
        {
          propertyId: 'nps-campground:madison',
          parkCode: 'yell',
          placeId: null,
          name: 'Madison Campground',
          propertyType: 'campground',
          locationClass: 'unknown',
          rating: null,
          address: null,
          officialUrl: null,
          reservationUrl: null,
          mapsUrl: null,
          amenitiesSummary: null,
          rvSuitable: true,
          evidenceStatus: 'verified',
          provenance: {
            ...PROVENANCE,
            sourceType: 'nps',
            sourceName: 'National Park Service',
          },
        },
      ],
    },
    vacationRentalHint: {
      status: 'available',
      areas: ['West Yellowstone, MT'],
      externalSearchHint: 'Search vacation rentals near West Yellowstone, MT. TrailVerse does not list specific properties or prices.',
    },
  },
};

describe('TravelLogisticsSections', () => {
  it('renders Yellowstone fly and stay logistics in separate labeled regions without prices', () => {
    const { container } = render(<TravelLogisticsSections logistics={YELLOWSTONE_LOGISTICS} />);

    const gettingThere = screen.getByRole('region', { name: 'Getting there' });
    expect(within(gettingThere).getByText('JAC')).toBeInTheDocument();
    expect(within(gettingThere).getByText('BZN')).toBeInTheDocument();

    const insidePark = screen.getByRole('region', { name: 'Inside park' });
    expect(within(insidePark).getByText('Old Faithful Inn')).toBeInTheDocument();
    expect(within(insidePark).queryByText('Gateway Inn')).not.toBeInTheDocument();

    const gateway = screen.getByRole('region', { name: 'Gateway' });
    expect(within(gateway).getByText('Gateway Inn')).toBeInTheDocument();
    expect(within(gateway).queryByText('Old Faithful Inn')).not.toBeInTheDocument();

    expect(container.textContent).not.toContain('$');
    expect(screen.queryByText(/available now|rooms available/i)).not.toBeInTheDocument();
  });

  it('shows route metrics, the daily-drive warning, and source trust cues', () => {
    render(<TravelLogisticsSections logistics={YELLOWSTONE_LOGISTICS} />);

    const ground = screen.getByRole('region', { name: 'Ground logistics' });
    expect(within(ground).getByText(/160 miles/i)).toBeInTheDocument();
    expect(within(ground).getByText(/5 hr 10 min/i)).toBeInTheDocument();
    expect(within(ground).getByText(/exceeds your 4 hr daily drive limit/i)).toBeInTheDocument();
    expect(screen.getAllByText('Maps').length).toBeGreaterThan(0);
    expect(screen.getByText('Official')).toBeInTheDocument();
    expect(screen.getByText('Google Places')).toBeInTheDocument();
    expect(screen.getByText('NPS')).toBeInTheDocument();
  });

  it('renders honest provider and verification states but omits not-requested sections', () => {
    render(
      <TravelLogisticsSections
        logistics={{
          schemaVersion: 1,
          transport: {
            airportsStatus: 'provider_unavailable',
            airports: [],
            routeLegsStatus: 'not_requested',
            routeLegs: [],
          },
          stays: {
            insidePark: { status: 'not_verified', properties: [] },
            gateway: { status: 'not_requested', properties: [] },
            campgrounds: { status: 'not_requested', properties: [] },
            vacationRentalHint: null,
          },
        }}
      />
    );

    expect(screen.getByText(/airport information is temporarily unavailable/i)).toBeInTheDocument();
    expect(screen.getByText(/inside-park lodging has not been verified/i)).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Ground logistics' })).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Gateway' })).not.toBeInTheDocument();
  });

  it('renders nothing when every logistics slice was not requested', () => {
    const { container } = render(
      <TravelLogisticsSections
        logistics={{
          schemaVersion: 1,
          transport: {
            airportsStatus: 'not_requested',
            airports: [],
            routeLegsStatus: 'not_requested',
            routeLegs: [],
          },
          stays: {
            insidePark: { status: 'not_requested', properties: [] },
            gateway: { status: 'not_requested', properties: [] },
            campgrounds: { status: 'not_requested', properties: [] },
            vacationRentalHint: null,
          },
        }}
      />
    );

    expect(container).toBeEmptyDOMElement();
  });

  it('fails closed when planning data contains live-commercial claims', () => {
    const unsafe = structuredClone(YELLOWSTONE_LOGISTICS);
    unsafe.stays.insidePark.properties[0].price = '$999';
    const { container } = render(<TravelLogisticsSections logistics={unsafe} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('places supported evidence status beside the relevant row', () => {
    const logistics = structuredClone(YELLOWSTONE_LOGISTICS);
    logistics.transport.routeLegs[0].evidenceStatus = 'estimated';
    render(<TravelLogisticsSections logistics={logistics} />);
    expect(within(screen.getByRole('region', { name: 'Ground logistics' })).getByText('Estimated'))
      .toBeInTheDocument();
  });
});
