const fixtures = require('./fixtures/gtfs-parser-compatibility.json');
const { parse } = require('csv-parse/sync');
const unzipper = require('unzipper');
const service = require('../gtfsFeedService');

const options = { columns: true, skip_empty_lines: true, relax_quotes: true, relax_column_count: true, bom: true, trim: true };

describe('GTFS parser security-upgrade compatibility', () => {
  test.each(fixtures)('$name', ({ csv, expected, error }) => {
    if (error) {
      expect(() => parse(csv, options)).toThrow(expect.objectContaining({ code: error }));
    } else {
      expect(parse(csv, options)).toEqual(expected);
    }
  });

  it('keeps a prototype-like column as data without changing the record prototype', () => {
    const [row] = parse('__proto__,stop_id\nvalue,s1\n', options);
    expect(Object.getPrototypeOf(row)).toBe(Object.prototype);
    expect(Object.prototype.hasOwnProperty.call(row, '__proto__')).toBe(true);
    expect(row.__proto__).toBe('value');
    expect(row.stop_id).toBe('s1');
  });

  describe('real GTFS ingestion service', () => {
    const originalFetch = global.fetch;
    let files;
    beforeEach(() => {
      files = {
        'agency.txt': '\uFEFFagency_id,agency_name,agency_url,agency_timezone\r\na1,Shuttle,https://example.test,UTC\r\n',
        'routes.txt': 'route_id,route_short_name,route_long_name,route_type\nr1,S,"Shuttle, North",3\n',
        'trips.txt': 'route_id,service_id,trip_id\nr1,svc,t1\n',
        'stops.txt': 'stop_id,stop_name\ns1,"Visitor, Center"\ns2,"Upper\nStop"\n',
        'stop_times.txt': 'trip_id,arrival_time,departure_time,stop_id,stop_sequence\nt1,25:00:00,25:01:00,s1,1\nt1,25:20:00,25:21:00,s2,2\n',
        'calendar.txt': 'service_id,monday,tuesday,wednesday,thursday,friday,saturday,sunday,start_date,end_date\nsvc,1,1,1,1,1,1,1,20200101,20991231\n',
        'calendar_dates.txt': 'service_id,date,exception_type\n',
      };
      service._cache.clear(); service._inFlight.clear();
      global.fetch = jest.fn().mockResolvedValue({ ok: true, arrayBuffer: async () => new ArrayBuffer(0) });
      jest.spyOn(unzipper.Open, 'buffer').mockImplementation(async () => ({ files: Object.entries(files).map(([path, content]) => ({ type: 'File', path, buffer: async () => Buffer.from(content) })) }));
    });
    afterEach(() => { global.fetch = originalFetch; jest.restoreAllMocks(); service._cache.clear(); service._inFlight.clear(); });

    it('preserves route/stop meaning, dates, timezone and cache behavior across all seven GTFS tables', async () => {
      const feed = await service.getParsedFeed('https://example.test/fixture.zip');
      expect(feed.agencyTimeZone).toBe('UTC');
      expect(feed.summary.counts).toEqual({ routes: 1, stops: 2, trips: 1, stopTimes: 2 });
      expect(feed.summary.routes[0]).toEqual(expect.objectContaining({ routeId: 'r1', longName: 'Shuttle, North', stops: ['Visitor, Center', 'Upper\nStop'], keyStops: ['Visitor, Center', 'Upper\nStop'] }));
      expect(feed.serviceToday.hasService).toBe(true);
      expect(feed.season.seasonStart.toISOString()).toBe('2020-01-01T00:00:00.000Z');
      expect((await service.getParsedFeed('https://example.test/fixture.zip')).cached).toBe(true);
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    it('rejects an unclosed field and does not cache the malformed feed', async () => {
      files['stops.txt'] = 'stop_id,stop_name\ns1,"unfinished';
      await expect(service.getParsedFeed('https://example.test/bad.zip')).rejects.toMatchObject({ code: 'CSV_QUOTE_NOT_CLOSED' });
      expect(service._cache.size).toBe(0);
      expect(service._inFlight.size).toBe(0);
    });

    it('propagates a failed download before parsing', async () => {
      global.fetch.mockResolvedValue({ ok: false, status: 503 });
      await expect(service.getParsedFeed('https://example.test/fail.zip')).rejects.toThrow('Failed to fetch GTFS zip: 503');
      expect(unzipper.Open.buffer).not.toHaveBeenCalled();
    });
  });
});
