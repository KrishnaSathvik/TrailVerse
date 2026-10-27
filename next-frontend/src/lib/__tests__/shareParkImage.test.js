import { describe, expect, it } from 'vitest';
import { pickDiscoverShareImage, pickListedParkImage, pickStateParkImage } from '../shareParkImage';

const photo = (url) => [{ url }];

describe('pickStateParkImage', () => {
  const parks = [
    { parkCode: 'brca', fullName: 'Bryce Canyon National Park', states: 'UT', designation: 'National Park', images: photo('https://example.com/bryce.jpg') },
    { parkCode: 'zion', fullName: 'Zion National Park', states: 'UT', designation: 'National Park', images: photo('https://example.com/zion.jpg') },
    { parkCode: 'arch', fullName: 'Arches National Park', states: 'UT', designation: 'National Park', images: photo('https://example.com/arches.jpg') },
    { parkCode: 'glca', fullName: 'Glen Canyon National Recreation Area', states: 'AZ,UT', designation: 'National Recreation Area', images: photo('https://example.com/glen.jpg') },
    { parkCode: 'yell', fullName: 'Yellowstone National Park', states: 'ID,MT,WY', designation: 'National Park', images: photo('https://example.com/yell.jpg') },
    { parkCode: 'fodu', fullName: 'Fort Union Trading Post', states: 'MT,ND', designation: 'National Historic Site', images: photo('https://example.com/fort.jpg') },
  ];

  it('uses the alphabetically first national park that belongs only to the state', () => {
    expect(pickStateParkImage(parks, 'UT', 'Utah')).toEqual({
      url: 'https://example.com/arches.jpg',
      alt: 'Arches National Park in Utah',
    });
  });

  it('uses a national park shared with another state when the state has none of its own', () => {
    expect(pickStateParkImage(parks, 'WY', 'Wyoming')).toEqual({
      url: 'https://example.com/yell.jpg',
      alt: 'Yellowstone National Park in Wyoming',
    });
  });

  it('uses any site photo when the state has no national park photo', () => {
    expect(pickStateParkImage(parks, 'ND', 'North Dakota')).toEqual({
      url: 'https://example.com/fort.jpg',
      alt: 'Fort Union Trading Post in North Dakota',
    });
  });

  it('returns null when no park has a photo', () => {
    expect(pickStateParkImage([{ fullName: 'Empty', states: 'UT', designation: 'National Park', images: [] }], 'UT', 'Utah')).toBeNull();
  });
});

describe('pickListedParkImage', () => {
  it('keeps the featured park order and skips parks without a photo', () => {
    expect(pickListedParkImage([
      { fullName: 'No Photo', images: [] },
      { fullName: 'Acadia National Park', images: photo('https://example.com/acad.jpg') },
    ])).toEqual({ url: 'https://example.com/acad.jpg', alt: 'Acadia National Park' });
  });
});

describe('pickDiscoverShareImage', () => {
  it('prefers a featured park photo over the alphabetical list', () => {
    expect(pickDiscoverShareImage({
      featured: { parks: [{ parkCode: 'yose', fullName: 'Yosemite National Park', images: photo('https://example.com/yose.jpg') }] },
      parks: [{ parkCode: 'acad', fullName: 'Acadia National Park', images: photo('https://example.com/acad.jpg') }],
    })).toEqual({ url: 'https://example.com/yose.jpg', alt: 'Yosemite National Park' });
  });
});
