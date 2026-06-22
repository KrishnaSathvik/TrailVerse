process.env.NPS_API_KEY = process.env.NPS_API_KEY || 'test-nps-key-for-unit-tests';

const npsService = require('../npsService');

describe('npsService bulk snapshot helpers', () => {
  it('reads grouped bulk data by park code', () => {
    const slice = npsService._getGroupedBulkSlice(
      { yell: [{ id: 1 }, { id: 2 }], yose: [{ id: 3 }] },
      'yell'
    );
    expect(slice).toHaveLength(2);
  });

  it('filters flat bulk activities by park code', () => {
    const slice = npsService._getGroupedBulkSlice(
      [
        { id: 1, parkCode: 'yell' },
        { id: 2, parkCode: 'yose' },
        { id: 3, parkCode: 'yell' },
      ],
      'yell'
    );
    expect(slice).toHaveLength(2);
  });
});
