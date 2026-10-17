'use strict';

const { mapStayPreference } = require('../stayPreferenceMapper');

describe('mapStayPreference', () => {
  test('lodge → lodging + lodge', () => {
    expect(mapStayPreference({ rawAccommodation: 'lodge' })).toEqual({
      accommodationClass: 'lodging',
      stayPreference: 'lodge',
    });
  });

  test('hotel → lodging + hotel', () => {
    expect(mapStayPreference({ rawAccommodation: 'hotel' })).toEqual({
      accommodationClass: 'lodging',
      stayPreference: 'hotel',
    });
  });

  test('rv as campsite → camping + rv', () => {
    expect(mapStayPreference({ rawAccommodation: 'rv' })).toEqual({
      accommodationClass: 'camping',
      stayPreference: 'rv',
    });
  });

  test('traveling in an RV without stay cue does not force camping', () => {
    expect(mapStayPreference({
      messageText: 'We are traveling in a 30-foot RV from Denver',
      rawAccommodation: null,
    })).toEqual({
      accommodationClass: 'unknown',
      stayPreference: 'unknown',
    });
  });

  test('want RV campsite sets rv preference', () => {
    expect(mapStayPreference({
      messageText: 'We want an RV campsite with hookups',
      rawAccommodation: null,
    })).toEqual({
      accommodationClass: 'camping',
      stayPreference: 'rv',
    });
  });

  test('airbnb → lodging + vacation_rental', () => {
    expect(mapStayPreference({ rawAccommodation: 'airbnb' })).toEqual({
      accommodationClass: 'lodging',
      stayPreference: 'vacation_rental',
    });
  });

  test('RV as vehicle plus hotel cue prefers hotel', () => {
    expect(mapStayPreference({
      messageText: "We're traveling in our RV but want a hotel near the park",
      rawAccommodation: null,
    })).toEqual({
      accommodationClass: 'lodging',
      stayPreference: 'hotel',
    });
  });
});
