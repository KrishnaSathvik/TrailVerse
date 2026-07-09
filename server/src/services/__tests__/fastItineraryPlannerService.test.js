jest.mock('../npsService', () => ({}));
jest.mock('../enhancedParkService', () => ({}));
jest.mock('../trailieLiteLlm', () => ({ trailieLiteComplete: jest.fn() }));

const {
  normalizePlanRequest,
  validatePlanRequest,
  buildDeterministicItinerary,
  applyRevision,
  filterCandidateStops,
} = require('../fastItineraryPlannerService');

describe('fastItineraryPlannerService', () => {
  const shenRequest = {
    parkCode: 'shen',
    parkName: 'Shenandoah National Park',
    startDate: '2026-10-15',
    travelMonth: null,
    numberOfDays: 3,
    adults: 2,
    children: 0,
    interests: ['photography', 'wildlife', 'scenic-drives'],
    maxHikeMiles: 3,
    difficulty: ['easy', 'moderate'],
    lodgingArea: 'Luray, Virginia',
    sunrise: true,
    sunset: true,
    relaxedAfternoon: true,
    revisionRequest: null,
    messages: [],
    priorItinerary: null,
  };

  test('normalizePlanRequest maps MCP formData', () => {
    const req = normalizePlanRequest({
      metadata: {
        parkCode: 'shen',
        formData: {
          startDate: '2026-10-15',
          numDays: 3,
          adults: 2,
          maxHikeMiles: 3,
          difficulty: ['easy', 'moderate'],
          sunrise: true,
        },
      },
    });
    expect(req.parkCode).toBe('shen');
    expect(req.numberOfDays).toBe(3);
    expect(req.maxHikeMiles).toBe(3);
  });

  test('validatePlanRequest requires travel period', () => {
    expect(() =>
      validatePlanRequest({
        ...shenRequest,
        startDate: null,
        travelMonth: null,
      })
    ).toThrow(expect.objectContaining({ code: 'MISSING_TRAVEL_DATE' }));
  });

  test('buildDeterministicItinerary respects three-mile cap', () => {
    const built = buildDeterministicItinerary({
      parkCode: 'shen',
      parkName: 'Shenandoah National Park',
      request: shenRequest,
      alerts: [],
      weather: { fetchedAt: new Date().toISOString() },
      events: [],
    });
    const trailStops = built.days.flatMap((d) => d.stops).filter((s) => s.type === 'trail');
    for (const stop of trailStops) {
      expect(stop.distanceMiles == null || stop.distanceMiles <= 3).toBe(true);
    }
  });

  test('buildDeterministicItinerary avoids duplicate locations', () => {
    const built = buildDeterministicItinerary({
      parkCode: 'shen',
      parkName: 'Shenandoah National Park',
      request: shenRequest,
      alerts: [],
      weather: null,
      events: [],
    });
    const names = built.days
      .flatMap((d) => d.stops.map((s) => s.name))
      .filter((name) => !/lunch break/i.test(name));
    expect(new Set(names).size).toBe(names.length);
  });

  test('relaxed afternoon appears on day 2', () => {
    const built = buildDeterministicItinerary({
      parkCode: 'shen',
      parkName: 'Shenandoah National Park',
      request: shenRequest,
      alerts: [],
      weather: null,
      events: [],
    });
    const day2 = built.days.find((d) => d.dayNumber === 2);
    expect(day2.stops.some((s) => /relaxed afternoon/i.test(s.name))).toBe(true);
  });

  test('applyRevision preserves other days and relaxes day 2 afternoon', () => {
    const base = buildDeterministicItinerary({
      parkCode: 'shen',
      parkName: 'Shenandoah National Park',
      request: shenRequest,
      alerts: [],
      weather: null,
      events: [],
    });
    const revised = applyRevision(
      base,
      'Make Day 2 a relaxed afternoon while preserving the rest of the itinerary.'
    );
    expect(revised.days).toHaveLength(3);
    const day1Names = revised.days[0].stops.map((s) => s.name);
    const day2 = revised.days[1];
    expect(day2.stops.some((s) => /relaxed afternoon/i.test(s.name))).toBe(true);
    expect(day1Names.length).toBeGreaterThan(0);
  });

  test('filterCandidateStops for Acadia easy hikes', () => {
    const stops = filterCandidateStops('acad', {
      maxHikeMiles: 3.5,
      difficulty: ['easy'],
      interests: ['photography'],
    });
    expect(stops.length).toBeGreaterThan(0);
    expect(stops.every((s) => s.type !== 'trail' || s.difficulty === 'easy')).toBe(true);
  });

  test('buildDeterministicItinerary succeeds without weather/events', () => {
    const built = buildDeterministicItinerary({
      parkCode: 'acad',
      parkName: 'Acadia National Park',
      request: {
        ...shenRequest,
        parkCode: 'acad',
        parkName: 'Acadia National Park',
        relaxedAfternoon: false,
      },
      alerts: [],
      weather: null,
      events: [],
    });
    expect(built.unverified).toEqual(
      expect.arrayContaining(['weather forecast', 'scheduled ranger programs'])
    );
    expect(built.days).toHaveLength(3);
  });

  test('relaxed afternoon constraint does not trigger revision mode', () => {
    const req = normalizePlanRequest({
      messages: [
        {
          role: 'user',
          content:
            'Plan a 3-day itinerary for shen starting 2026-10-15 with one relaxed afternoon.',
        },
      ],
      metadata: { parkCode: 'shen', formData: { startDate: '2026-10-15', numDays: 3 } },
    });
    expect(req.revisionRequest).toBeNull();
  });
});

describe('executePlanItineraryRequest AI fallback', () => {
  jest.resetModules();
  jest.doMock('../npsService', () => ({
    getParkByCode: jest.fn().mockResolvedValue({ fullName: 'Shenandoah National Park' }),
    getParkAlerts: jest.fn().mockResolvedValue([]),
    getEventsByPark: jest.fn().mockResolvedValue([]),
  }));
  jest.doMock('../enhancedParkService', () => ({
    getWeatherData: jest.fn().mockResolvedValue({ temp: 55 }),
  }));
  jest.doMock('../trailieLiteLlm', () => ({
    trailieLiteComplete: jest.fn(() => new Promise(() => {})),
  }));

  const { executePlanItineraryRequest } = require('../fastItineraryPlannerService');

  test('returns deterministic itinerary when AI refinement times out', async () => {
    const result = await executePlanItineraryRequest({
      query: {},
      body: {
        metadata: {
          parkCode: 'shen',
          formData: {
            startDate: '2026-10-15',
            numDays: 3,
            adults: 2,
            maxHikeMiles: 3,
            difficulty: ['easy', 'moderate'],
          },
        },
      },
    });
    expect(result.hasItinerary).toBe(true);
    expect(result.itinerary.days).toHaveLength(3);
    expect(result.content).toMatch(/Shenandoah/i);
  }, 15000);
});
