const {
  isClosureCategory,
  isGenericClosureAlert,
  isRoadRelatedAlert,
} = require('../npsAlertUtils');

describe('npsAlertUtils', () => {
  test('isClosureCategory matches Park Closure', () => {
    expect(isClosureCategory('Park Closure')).toBe(true);
    expect(isClosureCategory('Closure')).toBe(true);
    expect(isClosureCategory('Caution')).toBe(false);
  });

  test('isGenericClosureAlert flags boilerplate NPS section titles', () => {
    expect(isGenericClosureAlert('Critical Backcountry Updates/Closures')).toBe(true);
    expect(isGenericClosureAlert('Angels Landing Trail is closed')).toBe(false);
  });

  test('isRoadRelatedAlert matches GTSR alert', () => {
    const alert = {
      title: 'Going-to-the-Sun Road Spring Status',
      description: 'open to Avalanche Creek on the west side',
      category: 'Park Closure',
    };
    expect(
      isRoadRelatedAlert(alert, 'is Going-to-the-Sun Road open right now in Glacier National Park?')
    ).toBe(true);
  });
});
